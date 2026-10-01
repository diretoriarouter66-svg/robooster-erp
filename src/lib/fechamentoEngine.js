/**
 * ROBOOSTER ERP — Fechamento da operação de importação com VALORES REAIS (01/10/2026).
 *
 * Reproduz a conta da planilha de custo do Mauricio (Navio 15/16), que é a referência:
 *   custo final unitário = ( FOB real em R$  +  rateio das despesas gerais  +  impostos reais do item ) / qtd
 *   · FOB real em R$      = preço realmente pago (US$) × câmbio MÉDIO PONDERADO das remessas
 *   · despesas gerais     = tudo que não é imposto (frete internacional pago ao forwarder, armazenagem,
 *                           frete rodoviário, SDA, desembaraço, Siscomex, AFRMM, destruição de madeira,
 *                           tarifa bancária, ajudante, "outras"), rateadas pelo % do FOB real em R$
 *                           (critério "valor"; "peso" disponível como opção) — só entre itens embarcados
 *                           e marcados como rateáveis;
 *   · impostos do item    = II + IPI + PIS + COFINS (da DI, por item) + ICMS (DI/Draft/digitado).
 *                           No Simples Nacional não há crédito: TUDO é custo (regra do simportEngine).
 *                           Presumido: ICMS e IPI recuperável ficam fora do custo (viram crédito).
 *   · item "não embarcou" (pago e ficou para o próximo navio) sai do custo e do rateio; o valor pago
 *     fica registrado para ser carregado para a próxima operação.
 *
 * Nada aqui grava no banco: recebe o estado da tela e devolve o resultado. Quem grava é a página.
 */

const r2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
const n = (v) => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };

/** Câmbio médio ponderado das remessas (R$ por US$), incluindo tarifas — igual à aba "Dólar". */
export function cambioMedioRemessas(remessas) {
  const rs = (remessas || []).filter(r => n(r.valor_usd) > 0 && n(r.cotacao) > 0);
  if (!rs.length) return 0;
  const usd = rs.reduce((s, r) => s + n(r.valor_usd), 0);
  const brl = rs.reduce((s, r) => s + n(r.valor_usd) * n(r.cotacao) + n(r.taxas_brl), 0);
  return usd > 0 ? brl / usd : 0;
}

/** Tipos de despesa que a tela oferece (os que aparecem nos numerários/fechamentos reais). */
export const TIPOS_DESPESA = [
  { tipo: "frete_internacional", rotulo: "Frete internacional (fatura do forwarder)" },
  { tipo: "siscomex", rotulo: "Taxa Siscomex" },
  { tipo: "afrmm", rotulo: "AFRMM" },
  { tipo: "armazenagem", rotulo: "Armazenagem" },
  { tipo: "frete_rodoviario", rotulo: "Frete rodoviário (CT-e)" },
  { tipo: "sda", rotulo: "Taxa SDA" },
  { tipo: "desembaraco", rotulo: "Desembaraço / honorários do despachante" },
  { tipo: "capatazia", rotulo: "Capatazia / THC" },
  { tipo: "destruicao_madeira", rotulo: "Destruição de madeira / fumigação" },
  { tipo: "icms_complementar", rotulo: "ICMS complementar" },
  { tipo: "seguro", rotulo: "Seguro internacional" },
  { tipo: "declaracao_aduaneira", rotulo: "Declaração aduaneira do fornecedor" },
  { tipo: "tarifa_bancaria", rotulo: "Tarifa bancária das remessas" },
  { tipo: "ajudante", rotulo: "Ajudante / descarga" },
  { tipo: "outras", rotulo: "Outras despesas" },
];

/**
 * @param {object} p
 * @param {Array}  p.itens      itens da operação: { chave, product_id, nome, qty, custo_usd (FOB real), peso_kg,
 *                               nao_embarcou, nao_declarado, di_chaves: [chaves de itens da DI casados],
 *                               icms_brl (override manual, opcional), estimado: {custo_unitario, total} }
 * @param {Array}  p.itensDI    itens achatados da DI (itensDaDI): { chave, qtd, total_usd, va_brl, ii, ipi, pis, cofins, icms, peso_liquido }
 * @param {Array}  p.despesas   { tipo, descricao, previsto_brl, real_brl, rateavel (bool), criterio ('valor'|'peso') }
 * @param {number} p.cambioMedio câmbio médio das remessas
 * @param {object} p.config     { regime: 'simples'|'presumido', ipi_recuperavel: bool }
 */
