/**
 * ROBOOSTER ERP — Leitor do XML da Declaração de Importação (Siscomex).
 *
 * Fechamento com valores reais (01/10/2026). O despachante entrega o XML da DI em um
 * de dois layouts, e os dois aparecem nos processos da Saber/Router:
 *   · "extrato"      → <ListaDeclaracoes><declaracaoImportacao> … campos nomeados
 *                       (iiAliquotaValorRecolher, freteValorReais, mercadoria/valorUnitario…)
 *   · "transmissão"  → <ListaDeclaracoesTransmissao><declaracao> … tributo[] por código
 *                       de receita (0001 II, 0002 IPI, 0005 PIS, 0006 COFINS) e
 *                       mercadoria/valorUnidadeMedidaCondicaoVenda.
 * Os números vêm como inteiros com casas implícitas: valores em R$/moeda = 2 casas,
 * alíquotas = 2 casas (01120 → 11,20 %), quantidades e pesos = 5 casas, valor unitário
 * da mercadoria = 7 casas.
 *
 * Saída normalizada (um único formato para a tela e para o motor de fechamento):
 * {
 *   layout, numero_di, data_registro, importador_cnpj, importador_nome, ref_despachante,
 *   cambio_di, incoterm, via, navio, bl, data_embarque, data_chegada, peso_bruto, peso_liquido,
 *   totais: { fob_usd, fob_brl, frete_usd, frete_brl, seguro_usd, seguro_brl, acrescimo_brl,
 *             va_brl, ii, ipi, pis, cofins, siscomex, afrmm, icms, antidumping },
 *   adicoes: [{ numero, ncm, fornecedor, incoterm, vcmv_usd, vcmv_brl, peso_liquido,
 *               frete_brl, seguro_brl, acrescimo_brl, va_brl,
 *               ii: {aliq, valor}, ipi: {aliq, valor}, pis: {aliq, valor}, cofins: {aliq, valor},
 *               mercadorias: [{ seq, descricao, qtd, unidade, vucv_usd, total_usd }] }],
 *   faturas: [string], avisos: [string]
 * }
 */

const num = (txt, casas = 2) => {
  if (txt == null) return 0;
  const s = String(txt).trim();
  if (!s) return 0;
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10) / Math.pow(10, casas);
  const v = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(v) ? 0 : v;
};
const txt = (el, tag) => (el?.getElementsByTagName(tag)?.[0]?.textContent ?? "").trim();
const filhos = (el, tag) => Array.from(el?.getElementsByTagName(tag) || []).filter(n => n.parentNode === el);
const data8 = (s) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s || "");
const r2 = (v) => Math.round((v || 0) * 100) / 100;

/** Lê "FOB....: 220 DOLAR DOS EUA 4,9928000", "AFRMM RECOLHIDO..: R$ 49,06", "TOTAL ICMS..: R$ 7.125,37"
 *  do texto livre de informações complementares (padrão PESTI/Sicoex). Outros despachantes
 *  escrevem diferente — o que não for achado fica em branco para digitar. */
