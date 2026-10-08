import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { configParaMotor } from "@/lib/simportEngine";
import { simplesEfetivaPct } from "@/lib/taxEngine";
import { useBaseFixas, fmtPctFixo } from "@/lib/despesasFixas";

/**
 * DRE REALIZADA no modelo da planilha da empresa (Drive → Financeiro → DRE): o ano em 12 colunas + total,
 * com os mesmos blocos — Receita Operacional Bruta, Deduções, Custos, Despesas Operacionais (assistência,
 * administrativas, pessoal, comerciais), Receita e Despesa Financeira, Impostos, Resultado Líquido.
 *
 * De onde vem cada número:
 *  - vendas, custo e comissões: pedidos faturados do ERP e vendas pagas do Mercado Livre (lidas da conta);
 *  - Simples Nacional: carimbo fiscal do pedido; sem carimbo, alíquota efetiva da Configuração;
 *  - despesas: lançamentos PAGOS do Financeiro (o extrato do banco lança sozinho), pela categoria e seu grupo
 *    (financial_categories.dre_grupo). 06/10/2026: as despesas operacionais se dividem em VARIÁVEIS (acima da margem de
 *    contribuição) e FIXAS (marcação "Despesa fixa" de cada lançamento, padrão da categoria). Mês já corrido sem
 *    extrato usa a média real das despesas fixas (base_despesas_fixas) como estimativa — 08/10/2026: só a parte que falta
 *    (média − fixas já lançadas no mês, ex.: o pró-labore), para não contar duas vezes.
 *  - 08/10/2026 (v2, decisão do dono: pró-labore R$ 2.000, o resto é distribuição de lucros): abaixo do Resultado Líquido,
 *    DISTRIBUIÇÃO DE LUCROS — lucro do mês disponível, lucro acumulado disponível (soma dos resultados desde o 1º mês com
 *    dado, ou desde o mês configurado, menos o já distribuído), retirada planejada do sócio (dre_distribuicao_config),
 *    distribuído no mês (categoria slug retirada_de_socio, hoje "Distribuição de lucros", que sai do banco) e o saldo que
 *    pode ser retirado com isenção; retirada planejada maior que o saldo = "lucro insuficiente" em vermelho.
 *  - PARTICIPAÇÃO NOS LUCROS (tabela dre_participacoes, liga/desliga em Financeiro → Categorias): % do Resultado Líquido
 *    POSITIVO do mês (prejuízo = 0), a partir do mês "desde". Ligada, sai do lucro disponível para distribuir.
 */
// categoria cujos lançamentos são a distribuição de lucros ao sócio (era "Retirada de sócio"; o slug ficou o mesmo)
export const SLUG_DISTRIBUICAO = "retirada_de_socio";
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const GRUPOS_DESPESA = [
  ["assistencia", "Despesa Assistência Técnica"],
  ["administrativa", "Despesas administrativas"],
  ["pessoal", "Despesas com pessoal"],
  ["comercial", "Despesas comerciais"],
  ["outras", "Outras despesas (categoria ainda sem grupo)"],
];
// grupos que se dividem em variável × fixa (financeira, impostos e receita financeira ficam como estão)
const OPERACIONAIS = new Set(GRUPOS_DESPESA.map(([g]) => g));
const num = (v) => parseFloat(v) || 0;
const fmt = (v) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const mesSP = (d) => (d ? new Date(d).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7) : "");
const zeros = () => Array(12).fill(0);
const mesAnterior = (ym) => { if (!/^\d{4}-\d{2}$/.test(ym)) return ""; const [a, m] = ym.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; };