export function calcularFechamento({ itens, itensDI, despesas, cambioMedio, config }) {
  const regime = config?.regime || "simples";
  const porChave = Object.fromEntries((itensDI || []).map(d => [d.chave, d]));
  const usados = new Set();

  // 1) Impostos reais por item: soma dos itens da DI casados a ele
  const linhas = (itens || []).map(it => {
    const qty = n(it.qty);
    const fob_usd = n(it.custo_usd) * qty;
    const fob_brl = r2(fob_usd * cambioMedio);
    let ii = 0, ipi = 0, pis = 0, cofins = 0, icmsDI = 0, va = 0, qtdDI = 0, declarado_usd = 0, temIcmsDI = false, frete_di = 0, seguro_di = 0;
    for (const ch of it.di_chaves || []) {
      const d = porChave[ch]; if (!d) continue;
      usados.add(ch);
      ii += d.ii; ipi += d.ipi; pis += d.pis; cofins += d.cofins; va += d.va_brl; qtdDI += d.qtd; declarado_usd += d.total_usd;
      frete_di += d.frete_brl || 0; seguro_di += d.seguro_brl || 0;
      if (d.icms != null) { icmsDI += d.icms; temIcmsDI = true; }
    }
    const icms = it.icms_brl != null && it.icms_brl !== "" ? n(it.icms_brl) : (temIcmsDI ? icmsDI : 0);
    return { ...it, qty, fob_usd: r2(fob_usd), fob_brl, ii: r2(ii), ipi: r2(ipi), pis: r2(pis), cofins: r2(cofins), icms: r2(icms), icms_origem: it.icms_brl != null && it.icms_brl !== "" ? "digitado" : (temIcmsDI ? "DI" : "sem"), va_brl: r2(va), qtd_di: qtdDI, declarado_usd: r2(declarado_usd), frete_di_brl: r2(frete_di), seguro_di_brl: r2(seguro_di) };
  });

  // 2) Rateio das despesas gerais (só itens embarcados e rateáveis)
  const embarcados = linhas.filter(l => !l.nao_embarcou && l.qty > 0);
  const baseValor = embarcados.reduce((s, l) => s + l.fob_brl, 0) || 1;
  const basePeso = embarcados.reduce((s, l) => s + n(l.peso_kg) * l.qty, 0) || 1;
  const despReal = (despesas || []).map(d => ({ ...d, real_brl: r2(d.real_brl), previsto_brl: r2(d.previsto_brl) }));
  const totalRateavelValor = despReal.filter(d => d.rateavel !== false && (d.criterio || "valor") === "valor").reduce((s, d) => s + d.real_brl, 0);
  const totalRateavelPeso = despReal.filter(d => d.rateavel !== false && d.criterio === "peso").reduce((s, d) => s + d.real_brl, 0);
  const naoRateavel = despReal.filter(d => d.rateavel === false).reduce((s, d) => s + d.real_brl, 0);

  for (const l of linhas) {
    if (l.nao_embarcou || l.qty <= 0) { l.rateio_brl = 0; l.pct_valor = 0; continue; }
    l.pct_valor = l.fob_brl / baseValor;
    const pctPeso = (n(l.peso_kg) * l.qty) / basePeso;
    l.rateio_brl = r2(totalRateavelValor * l.pct_valor + totalRateavelPeso * pctPeso);
  }

  // 3) Custo final por item (regra do regime)
  const incluiIcms = regime === "simples";
  const incluiIpi = regime === "simples" || config?.ipi_recuperavel === false;
  for (const l of linhas) {
    l.impostos_custo = r2(l.ii + l.pis + l.cofins + (incluiIpi ? l.ipi : 0) + (incluiIcms ? l.icms : 0));
    l.impostos_total = r2(l.ii + l.ipi + l.pis + l.cofins + l.icms);
    if (l.nao_embarcou || l.qty <= 0) { l.custo_total = 0; l.custo_unitario = 0; }
    else {
      l.custo_total = r2(l.fob_brl + l.rateio_brl + l.impostos_custo);
      l.custo_unitario = r2(l.custo_total / l.qty);
    }
    const estU = n(l.estimado?.custo_unitario);
    l.estimado_unitario = estU;
    l.diferenca_unitaria = estU ? r2(l.custo_unitario - estU) : null;
    l.diferenca_pct = estU ? r2((l.custo_unitario - estU) / estU * 100) : null;
  }

  // 4) Totais e conferências
  const soma = (k, arr = linhas) => r2(arr.reduce((s, l) => s + (l[k] || 0), 0));
  const diTot = {
    ii: soma("ii", itensDI || []), ipi: soma("ipi", itensDI || []), pis: soma("pis", itensDI || []), cofins: soma("cofins", itensDI || []),
    icms: r2((itensDI || []).reduce((s, d) => s + (d.icms || 0), 0)),
  };
  const naoCasados = (itensDI || []).filter(d => !usados.has(d.chave));
  const totais = {
    fob_usd: soma("fob_usd", embarcados), fob_brl: soma("fob_brl", embarcados),
    nao_embarcado_usd: soma("fob_usd", linhas.filter(l => l.nao_embarcou)),
    ii: soma("ii", embarcados), ipi: soma("ipi", embarcados), pis: soma("pis", embarcados), cofins: soma("cofins", embarcados), icms: soma("icms", embarcados),
    impostos_custo: soma("impostos_custo", embarcados),
    despesas_rateadas: r2(totalRateavelValor + totalRateavelPeso), despesas_nao_rateadas: r2(naoRateavel),
    despesas_previsto: soma("previsto_brl", despReal), despesas_real: soma("real_brl", despReal),
    custo_total: soma("custo_total", embarcados),
    estimado_total: r2(embarcados.reduce((s, l) => s + n(l.estimado?.custo_unitario) * l.qty, 0)),
  };
  totais.diferenca_total = totais.estimado_total ? r2(totais.custo_total - totais.estimado_total) : null;
  const avisos = [];
  if (naoCasados.length) avisos.push(`${naoCasados.length} item(ns) da DI sem produto da operação: ${naoCasados.map(d => d.descricao.slice(0, 40)).join("; ")}.`);
  const semDI = embarcados.filter(l => !(l.di_chaves || []).length && !l.nao_declarado);
  if (semDI.length) avisos.push(`${semDI.length} produto(s) embarcado(s) sem item da DI casado (ficam sem imposto): ${semDI.map(l => l.nome).join("; ")}.`);
  for (const l of embarcados) if (l.qtd_di && Math.abs(l.qtd_di - l.qty) > 0.001) avisos.push(`${l.nome}: quantidade na operação ${l.qty} × na DI ${l.qtd_di}.`);
  const semIcms = embarcados.filter(l => (l.di_chaves || []).length && l.icms_origem === "sem");
  if (incluiIcms && semIcms.length) avisos.push(`${semIcms.length} item(ns) sem ICMS (a DI não trouxe por adição): digite o ICMS do Draft do despachante.`);
  return { linhas, totais, di_totais: diTot, nao_casados: naoCasados, avisos, regime, cambio_medio: cambioMedio };
}