function lerInformacoesComplementares(texto) {
  const out = { cambio_di: 0, afrmm: 0, icms: 0, icms_por_adicao: [], icms_grupos: [], siscomex: 0, capatazia: 0, ref_despachante: "" };
  if (!texto) return out;
  const t = texto.replace(/\r/g, "");
  const brl = (re) => { const m = t.match(re); return m ? num(m[1]) : 0; };
  // Câmbio: PESTI escreve "FOB....: 220 DOLAR DOS EUA 4,9928000"; Golden escreve "TAXA USD : 5,6394"
  const mCambio = t.match(/FOB[.\s]*:\s*\d{3}\s+[A-Z\s]+?\s([0-9]+,[0-9]{3,7})/i) || t.match(/TAXA\s+USD\s*:\s*([0-9]+,[0-9]{3,7})/i);
  if (mCambio) out.cambio_di = parseFloat(mCambio[1].replace(",", "."));
  out.afrmm = brl(/AFRMM[^:\n]*:\s*R\$\s*([0-9.]+,[0-9]{2})/i);
  // ICMS: PESTI dá o total ("TOTAL ICMS....: R$ 7.125,37"); Golden dá UMA linha por adição
  // ("ICMS : 12,00% RED : 0,00% R$ 19.310,92"), na ordem das adições.
  const linhasIcms = [...t.matchAll(/^\s*ICMS\s*:\s*[0-9]+,[0-9]{2}%\s*RED\s*:\s*[0-9]+,[0-9]{2}%\s*R\$\s*([0-9.]+,[0-9]{2})/gim)].map(m => num(m[1]));
  // Golden agrupa as adições por regime: "ICMS 001 - ... ALIQ.12%", "ICMS 002,003,005 - ... REDUCÃO", "ICMS 004,008,010 - ... 18%",
  // e depois dá um bloco de valores por grupo, na mesma ordem. Guardamos os grupos para ratear por adição.
  const grupos = [...t.matchAll(/^\s*ICMS\s+((?:\d{3})(?:\s*,\s*\d{3})*)\s*-/gim)].map(m => m[1].split(/\s*,\s*/).map(x => parseInt(x, 10)));
  if (linhasIcms.length) {
    out.icms = r2(linhasIcms.reduce((a, b) => a + b, 0));
    out.icms_grupos = grupos.length === linhasIcms.length ? grupos.map((ads, i) => ({ adicoes: ads, valor: linhasIcms[i] })) : [];
    out.icms_por_adicao = linhasIcms;
  } else out.icms = brl(/TOTAL ICMS[^:\n]*:\s*R\$\s*([0-9.]+,[0-9]{2})/i);
  out.siscomex = brl(/(?:TUS|TX\.?\s*SISCOMEX|TAXA SISCOMEX)[^:\n]*:\s*(?:R\$\s*)?([0-9.]+,[0-9]{2})/i);
  out.capatazia = brl(/CAPATAZIA[^:\n]*:\s*R\$\s*([0-9.]+,[0-9]{2})/i);
  const mRef = t.match(/N\/REF[.\s]*:\s*([^\n]+)/i) || t.match(/NOSSA REFERENCIA\s*:\s*([^\n]+)/i);
  if (mRef) out.ref_despachante = mRef[1].trim();
  return out;
}

/** ICMS por adição: linha por adição quando bate 1:1; senão, por grupo de regime, rateado pela base
 *  (VA + II + IPI + PIS + COFINS) de cada adição do grupo — mesma alíquota e mesma redução dentro do grupo. */
function distribuirIcms(adicoes, info) {
  if (info.icms_por_adicao.length === adicoes.length && !info.icms_grupos.length) { adicoes.forEach((a, i) => { a.icms_brl = info.icms_por_adicao[i]; a.icms_origem = "DI"; }); return; }
  for (const g of info.icms_grupos || []) {
    const membros = adicoes.filter(a => g.adicoes.includes(a.numero));
    const base = membros.reduce((s, a) => s + a.va_brl + a.ii.valor + a.ipi.valor + a.pis.valor + a.cofins.valor, 0) || 1;
    for (const a of membros) { a.icms_brl = r2(g.valor * (a.va_brl + a.ii.valor + a.ipi.valor + a.pis.valor + a.cofins.valor) / base); a.icms_origem = "DI (rateado no grupo)"; }
  }
}