export default function DREPlanilha({ config, onVoltar }) {
  const hoje = new Date().toISOString().slice(0, 7);
  const [ano, setAno] = useState(hoje.slice(0, 4));
  const [mesSel, setMesSel] = useState(parseInt(hoje.slice(5, 7), 10) - 1);
  const [contaML, setContaML] = useState("todas");
  const [dados, setDados] = useState(null);
  const [participacoes, setParticipacoes] = useState([]);
  const [erroPart, setErroPart] = useState(false);
  const [distConfig, setDistConfig] = useState(null); // 08/10/2026: retirada planejada do sócio
  const baseFixas = useBaseFixas();

  // 08/10/2026: participação nos lucros. Erro na leitura NÃO vira "sem participação" calado: aparece o aviso no rodapé.
  useEffect(() => {
    base44.entities.DreParticipacao.list("ordem", 100)
      .then((r) => setParticipacoes(r || []))
      .catch(() => setErroPart(true));
    base44.entities.DreDistribuicaoConfig.list("-created_date", 10)
      .then((r) => setDistConfig((r || []).find((c) => c.ativo) || null))
      .catch(() => setErroPart(true));
  }, []);

  useEffect(() => {
    Promise.all([
      base44.entities.SaleOrder.list("-created_date", 5000),
      base44.entities.Product.list("-created_date", 2000),
      base44.entities.SalesChannel.list("-created_date", 50),
      base44.entities.FinancialEntry.list("-created_date", 10000).catch(() => []),
      base44.entities.SaleReturn.list("-data", 2000).catch(() => []),
      base44.entities.FinancialCategory.list("nome", 500).catch(() => []),
      base44.entities.MlPedido.list("-data_pedido", 10000).catch(() => []),
    ]).then(([orders, products, channels, entries, devolucoes, categorias, ml]) =>
      setDados({ orders: orders || [], products: products || [], channels: channels || [], entries: entries || [], devolucoes: devolucoes || [], categorias: categorias || [], ml: ml || [] }));
  }, []);

  const anos = useMemo(() => {
    const s = new Set([hoje.slice(0, 4)]);
    if (dados) {
      dados.orders.forEach((o) => { const a = (o.order_date || o.created_date || "").slice(0, 4); if (a) s.add(a); });
      dados.entries.forEach((e) => { const a = (e.payment_date || "").slice(0, 4); if (a) s.add(a); });
    }
    return Array.from(s).sort().reverse();
  }, [dados]); // eslint-disable-line react-hooks/exhaustive-deps

  const dre = useMemo(() => {
    if (!dados) return null;
    const { orders, products, channels, entries, devolucoes, categorias, ml } = dados;
    const prod = new Map(products.map((p) => [p.id, p]));
    const custoDe = (id) => { const p = prod.get(id); return p ? (p.cost_landed_brl > 0 ? p.cost_landed_brl : (p.custo_manual_brl || 0)) : 0; };
    const cat = Object.fromEntries(categorias.map((c) => [c.slug, c]));
    const motor = configParaMotor(config);
    const simples = motor.regime === "simples";
    const efetiva = simplesEfetivaPct(config?.rbt12 || 0);
    const aliqSemCarimbo = simples ? efetiva / 100
      : (motor.pis_venda + motor.cofins_venda + motor.presuncao_irpj * motor.aliq_irpj + motor.presuncao_csll * motor.aliq_csll);
    const pctVendedorPadrao = num(config?.comissao_vendedor_padrao);
    const mediaFixas = num(baseFixas?.media_fixas);
    // chave da linha: operacional vai para "var:" ou "fix:" pela marcação do lançamento; o resto fica "cat:"
    const chaveDe = (c, e) => (OPERACIONAIS.has(c.dre_grupo) ? `${e.fixa ? "fix" : "var"}:${c.slug}` : `cat:${c.slug}`);

    // 08/10/2026: o cálculo de UM ano virou função — o lucro acumulado para distribuição precisa dos anos anteriores
    const calcular = (ano) => {
    const L = {}; // chave → 12 valores
    const add = (k, i, v) => { if (!v) return; (L[k] = L[k] || zeros())[i] += v; };
    let itensSemCusto = 0;
    const temExtrato = Array(12).fill(false);
    const temCartao = Array(12).fill(false);
    const fixasLancadas = zeros(); // fixas já lançadas no mês (para a estimativa de mês sem extrato não contar em dobro)

    for (let i = 0; i < 12; i++) {
      const mes = `${ano}-${String(i + 1).padStart(2, "0")}`;

      // ---- pedidos faturados do ERP
      let semCarimbo = 0;
      for (const o of orders) {
        if (!["invoiced", "shipped", "delivered"].includes(o.status)) continue;
        if (!((o.order_date || (o.created_date || "").slice(0, 10)) || "").startsWith(mes)) continue;
        add("venda_pedidos", i, o.total || 0);
        if (o.imposto_valor != null && o.imposto_valor >= 0 && o.imposto_regime) add("das", i, o.imposto_valor);
        else semCarimbo += o.total || 0;
        const ch = channels.find((c) => c.id === o.channel_id);
        add("comissao_canal", i, (o.total || 0) * ((ch?.commission_percent || 0) / 100) + (ch?.fixed_fee || 0));
        const impPct = (o.imposto_aliquota != null && o.imposto_regime) ? num(o.imposto_aliquota) : (simples ? efetiva : 0);
        const rep = o.vendido_por === "representante";
        for (const it of (o.items || [])) {
          const q = num(it.quantity);
          const rec = num(it.unit_price) * q;
          if (rec > 0) {
            const pct = rep ? num(prod.get(it.product_id)?.seller_commission_percent) : pctVendedorPadrao;
            add("comissao_vendedor", i, rec * (1 - impPct / 100) * (pct / 100));
          }
          const c = custoDe(it.product_id);
          if (!c && it.product_id) itensSemCusto++;
          add("cmv", i, c * q);
        }
      }

      // ---- vendas pagas do Mercado Livre que ainda não viraram pedido no ERP
      for (const p of ml) {
        if (p.status !== "paid" || p.sale_order_id) continue;
        if (contaML !== "todas" && p.conta !== contaML) continue;
        if (mesSP(p.data_pedido) !== mes) continue;
        const total = num(p.total), estornado = num(p.mp_estornado);
        const devolvida = estornado > 0 && estornado >= total - 0.005;
        add("venda_ml", i, total);
        if (estornado > 0) add("devolucoes", i, Math.min(estornado, total));
        add("frete_ml", i, num(p.frete_vendedor));
        if (devolvida) continue; // devolvida inteira: comissão volta e o produto retorna ao estoque
        semCarimbo += total - estornado;
        add("comissao_ml", i, num(p.taxa_ml));
        for (const it of (p.itens || [])) {
          const c = custoDe(it.product_id);
          if (!c) itensSemCusto++;
          add("cmv", i, c * num(it.qtd));
        }
      }

      // ---- devoluções de pedidos do ERP (no mês em que acontecem)
      for (const d of devolucoes) {
        if (!(d.data || "").startsWith(mes)) continue;
        add("devolucoes", i, num(d.valor));
        add("cmv", i, -num(d.cmv_devolvido));
        add("comissao_vendedor", i, -num(d.comissao_estornada));
      }

      // ---- Financeiro: lançamentos pagos no mês, pela categoria
      for (const e of entries) {
        if (e.status === "cancelled") continue;
        // FATURA DO CARTÃO: conta por competência — a fatura que vence num mês traz as compras do mês anterior.
        // Entra mesmo antes de ser paga (fatura fechada é despesa certa); estorno maior que compra entra negativo.
        if (e.reference_type === "extrato" && (e.reference_id || "").startsWith("fatura:")) {
          if (mesAnterior((e.due_date || "").slice(0, 7)) !== mes) continue;
          const c = cat[e.category];
          if (c?.dre_grupo) {
            const val = e.type === "payable" ? num(e.amount) : -num(e.amount);
            add(chaveDe(c, e), i, val); temCartao[i] = true;
            if (OPERACIONAIS.has(c.dre_grupo) && e.fixa) fixasLancadas[i] += val;
          }
          continue;
        }
        const quando = e.payment_date || e.due_date || "";
        if (!quando.startsWith(mes)) continue;
        if (e.category === "servicos_os" && e.type === "receivable") { add("servicos", i, num(e.amount)); semCarimbo += simples ? num(e.amount) : 0; continue; }
        // despesa de viagem de OS conta pelo vencimento/pagamento, mesmo ainda não paga (regra que a DRE já tinha)
        if (e.category === "despesas_viagem_os" && e.type === "payable") { add(`${e.fixa ? "fix" : "var"}:despesas_viagem_os`, i, num(e.amount)); continue; }
        if (e.status !== "paid" || !(e.payment_date || "").startsWith(mes)) continue;
        if (e.reference_type === "extrato") temExtrato[i] = true;
        // distribuição de lucros ao sócio: sempre abaixo do resultado, no bloco próprio (nunca como despesa)
        if (e.category === SLUG_DISTRIBUICAO) { if (e.type === "payable") add(`cat:${SLUG_DISTRIBUICAO}`, i, num(e.amount)); continue; }
        const c = cat[e.category];
        if (!c?.dre_grupo) continue;
        if (c.dre_grupo === "receita_financeira" ? e.type === "receivable" : e.type === "payable") {
          add(chaveDe(c, e), i, num(e.amount));
          if (OPERACIONAIS.has(c.dre_grupo) && e.fixa && e.type === "payable") fixasLancadas[i] += num(e.amount);
        }
      }

      add("das", i, semCarimbo * aliqSemCarimbo);
      // mês já corrido e sem extrato lançado: despesas fixas pela MÉDIA REAL (marcadas no Financeiro) como estimativa
      // (só em mês que teve venda no sistema; mês sem movimento nenhum fica em branco)
      const teveVenda = (L.venda_pedidos?.[i] || 0) + (L.venda_ml?.[i] || 0) + (L.servicos?.[i] || 0) > 0;
      // 08/10/2026: a estimativa cobre só o que falta — fixas já lançadas no mês (pró-labore, fatura) saem da média
      if (!temExtrato[i] && teveVenda && mes <= hoje && mediaFixas > 0) add("fixas_media", i, Math.max(0, mediaFixas - fixasLancadas[i]));
    }

    const v = (k) => L[k] || zeros();
    const soma = (...ks) => zeros().map((_, i) => ks.reduce((s, k) => s + (Array.isArray(k) ? k[i] : v(k)[i]), 0));
    const menos = (a, b) => a.map((x, i) => x - b[i]);
    const catsDoGrupo = (g, pre = "cat") => categorias.filter((c) => c.dre_grupo === g && (L[`${pre}:${c.slug}`] || []).some((x) => Math.abs(x) >= 0.005)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const linhasCat = (g, pre = "cat") => catsDoGrupo(g, pre).map((c) => ({ label: c.nome, vals: v(`${pre}:${c.slug}`) }));
    const somaGrupo = (g) => soma(...catsDoGrupo(g).map((c) => `cat:${c.slug}`));

    const receitaBruta = menos(soma("venda_pedidos", "venda_ml", "servicos"), v("devolucoes"));
    const receitaLiquida = menos(receitaBruta, v("das"));
    const resultadoBruto = menos(receitaLiquida, v("cmv"));

    // VARIÁVEIS: as categorias operacionais com lançamentos não marcados como fixos + comissões e frete das vendas
    const gruposVar = GRUPOS_DESPESA.map(([g, titulo]) => {
      const linhas = linhasCat(g, "var");
      if (g === "comercial") {
        for (const [k, label] of [["comissao_ml", "Comissão Mercado Livre"], ["frete_ml", "Frete Mercado Livre"], ["comissao_canal", "Comissões de canal"], ["comissao_vendedor", "Comissões de vendedor / representante"]]) {
          if (L[k]) linhas.push({ label, vals: v(k) });
        }
      }
      return { titulo, linhas, total: soma(...linhas.map((l) => l.vals)) };
    }).filter((g) => g.linhas.length);
    // FIXAS: lançamentos marcados como "Despesa fixa" (padrão da categoria; muda caso a caso no Financeiro)
    const gruposFix = GRUPOS_DESPESA.map(([g, titulo]) => {
      const linhas = linhasCat(g, "fix");
      return { titulo, linhas, total: soma(...linhas.map((l) => l.vals)) };
    }).filter((g) => g.linhas.length);
    if (L.fixas_media) gruposFix.push({ titulo: "Despesas fixas — média real (mês sem extrato)", linhas: [], total: v("fixas_media") });
    const despVar = soma(...gruposVar.map((g) => g.total));
    const despFix = soma(...gruposFix.map((g) => g.total));

    const recFin = somaGrupo("receita_financeira"), despFin = somaGrupo("financeira"), impostos = somaGrupo("imposto");
    const margemContrib = menos(resultadoBruto, despVar);
    const antesImpostos = menos(soma(margemContrib, recFin), soma(despFix, despFin));
    const liquido = menos(antesImpostos, impostos);

    const R = [];
    const push = (tipo, label, vals, sinal, totalValor) => R.push({ tipo, label, vals, sinal, totalValor });
    push("total", "(+) Receita Operacional Bruta", receitaBruta, 1);
    push("linha", "Venda de produtos (pedidos faturados)", v("venda_pedidos"), 1);
    if (L.venda_ml) push("linha", "Venda de produtos (Mercado Livre)", v("venda_ml"), 1);
    if (L.servicos) push("linha", "Venda de serviços (OS)", v("servicos"), 1);
    if (L.devolucoes) push("linha", "(−) Devoluções e estornos de vendas", v("devolucoes"), -1);
    push("total", "(−) Deduções da Receita Bruta", v("das"), -1);
    push("linha", simples ? "Simples Nacional" : "Impostos sobre a venda (Presumido)", v("das"), -1);
    push("resultado", "(=) Receita Operacional Líquida", receitaLiquida, 0);
    push("total", "(−) Custos das Mercadorias", v("cmv"), -1);
    push("resultado", "(=) Resultado Operacional Bruto", resultadoBruto, 0);
    push("total", "(−) Despesas variáveis", despVar, -1);
    for (const g of gruposVar) {
      push("grupo", g.titulo, g.total, -1);
      for (const l of g.linhas) push("linha", l.label, l.vals, -1);
    }
    push("resultado", "(=) Margem de contribuição", margemContrib, 0);
    push("total", "(−) Despesas fixas", despFix, -1);
    for (const g of gruposFix) {
      push("grupo", g.titulo, g.total, -1);
      for (const l of g.linhas) push("linha", l.label, l.vals, -1);
    }
    push("total", "(+) Receita Financeira", recFin, 1);
    for (const l of linhasCat("receita_financeira")) push("linha", l.label, l.vals, 1);
    push("total", "(−) Despesa Financeira", despFin, -1);
    for (const l of linhasCat("financeira")) push("linha", l.label, l.vals, -1);
    push("resultado", "(=) Resultado antes dos impostos e taxas", antesImpostos, 0);
    push("total", "(−) Impostos e taxas", impostos, -1);
    for (const l of linhasCat("imposto")) push("linha", l.label, l.vals, -1);
    push("resultado final", "(=) Resultado Líquido", liquido, 0);

    const temDado = zeros().map((_, i) => Object.values(L).some((arr) => Math.abs(arr[i]) >= 0.005));
    const distribuido = v(`cat:${SLUG_DISTRIBUICAO}`);
    // a distribuição tem bloco próprio; o resto do "informativo" continua na lista de baixo
    const informativo = catsDoGrupo("informativo").filter((c) => c.slug !== SLUG_DISTRIBUICAO).map((c) => ({ label: c.nome, vals: v(`cat:${c.slug}`) }));
    return { R, push, liquido, distribuido, temDado, informativo, itensSemCusto, temExtrato, temCartao, usaMedia: !!L.fixas_media };
    };

    const atual = calcular(ano);
    const { R, push, liquido } = atual;
    const mesDe = (i) => `${ano}-${String(i + 1).padStart(2, "0")}`;
    const mmaa = (ym) => { const [a, m] = ym.split("-"); return `${MESES[Number(m) - 1]}/${a}`; };
    const ultimoAteHoje = (vals) => { let u = 0; vals.forEach((x, i) => { if (mesDe(i) <= hoje) u = x; }); return u; };

    // PARTICIPAÇÃO NOS LUCROS — % do resultado líquido positivo do mês (prejuízo = 0), só das linhas ligadas e a partir do
    // mês "desde". Linha desligada aparece com traço, para lembrar que existe. Ligada, sai do lucro disponível para distribuir.
    const partDoMes = (lucro, ym) => participacoes.reduce((t, p) => {
      const desde = (p.desde || "").slice(0, 7);
      return t + (p.ativo && (!desde || ym >= desde) && lucro > 0 ? lucro * num(p.percentual) / 100 : 0);
    }, 0);
    const linhasPart = participacoes.map((p) => {
      const pct = num(p.percentual);
      const desde = (p.desde || "").slice(0, 7);
      const vals = zeros().map((_, i) => (p.ativo && (!desde || mesDe(i) >= desde) && liquido[i] > 0 ? liquido[i] * pct / 100 : 0));
      const fmtPct = pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
      const rotulo = `${p.nome} — ${fmtPct}% do lucro${p.ativo ? (desde ? ` (desde ${desde.split("-").reverse().join("/")})` : "") : " (desligada)"}`;
      return { label: rotulo, vals };
    });
    const totalPart = zeros().map((_, i) => linhasPart.reduce((t, l) => t + l.vals[i], 0));

    // DISTRIBUIÇÃO DE LUCROS (08/10/2026). Série mês a mês desde o ano mais antigo até o ano na tela.
    const serie = [];
    for (const a of anos.filter((x) => x < ano).sort()) {
      const r = calcular(a);
      r.liquido.forEach((x, i) => serie.push({ ym: `${a}-${String(i + 1).padStart(2, "0")}`, liq: x, dist: r.distribuido[i], dado: r.temDado[i] }));
    }
    atual.liquido.forEach((x, i) => serie.push({ ym: mesDe(i), liq: x, dist: atual.distribuido[i], dado: atual.temDado[i] }));
    const inicio = (distConfig?.acumulado_desde || "").slice(0, 7) || (serie.find((m) => m.dado) || {}).ym || hoje;
    const lucroDisp = zeros(), acumDisp = zeros(), saldo = zeros(), planejada = zeros(), falta = zeros();
    let somaLucro = 0, somaDist = 0;
    for (const m of serie) {
      if (m.ym < inicio || m.ym > hoje) continue;
      const lucroMes = m.liq - partDoMes(m.liq, m.ym); // depois das participações ligadas
      const acum = somaLucro + lucroMes - somaDist;     // lucro acumulado até este mês, menos o distribuído ANTES dele
      somaLucro += lucroMes; somaDist += m.dist;
      if (!m.ym.startsWith(ano)) continue;
      const i = Number(m.ym.slice(5, 7)) - 1;
      lucroDisp[i] = Math.max(0, lucroMes);
      acumDisp[i] = acum;
      saldo[i] = acum - m.dist;
      const desdeRet = (distConfig?.desde || "").slice(0, 7);
      planejada[i] = distConfig && (!desdeRet || m.ym >= desdeRet) ? num(distConfig.retirada_mensal) : 0;
      falta[i] = planejada[i] > 0 && planejada[i] > saldo[i] + 0.005 ? planejada[i] - saldo[i] : 0; // quanto lucro falta para a retirada planejada
    }
    push("total", "Distribuição de lucros (abaixo do resultado)", zeros(), 1, 0);
    push("linha", "Lucro do mês disponível (prejuízo = 0)", lucroDisp, 1);
    push("linha", `Lucro acumulado disponível para distribuição (desde ${mmaa(inicio)})`, acumDisp, 0, ultimoAteHoje(acumDisp));
    push("linha", `Retirada planejada do sócio${distConfig?.nome ? ` (${distConfig.nome})` : ""}`, planejada, 1);
    push("linha", "Distribuído no mês (saiu do banco)", atual.distribuido, 1);
    push("resultado", "(=) Saldo que pode ser retirado com isenção", saldo, 0, ultimoAteHoje(saldo));
    if (falta.some((x) => x > 0)) push("linha", "Lucro insuficiente para a retirada planejada", falta, -1, ultimoAteHoje(falta));

    if (linhasPart.length) {
      push("total", "(−) Participação nos lucros", totalPart, -1);
      for (const l of linhasPart) push("linha", l.label, l.vals, -1);
      push("resultado final", "(=) Lucro após participações", liquido.map((x, i) => x - totalPart[i]), 0);
    }

    return { linhas: R, informativo: atual.informativo, itensSemCusto: atual.itensSemCusto, temExtrato: atual.temExtrato, temCartao: atual.temCartao,
      usaMedia: atual.usaMedia, temPart: linhasPart.length > 0, falta, saldo, planejada, inicio, temDist: !!distConfig };
  }, [dados, ano, anos, contaML, config, baseFixas, participacoes, distConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dre) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const total = (vals) => vals.reduce((s, x) => s + x, 0);
  const Celula = ({ valor, sinal, forte, sel }) => {
    const zero = Math.abs(valor) < 0.005;
    const cor = zero ? "text-muted-foreground/50" : sinal === 0 ? (valor < 0 ? "text-destructive" : "text-success") : sinal < 0 ? "text-destructive" : "";
    return <td className={`px-1.5 py-1.5 text-right whitespace-nowrap tabular-nums ${forte ? "font-semibold" : ""} ${cor} ${sel ? "bg-primary/5" : ""}`}>{zero ? "–" : fmt(valor)}</td>;
  };
  const estilo = {
    total: "font-semibold bg-muted/40",
    grupo: "font-medium",
    linha: "text-muted-foreground",
    resultado: "font-bold bg-muted/70 border-y border-border",
    "resultado final": "font-bold bg-primary/10 border-y-2 border-primary/30",
  };
  const recuo = { total: "", grupo: "pl-6", linha: "pl-10", resultado: "", "resultado final": "" };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={onVoltar}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
        <h1 className="text-xl font-heading font-bold mr-auto">DRE Realizada</h1>
        <Select value={contaML} onValueChange={setContaML}>
          <SelectTrigger className="w-64 h-10"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Mercado Livre: as duas contas</SelectItem>
            <SelectItem value="router">Mercado Livre: só ROUTER 66</SelectItem>
            <SelectItem value="saber">Mercado Livre: só SABER</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ano} onValueChange={setAno}>
          <SelectTrigger className="w-36 h-10 text-base font-medium"><SelectValue /></SelectTrigger>
          <SelectContent>{anos.map((a) => <SelectItem key={a} value={a}>Ano {a}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Números reais do sistema, mês a mês. Clique no nome de um mês para destacar a coluna.</p>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground sticky left-0 bg-muted min-w-[240px]">{ano}</th>
                {MESES.map((m, i) => (
                  <th key={m} onClick={() => setMesSel(i)} title={`${dre.temExtrato[i] ? "Despesas deste mês vêm do extrato do banco" : "Mês sem extrato do banco lançado"}${dre.temCartao[i] ? " · fatura do cartão lançada" : ""}`}
                    className={`px-1.5 py-2.5 text-right font-medium cursor-pointer select-none min-w-[70px] ${i === mesSel ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                    {m}{dre.temExtrato[i] ? " •" : ""}
                  </th>
                ))}
                <th className="px-2 py-2.5 text-right font-semibold min-w-[84px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {dre.linhas.map((l, n) => (
                <tr key={n} className={`border-b border-border/40 ${estilo[l.tipo]}`}>
                  <td className={`px-3 py-1.5 sticky left-0 ${l.tipo === "linha" || l.tipo === "grupo" ? "bg-card" : l.tipo === "total" ? "bg-muted" : "bg-muted"} ${recuo[l.tipo]}`}>{l.label}</td>
                  {l.vals.map((x, i) => <Celula key={i} valor={x} sinal={l.sinal} forte={l.tipo !== "linha"} sel={i === mesSel} />)}
                  <Celula valor={l.totalValor ?? total(l.vals)} sinal={l.sinal} forte />
                </tr>
              ))}
              {dre.informativo.length > 0 && (
                <>
                  <tr><td colSpan={14} className="px-3 pt-5 pb-1.5 text-[11px] font-medium text-foreground sticky left-0">Saíram do banco e não entram no resultado</td></tr>
                  {dre.informativo.map((l) => (
                    <tr key={l.label} className="border-b border-border/40 text-muted-foreground">
                      <td className="px-3 py-1.5 pl-10 sticky left-0 bg-card">{l.label}</td>
                      {l.vals.map((x, i) => <Celula key={i} valor={x} sinal={1} sel={i === mesSel} />)}
                      <Celula valor={total(l.vals)} sinal={1} forte />
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-[11px] text-muted-foreground max-w-4xl">
        <p>• Mês com ponto (•) no cabeçalho: despesas pagas de verdade, lançadas pelo extrato do banco. {dre.usaMedia && "Mês já corrido sem extrato usa a média real das despesas fixas como estimativa."} Despesa fixa é a marcada no Financeiro (o padrão vem da categoria){baseFixas?.meses_usados ? ` — hoje ${fmtPctFixo(baseFixas.pct)} do faturamento` : ""}.</p>
        <p>• Cartão de crédito: a fatura entra no mês anterior ao vencimento (a que vence em outubro são as compras de setembro), por categoria, já descontados os estornos. Mês sem fatura lançada fica sem as despesas do cartão.</p>
        <p>• Vendas do Mercado Livre são as pagas na conta; devolvida inteira sai da receita, da comissão e do custo.</p>
        <p>• Pró-labore: despesa fixa (Despesas com pessoal), lançada todo mês no Financeiro. O que sai do banco para o sócio além do pró-labore é distribuição de lucros: aparece no bloco "Distribuição de lucros", fora do resultado. Na coluna Total, o lucro acumulado e o saldo são os do último mês até hoje.</p>
        {dre.falta[mesSel] > 0 && <p className="text-destructive font-medium">⚠️ {MESES[mesSel]}/{ano}: lucro insuficiente: R$ {fmt(dre.falta[mesSel])} — a retirada planejada (R$ {fmt(dre.planejada[mesSel])}) é maior que o saldo que pode ser retirado com isenção (R$ {fmt(dre.saldo[mesSel])}).</p>}
        {dre.temPart && <p>• Participação nos lucros: percentual do Resultado Líquido do mês, só quando há lucro (mês com prejuízo = 0). Liga, desliga e muda o percentual em Financeiro → Categorias.</p>}
        {erroPart && <p className="text-warning">⚠️ Não foi possível ler a participação nos lucros — o "Lucro após participações" não aparece até a próxima abertura da tela.</p>}
        {dre.itensSemCusto > 0 && <p className="text-warning">⚠️ {dre.itensSemCusto} item(ns) vendidos sem custo cadastrado no ano — o custo real é maior e o resultado, menor.</p>}
        {(config?.rbt12 || 0) <= 0 && (config?.regime || "simples") === "simples" && <p className="text-warning">⚠️ RBT12 zerado na Configuração — Simples calculado pela 1ª faixa (4%).</p>}
      </div>
    </div>
  );
}