/** Sugestão automática de casamento produto × item da DI (NCM igual + palavras do nome / quantidade). */
export function sugerirCasamento(itensOperacao, itensDI, produtosPorId) {
  const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ");
  const PARAR = new Set(["para", "com", "de", "da", "do", "e", "tipo", "modelo", "serie", "automatica", "automatico", "industrial", "maquina", "the", "and", "220v", "110v", "380v", "new", "model", "mm"]);
  const tokens = (s) => new Set(norm(s).split(/\s+/).filter(w => w.length >= 3 && !PARAR.has(w)));
  // modelo = letras+números ("wf802", "dw1800", "3040", "my04"), nunca tensão/potência ("220v", "3cv", "2200w")
  const modelos = (s) => [...norm(s).replace(/[\s-]/g, " ").matchAll(/\b(?:[a-z]{1,3}\d{2,4}[a-z]?|\d{3,4}[a-z]?)\b/g)].map(m => m[0]).filter(m => !/^\d{2,4}(v|w|cv|hz|kg|mm|l)$/.test(m) && !/^\d{3}v$/.test(m));
  const livres = new Set((itensDI || []).map(d => d.chave));
  const out = {};
  const ordenados = [...(itensOperacao || [])].sort((a, b) => (parseFloat(b.custo_usd) || 0) - (parseFloat(a.custo_usd) || 0));
  for (const it of ordenados) {
    const prod = produtosPorId?.[it.product_id] || {};
    const ncmProd = (prod.ncm || "").replace(/\D/g, "");
    const nome = it.nome || it.product_name || prod.name || "";
    const tk = tokens(nome); const mods = modelos(nome);
    let melhor = null, melhorPts = 0;
    for (const d of itensDI || []) {
      if (!livres.has(d.chave)) continue;
      const dn = norm(d.descricao).replace(/[\s-]/g, "");
      let pts = 0, sinais = 0;
      if (ncmProd && d.ncm === ncmProd) { pts += 3; sinais++; }
      if (Math.abs(d.qtd - (parseFloat(it.qty) || 0)) < 0.001) { pts += 1; sinais++; }
      if (it.declarado_op_usd && Math.abs(d.vucv_usd - it.declarado_op_usd) < 0.01) { pts += 4; sinais++; } // declarado no simulador = VUCV da DI (sinal forte: veio da invoice)
      const dt = tokens(d.descricao); let comuns = 0; for (const w of tk) if (dt.has(w)) comuns++;
      if (comuns) { pts += Math.min(comuns, 3); sinais++; }
      if (mods.some(m => dn.includes(m))) { pts += 4; sinais++; }
      if (pts > melhorPts) { melhorPts = pts; melhor = d; }
    }
    // exige pelo menos 2 sinais independentes ou um modelo + NCM — menos que isso é chute, e chute errado custa caro
    if (melhor && melhorPts >= 5) { out[it.chave] = [melhor.chave]; livres.delete(melhor.chave); }
  }
  return out;
}