function parseTransmissao(dec) {
  const info = lerInformacoesComplementares(txt(dec, "informacoesComplementares"));
  const pagamentos = filhos(dec, "pagamento").map(p => ({ receita: txt(p, "codigoReceitaPagamento"), valor: num(txt(p, "valorTributoPago")) }));
  const porReceita = (c) => pagamentos.filter(p => p.receita === c).reduce((s, p) => s + p.valor, 0);
  const adicoes = filhos(dec, "adicao").map(a => {
    const trib = {};
    for (const t of filhos(a, "tributo")) {
      const cod = txt(t, "codigoReceitaImposto");
      trib[cod] = { aliq: num(txt(t, "percentualAliquotaNormalAdval")), valor: num(txt(t, "valorIPTaRecolher")), base: num(txt(t, "valorBaseCalculoAdval")) };
    }
    const acrescimo_brl = filhos(a, "acrescimo").reduce((s, x) => s + num(txt(x, "valorAcrescimoMoedaNacional")), 0);
    const mercadorias = filhos(a, "mercadoria").map((m, i) => {
      const qtd = num(txt(m, "quantidadeMercadoriaUnidadeComercializada"), 5);
      const vucv = num(txt(m, "valorUnidadeMedidaCondicaoVenda"), 7);
      return { seq: i + 1, descricao: txt(m, "textoDetalhamentoMercadoria"), qtd, unidade: txt(m, "nomeUnidadeMedidaComercializada"), vucv_usd: vucv, total_usd: r2(qtd * vucv) };
    });
    return {
      numero: parseInt(txt(a, "numeroAdicao"), 10) || 0,
      ncm: txt(a, "codigoMercadoriaNCM"),
      fornecedor: txt(a, "nomeFornecedorEstrangeiro"),
      incoterm: txt(a, "codigoIncotermsVenda"),
      vcmv_usd: num(txt(a, "valorMercadoriaCondicaoVenda")),
      vcmv_brl: num(txt(a, "valorMercadoriaVendaMoedaNacional")),
      peso_liquido: num(txt(a, "pesoLiquidoMercadoria"), 5),
      frete_brl: num(txt(a, "valorFreteMercadoriaMoedaNacional")),
      seguro_brl: num(txt(a, "valorSeguroMercadoriaMoedaNacional")),
      acrescimo_brl,
      va_brl: trib["0001"]?.base || 0,
      ii: trib["0001"] || { aliq: 0, valor: 0 },
      ipi: trib["0002"] || { aliq: 0, valor: 0 },
      pis: trib["0005"] || { aliq: 0, valor: 0 },
      cofins: trib["0006"] || { aliq: 0, valor: 0 },
      mercadorias,
    };
  });
  distribuirIcms(adicoes, info);
  const soma = (k) => adicoes.reduce((s, a) => s + (a[k] || 0), 0);
  const somaT = (k) => adicoes.reduce((s, a) => s + (a[k]?.valor || 0), 0);
  const faturas = filhos(dec, "documentoInstrucaoDespacho").filter(d => txt(d, "codigoTipoDocumentoInstrucaoDespacho") === "01").map(d => txt(d, "numeroDocumentoInstrucaoDespacho"));
  const bl = filhos(dec, "documentoInstrucaoDespacho").find(d => txt(d, "codigoTipoDocumentoInstrucaoDespacho") === "28");
  return {
    layout: "transmissao",
    numero_di: txt(dec, "numeroDI") || "",
    data_registro: data8(txt(dec, "dataRegistro")),
    importador_cnpj: txt(dec, "numeroImportador"),
    importador_nome: txt(dec, "nomeImportador"),
    ref_despachante: txt(dec, "identificacaoDeclaracaoImportacao") || info.ref_despachante,
    cambio_di: info.cambio_di,
    incoterm: adicoes[0]?.incoterm || "",
    via: txt(dec, "codigoViaTransporte") === "01" ? "Marítima" : txt(dec, "codigoViaTransporte"),
    navio: txt(dec, "nomeVeiculoViaTransporte"),
    bl: bl ? txt(bl, "numeroDocumentoInstrucaoDespacho") : txt(dec, "numeroDocumentoCarga"),
    data_embarque: data8(txt(dec, "dataEmbarque")),
    data_chegada: data8(txt(dec, "dataChegadaCarga")),
    peso_bruto: num(txt(dec, "cargaPesoBruto"), 5),
    peso_liquido: num(txt(dec, "cargaPesoLiquido"), 5),
    totais: {
      fob_usd: r2(soma("vcmv_usd")),
      fob_brl: num(txt(dec, "valorTotalMLEMoedaNacional")) || r2(soma("vcmv_brl")),
      frete_usd: r2(num(txt(dec, "valorTotalFreteCollect")) + num(txt(dec, "valorTotalFretePrepaid"))),
      frete_brl: num(txt(dec, "valorTotalFreteMoedaNacional")),
      seguro_usd: num(txt(dec, "valorTotalSeguroMoedaNegociada")),
      seguro_brl: num(txt(dec, "valorTotalSeguroMoedaNacional")),
      acrescimo_brl: r2(soma("acrescimo_brl")),
      va_brl: r2(soma("va_brl")),
      ii: r2(porReceita("0086") || somaT("ii")),
      ipi: r2(porReceita("1038") || somaT("ipi")),
      pis: r2(porReceita("5602") || somaT("pis")),
      cofins: r2(porReceita("5629") || somaT("cofins")),
      siscomex: r2(porReceita("7811") || info.siscomex),
      afrmm: r2(info.afrmm),
      icms: r2(info.icms),
      antidumping: r2(porReceita("5529")),
    },
    adicoes,
    faturas,
    avisos: [],
  };
}

