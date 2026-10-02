import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { configParaMotor } from "@/lib/simportEngine";
import { simplesEfetivaPct } from "@/lib/taxEngine";

/**
 * DRE REALIZADA no modelo da planilha da empresa (Drive → Financeiro → DRE): o ano em 12 colunas + total,
 * com os mesmos blocos — Receita Operacional Bruta, Deduções, Custos, Despesas Operacionais (assistência,
 * administrativas, pessoal, comerciais), Receita e Despesa Financeira, Impostos, Resultado Líquido.
 *
 * De onde vem cada número:
 *  - vendas, custo e comissões: pedidos faturados do ERP e vendas pagas do Mercado Livre (lidas da conta);
 *  - Simples Nacional: carimbo fiscal do pedido; sem carimbo, alíquota efetiva da Configuração;
 *  - despesas: lançamentos PAGOS do Financeiro (o extrato do banco lança sozinho), pela categoria e seu grupo
 *    (financial_categories.dre_grupo). Mês sem extrato usa a lista fixa da Configuração como estimativa.
 */
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const GRUPOS_DESPESA = [
  ["assistencia", "Despesa Assistência Técnica"],
  ["administrativa", "Despesas administrativas"],
  ["pessoal", "Despesas com pessoal"],
  ["comercial", "Despesas comerciais"],
  ["outras", "Outras despesas (categoria ainda sem grupo)"],
];
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
    const despesasConfig = (config?.despesas_fixas || []).reduce((s, d) => s + (d.valor || 0), 0);

    const L = {}; // chave → 12 valores
    const add = (k, i, v) => { if (!v) return; (L[k] = L[k] || zeros())[i] += v; };
    let itensSemCusto = 0;
    const temExtrato = Array(12).fill(false);
    const temCartao = Array(12).fill(false);

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
          if (c?.dre_grupo) { add(`cat:${c.slug}`, i, e.type === "payable" ? num(e.amount) : -num(e.amount)); temCartao[i] = true; }
          continue;
        }
        const quando = e.payment_date || e.due_date || "";
        if (!quando.startsWith(mes)) continue;
        if (e.category === "servicos_os" && e.type === "receivable") { add("servicos", i, num(e.amount)); semCarimbo += simples ? num(e.amount) : 0; continue; }
        // despesa de viagem de OS conta pelo vencimento/pagamento, mesmo ainda não paga (regra que a DRE já tinha)
        if (e.category === "despesas_viagem_os" && e.type === "payable") { add("cat:despesas_viagem_os", i, num(e.amount)); continue; }
        if (e.status !== "paid" || !(e.payment_date || "").startsWith(mes)) continue;
        if (e.reference_type === "extrato") temExtrato[i] = true;
        const c = cat[e.category];
        if (!c?.dre_grupo) continue;
        if (c.dre_grupo === "receita_financeira" ? e.type === "receivable" : e.type === "payable") add(`cat:${c.slug}`, i, num(e.amount));
      }

      add("das", i, semCarimbo * aliqSemCarimbo);
      // mês já corrido e sem extrato lançado: despesas pela lista fixa da Configuração (estimativa)
      // (só em mês que teve venda no sistema; mês sem movimento nenhum fica em branco)
      const teveVenda = (L.venda_pedidos?.[i] || 0) + (L.venda_ml?.[i] || 0) + (L.servicos?.[i] || 0) > 0;
      if (!temExtrato[i] && teveVenda && mes <= hoje && despesasConfig > 0) add("fixas_config", i, despesasConfig);
    }

    const v = (k) => L[k] || zeros();
    const soma = (...ks) => zeros().map((_, i) => ks.reduce((s, k) => s + (Array.isArray(k) ? k[i] : v(k)[i]), 0));
    const menos = (a, b) => a.map((x, i) => x - b[i]);
    const catsDoGrupo = (g) => categorias.filter((c) => c.dre_grupo === g && (L[`cat:${c.slug}`] || []).some((x) => Math.abs(x) >= 0.005)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const linhasCat = (g) => catsDoGrupo(g).map((c) => ({ label: c.nome, vals: v(`cat:${c.slug}`) }));
    const somaGrupo = (g) => soma(...catsDoGrupo(g).map((c) => `cat:${c.slug}`));

    const receitaBruta = menos(soma("venda_pedidos", "venda_ml", "servicos"), v("devolucoes"));
    const receitaLiquida = menos(receitaBruta, v("das"));
    const resultadoBruto = menos(receitaLiquida, v("cmv"));

    const grupos = GRUPOS_DESPESA.map(([g, titulo]) => {
      const linhas = linhasCat(g);
      if (g === "comercial") {
        for (const [k, label] of [["comissao_ml", "Comissão Mercado Livre"], ["frete_ml", "Frete Mercado Livre"], ["comissao_canal", "Comissões de canal"], ["comissao_vendedor", "Comissões de vendedor / representante"]]) {
          if (L[k]) linhas.push({ label, vals: v(k) });
        }
      }
      return { titulo, linhas, total: soma(...linhas.map((l) => l.vals)) };
    }).filter((g) => g.linhas.length);
    if (L.fixas_config) grupos.push({ titulo: "Despesas fixas (lista da Configuração — mês sem extrato)", linhas: [], total: v("fixas_config") });
    const despesasOp = soma(...grupos.map((g) => g.total));

    const recFin = somaGrupo("receita_financeira"), despFin = somaGrupo("financeira"), impostos = somaGrupo("imposto");
    const antesImpostos = menos(soma(resultadoBruto, recFin), soma(despesasOp, despFin));
    const liquido = menos(antesImpostos, impostos);

    const R = [];
    const push = (tipo, label, vals, sinal) => R.push({ tipo, label, vals, sinal });
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
    push("total", "(−) Despesas Operacionais", despesasOp, -1);
    for (const g of grupos) {
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

    const informativo = linhasCat("informativo");
    return { linhas: R, informativo, itensSemCusto, temExtrato, temCartao, usaConfig: !!L.fixas_config };
  }, [dados, ano, contaML, config]); // eslint-disable-line react-hooks/exhaustive-deps

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
                  <Celula valor={total(l.vals)} sinal={l.sinal} forte />
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
        <p>• Mês com ponto (•) no cabeçalho: despesas pagas de verdade, lançadas pelo extrato do banco. {dre.usaConfig && "Mês já corrido sem extrato usa a lista de despesas fixas da Configuração como estimativa."}</p>
        <p>• Cartão de crédito: a fatura entra no mês anterior ao vencimento (a que vence em outubro são as compras de setembro), por categoria, já descontados os estornos. Mês sem fatura lançada fica sem as despesas do cartão.</p>
        <p>• Vendas do Mercado Livre são as pagas na conta; devolvida inteira sai da receita, da comissão e do custo.</p>
        {dre.itensSemCusto > 0 && <p className="text-warning">⚠️ {dre.itensSemCusto} item(ns) vendidos sem custo cadastrado no ano — o custo real é maior e o resultado, menor.</p>}
        {(config?.rbt12 || 0) <= 0 && (config?.regime || "simples") === "simples" && <p className="text-warning">⚠️ RBT12 zerado na Configuração — Simples calculado pela 1ª faixa (4%).</p>}
      </div>
    </div>
  );
}