function parseExtrato(dec) {
  const info = lerInformacoesComplementares(txt(dec, "informacaoComplementar"));
  const pagamentos = filhos(dec, "pagamento").map(p => ({ receita: txt(p, "codigoReceita"), valor: num(txt(p, "valorReceita")) }));
  const porReceita = (c) => pagamentos.filter(p => p.receita === c).reduce((s, p) => s + p.valor, 0);
  const adicoes = filhos(dec, "adicao").map(a => {
    const mercadorias = filhos(a, "mercadoria").map((m, i) => {
      const qtd = num(txt(m, "quantidade"), 5);
      const vucv = num(txt(m, "valorUnitario"), 7);
      return { seq: parseInt(txt(m, "numeroSequencialItem"), 10) || i + 1, descricao: txt(m, "descricaoMercadoria"), qtd, unidade: txt(m, "unidadeMedida"), vucv_usd: vucv, total_usd: r2(qtd * vucv) };
    });
    const acrescimo_brl = filhos(a, "acrescimo").reduce((s, x) => s + num(txt(x, "valorReais")), 0);
    return {
      numero: parseInt(txt(a, "numeroAdicao"), 10) || 0,
      ncm: txt(a, "dadosMercadoriaCodigoNcm"),
      fornecedor: txt(a, "fornecedorNome"),
      incoterm: txt(a, "condicaoVendaIncoterm"),
      vcmv_usd: num(txt(a, "condicaoVendaValorMoeda")),
      vcmv_brl: num(txt(a, "condicaoVendaValorReais")),
      peso_liquido: num(txt(a, "dadosMercadoriaPesoLiquido"), 5),
      frete_brl: num(txt(a, "freteValorReais")),
      seguro_brl: num(txt(a, "seguroValorReais")),
      acrescimo_brl,
      va_brl: num(txt(a, "iiBaseCalculo")),
      ii: { aliq: num(txt(a, "iiAliquotaAdValorem")), valor: num(txt(a, "iiAliquotaValorRecolher")) },
      ipi: { aliq: num(txt(a, "ipiAliquotaAdValorem")), valor: num(txt(a, "ipiAliquotaValorRecolher")) },
      pis: { aliq: num(txt(a, "pisPasepAliquotaAdValorem")), valor: num(txt(a, "pisPasepAliquotaValorRecolher")) },
      cofins: { aliq: num(txt(a, "cofinsAliquotaAdValorem")), valor: num(txt(a, "cofinsAliquotaValorRecolher")) },
      mercadorias,
    };
  });
  distribuirIcms(adicoes, info);
  const soma = (k) => adicoes.reduce((s, a) => s + (a[k] || 0), 0);
  const somaT = (k) => adicoes.reduce((s, a) => s + (a[k]?.valor || 0), 0);
  const faturas = filhos(dec, "documentoInstrucaoDespacho").filter(d => /FATURA/i.test(txt(d, "nomeDocumentoDespacho"))).map(d => txt(d, "numeroDocumentoDespacho"));
  const icmsEl = dec.getElementsByTagName("icms")?.[0];
  return {
    layout: "extrato",
    numero_di: txt(dec, "numeroDI"),
    data_registro: data8(txt(dec, "dataRegistro")),
    importador_cnpj: txt(dec, "importadorNumero"),
    importador_nome: txt(dec, "importadorNome"),
    ref_despachante: info.ref_despachante,
    cambio_di: info.cambio_di || (num(txt(dec, "localEmbarqueTotalDolares")) > 0 ? r2(num(txt(dec, "localEmbarqueTotalReais")) / num(txt(dec, "localEmbarqueTotalDolares")) * 10000) / 10000 : 0),
    incoterm: adicoes[0]?.incoterm || "",
    via: txt(dec, "viaTransporteNome"),
    navio: txt(dec, "viaTransporteNomeVeiculo"),
    bl: txt(dec, "conhecimentoCargaId"),
    data_embarque: data8(txt(dec, "conhecimentoCargaEmbarqueData")),
    data_chegada: data8(txt(dec, "cargaDataChegada")),
    peso_bruto: num(txt(dec, "cargaPesoBruto"), 5),
    peso_liquido: num(txt(dec, "cargaPesoLiquido"), 5),
    totais: {
      fob_usd: num(txt(dec, "localEmbarqueTotalDolares")) || r2(soma("vcmv_usd")),
      fob_brl: num(txt(dec, "localEmbarqueTotalReais")) || r2(soma("vcmv_brl")),
      frete_usd: num(txt(dec, "freteTotalDolares")),
      frete_brl: num(txt(dec, "freteTotalReais")),
      seguro_usd: num(txt(dec, "seguroTotalDolares")),
      seguro_brl: num(txt(dec, "seguroTotalReais")),
      acrescimo_brl: r2(soma("acrescimo_brl")),
      va_brl: r2(soma("va_brl")),
      ii: r2(porReceita("0086") || somaT("ii")),
      ipi: r2(porReceita("1038") || somaT("ipi")),
      pis: r2(porReceita("5602") || somaT("pis")),
      cofins: r2(porReceita("5629") || somaT("cofins")),
      siscomex: r2(porReceita("7811") || info.siscomex),
      afrmm: r2(info.afrmm),
      icms: r2(info.icms || (icmsEl ? num(txt(icmsEl, "valorTotalIcms")) : 0)),
      antidumping: r2(porReceita("5529")),
    },
    adicoes,
    faturas,
    avisos: [],
  };
}

/** Ponto de entrada: recebe o texto do XML e devolve a DI normalizada (ou lança erro legível). */
export function lerXmlDI(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("O arquivo não é um XML válido.");
  const trans = doc.getElementsByTagName("declaracao")[0];
  const extr = doc.getElementsByTagName("declaracaoImportacao")[0];
  let di;
  if (extr) di = parseExtrato(extr);
  else if (trans) di = parseTransmissao(trans);
  else throw new Error("Não achei <declaracaoImportacao> nem <declaracao> no XML — é o XML da DI do Siscomex?");
  if (!di.adicoes.length) di.avisos.push("A DI não tem adições — confira o arquivo.");
  if (!di.cambio_di) di.avisos.push("Câmbio da DI não encontrado no XML — informe na tela (está no extrato da DI, bloco Dados Complementares).");
  if (!di.totais.icms) di.avisos.push("ICMS total não veio no XML — informe o ICMS por item a partir do Draft do despachante.");
  if (!di.totais.afrmm) di.avisos.push("AFRMM não veio no XML — confira no extrato/numerário e lance em Despesas.");
  // Conferência interna: soma dos itens × VCMV da adição
  for (const a of di.adicoes) {
    const somaItens = r2(a.mercadorias.reduce((s, m) => s + m.total_usd, 0));
    if (a.vcmv_usd && Math.abs(somaItens - a.vcmv_usd) > 0.05) di.avisos.push(`Adição ${a.numero}: itens somam US$ ${somaItens.toFixed(2)} e a adição declara US$ ${a.vcmv_usd.toFixed(2)}.`);
  }
  return di;
}

/** Itens da DI "achatados" (um por mercadoria), com os impostos da adição rateados pelo valor de cada item. */
export function itensDaDI(di) {
  const out = [];
  for (const a of di.adicoes || []) {
    const base = a.mercadorias.reduce((s, m) => s + m.total_usd, 0) || 1;
    for (const m of a.mercadorias) {
      const f = m.total_usd / base;
      out.push({
        chave: `${a.numero}-${m.seq}`,
        adicao: a.numero, seq: m.seq, ncm: a.ncm, fornecedor: a.fornecedor, descricao: m.descricao,
        qtd: m.qtd, unidade: m.unidade, vucv_usd: m.vucv_usd, total_usd: m.total_usd,
        va_brl: r2(a.va_brl * f), frete_brl: r2(a.frete_brl * f), seguro_brl: r2(a.seguro_brl * f), acrescimo_brl: r2(a.acrescimo_brl * f),
        ii: r2(a.ii.valor * f), ipi: r2(a.ipi.valor * f), pis: r2(a.pis.valor * f), cofins: r2(a.cofins.valor * f),
        icms: a.icms_brl != null ? r2(a.icms_brl * f) : null,
        aliq_ii: a.ii.aliq, aliq_ipi: a.ipi.aliq, aliq_pis: a.pis.aliq, aliq_cofins: a.cofins.aliq,
        peso_liquido: r2(a.peso_liquido * f),
      });
    }
  }
  return out;
}
