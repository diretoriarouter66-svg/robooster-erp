import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { ShoppingBag, AlertTriangle, CheckCircle2, Percent, Truck, DollarSign } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/shared/PageHeader";
import StatCard from "../components/shared/StatCard";
import EmptyState from "../components/shared/EmptyState";
import MLContas from "../components/pricing/MLContas";

// 02/10/2026 — Mercado Livre no ERP em MODO DE TESTE (virada só em jan/2027).
// A rotina erp-ml-pedidos.py lê as duas contas e grava em ml_pedidos; esta tela só mostra.
// Nada aqui vira pedido de venda, movimento de estoque ou nota fiscal.
const CONTAS = { router: "ROUTER 66", saber: "SABERDAELETRÔNICA" };
const CONTAS_CURTO = { router: "Router 66", saber: "Saber" }; // na tabela: nome curto para não quebrar no meio da palavra
// valores das colunas sem "R$" (o título da coluna diz a moeda) — cabe venda de 5 dígitos sem estourar a coluna
const fmtValor = (v) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseFloat(v) || 0);
const fmtDia = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");
const num = (v) => parseFloat(v) || 0;
const formatCurrency = (v) => (parseFloat(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function MLPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState("");
  const [conta, setConta] = useState("todas");
  const [situacao, setSituacao] = useState("todas");

  useEffect(() => {
    (async () => {
      try {
        const p = await base44.entities.MlPedido.list("-data_pedido", 1000);
        setPedidos(p);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const meses = useMemo(() => Array.from(new Set(pedidos.map((x) => String(x.data_pedido || "").slice(0, 7)).filter(Boolean))).sort().reverse(), [pedidos]);

  // Uma compra com vários itens (carrinho) chega do Mercado Livre como vários pedidos com um envio só: aqui vira UMA venda.
  const vendas = useMemo(() => {
    const m = new Map();
    for (const p of pedidos) {
      if (mes && String(p.data_pedido || "").slice(0, 7) !== mes) continue;
      if (conta !== "todas" && p.conta !== conta) continue;
      const k = p.shipment_id || p.id;
      if (!m.has(k)) m.set(k, { chave: k, conta: p.conta, data: p.data_pedido, status: p.status, itens: [], total: 0, taxa: 0, freteVend: 0, freteComp: 0, liquido: 0, pend: new Set(), bling: p.bling_numero, blingTotal: num(p.bling_total), nf: p.bling_nf_numero, logistica: p.logistica, pedidosML: [], teste: p.nfe_teste_status, testeNumero: p.nfe_teste_numero, testeMsg: p.nfe_teste_mensagem, comp: p.nfe_comparacao,
        mpLiq: 0, mpTem: false, mpLiberado: true, mpQuando: null, mpEstornado: 0, mpAlerta: new Set(), nfSit: p.bling_nf_situacao });
      const v = m.get(k);
      v.pedidosML.push(p.id);
      v.total += num(p.total); v.taxa += num(p.taxa_ml); v.freteVend += num(p.frete_vendedor); v.freteComp += num(p.frete_comprador); v.liquido += num(p.liquido);
      for (const i of p.itens || []) v.itens.push(i);
      String(p.pendencias || "").split(";").map((s) => s.trim()).filter(Boolean).forEach((s) => v.pend.add(s));
      if (p.status === "cancelled") v.status = "cancelled";
      v.nf = v.nf || p.bling_nf_numero; v.bling = v.bling || p.bling_numero; v.blingTotal = v.blingTotal || num(p.bling_total);
      v.teste = v.teste || p.nfe_teste_status; v.testeNumero = v.testeNumero || p.nfe_teste_numero; v.comp = v.comp || p.nfe_comparacao;
      // recebimento no Mercado Pago (02/10/2026)
      if (p.mp_liquido != null) { v.mpTem = true; v.mpLiq += num(p.mp_liquido); v.mpEstornado += num(p.mp_estornado); if (!p.mp_liberado) v.mpLiberado = false; if (p.mp_liberacao && (!v.mpQuando || p.mp_liberacao > v.mpQuando)) v.mpQuando = p.mp_liberacao; }
      String(p.mp_alerta || "").split(";").map((x) => x.trim()).filter(Boolean).forEach((x) => v.mpAlerta.add(x));
      v.nfSit = v.nfSit || p.bling_nf_situacao;
    }
    let lista = Array.from(m.values()).map((v) => ({ ...v, pend: Array.from(v.pend), mpAlerta: Array.from(v.mpAlerta) }));
    if (situacao === "pendencia") lista = lista.filter((v) => v.pend.length > 0);
    if (situacao === "pronta") lista = lista.filter((v) => v.pend.length === 0);
    return lista.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  }, [pedidos, mes, conta, situacao]);

  const pagas = vendas.filter((v) => v.status !== "cancelled");
  const soma = (f) => pagas.reduce((t, v) => t + f(v), 0);
  const total = soma((v) => v.total), taxa = soma((v) => v.taxa), frete = soma((v) => v.freteVend), liquido = soma((v) => v.liquido);
  const comNota = pagas.filter((v) => v.nf).length;
  const difValor = pagas.filter((v) => v.blingTotal && Math.abs(v.total + v.freteComp - v.blingTotal) > 0.02).length;
  const prontas = pagas.filter((v) => v.pend.length === 0).length;
  const testadas = pagas.filter((v) => v.teste === "autorizado").length;
  const iguais = pagas.filter((v) => v.comp?.iguais).length;
  const liberado = pagas.filter((v) => v.mpTem && v.mpLiberado).reduce((t, v) => t + v.mpLiq, 0);
  const aLiberar = pagas.filter((v) => v.mpTem && !v.mpLiberado).reduce((t, v) => t + v.mpLiq, 0);
  // Pontos que a contabilidade confere no fechamento: dinheiro devolvido com nota ainda autorizada, e reclamações abertas.
  const notaViva = (v) => v.nf && ["5", "6"].includes(String(v.nfSit));
  const devolvidasComNota = vendas.filter((v) => (v.status === "cancelled" || v.mpEstornado > 0) && notaViva(v));
  const emMediacao = vendas.filter((v) => v.mpAlerta.some((a) => a.includes("mediação") || a.includes("chargeback")));

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader title="Mercado Livre — modo de teste" description="Pedidos das duas contas com taxa, frete e recebimento reais (Mercado Pago), conferidos com o Bling" />

      <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 mb-6 text-sm">
        <p className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-warning" /> Tela de conferência. Nada aqui é oficial ainda.</p>
        <p className="text-muted-foreground mt-1">Até a virada de janeiro, quem recebe o pedido e emite a nota é o Bling. O ERP só lê o Mercado Livre e mostra o que faria: estes pedidos não viram pedido de venda, não mexem no estoque e não emitem nota.</p>
      </div>

      <MLContas />

      {pedidos.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="Nenhum pedido lido ainda" description="A rotina de leitura do Mercado Livre roda algumas vezes por dia." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Select value={mes || "x"} onValueChange={(v) => setMes(v === "x" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Mês" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="x">Todos os meses</SelectItem>
                {meses.map((m) => <SelectItem key={m} value={m}>{m.slice(5)}/{m.slice(0, 4)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={conta} onValueChange={setConta}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">As duas contas</SelectItem>
                <SelectItem value="router">{CONTAS.router}</SelectItem>
                <SelectItem value="saber">{CONTAS.saber}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={situacao} onValueChange={setSituacao}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as vendas</SelectItem>
                <SelectItem value="pendencia">Com pendência</SelectItem>
                <SelectItem value="pronta">Prontas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <StatCard icon={ShoppingBag} label={`Vendas pagas (${vendas.length - pagas.length} cancelada${vendas.length - pagas.length === 1 ? "" : "s"})`} value={pagas.length} />
            <StatCard icon={DollarSign} label="Valor dos produtos" value={formatCurrency(total)} color="success" />
            <StatCard icon={Percent} label={`Taxa do Mercado Livre${total ? ` (${((taxa / total) * 100).toFixed(1).replace(".", ",")}%)` : ""}`} value={formatCurrency(taxa)} color="destructive" />
            <StatCard icon={Truck} label="Frete pago por nós" value={formatCurrency(frete)} color="destructive" />
            <StatCard icon={DollarSign} label="Líquido (produtos − taxa − frete)" value={formatCurrency(liquido)} color="success" />
          </div>

          <div className="bg-card rounded-xl border border-border p-4 mb-6 text-sm flex flex-wrap gap-x-8 gap-y-1">
            <span><strong>{prontas}</strong> de {pagas.length} vendas prontas para virar pedido e nota</span>
            <span><strong>{comNota}</strong> de {pagas.length} com nota emitida no Bling</span>
            <span className={difValor ? "text-destructive" : ""}><strong>{difValor}</strong> com valor diferente do Bling</span>
            <span><strong>{testadas}</strong> notas de teste autorizadas pela SEFAZ (sem valor fiscal), <strong>{iguais}</strong> iguais à nota do Bling</span>
            <span>Mercado Pago: <strong>{formatCurrency(liberado)}</strong> já liberados e <strong>{formatCurrency(aLiberar)}</strong> a liberar</span>
          </div>

          {(devolvidasComNota.length > 0 || emMediacao.length > 0) && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 mb-6 text-sm">
              <p className="font-medium mb-1">Para conferir no fechamento com a contabilidade</p>
              {devolvidasComNota.map((v) => (
                <p key={"d" + v.chave} className="text-xs leading-5">• {fmtDia(v.data)} · {CONTAS[v.conta]} · venda de {formatCurrency(v.total)} <strong>devolvida ao comprador</strong>, mas a nota {v.nf} do Bling continua autorizada: falta cancelar a nota ou emitir a nota de devolução.</p>
              ))}
              {emMediacao.map((v) => (
                <p key={"m" + v.chave} className="text-xs leading-5">• {fmtDia(v.data)} · {CONTAS[v.conta]} · venda de {formatCurrency(v.total)} (nota {v.nf || "—"}): {v.mpAlerta.join("; ")}. O dinheiro pode ser devolvido ao comprador.</p>
              ))}
            </div>
          )}

          {/* 06/10/2026: tabela cabe inteira na janela (sem barra de rolagem lateral): largura fixa por coluna, data e conta
              na mesma célula, espaçamento menor e texto que quebra linha. */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full table-fixed text-xs">
              <colgroup>
                <col style={{ width: "8%" }} />
                <col style={{ width: "23%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "9.5%" }} />
                <col style={{ width: "9.5%" }} />
                <col style={{ width: "11%" }} />
              </colgroup>
              <thead><tr className="border-b border-border bg-muted/30 text-[11px]">
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Venda</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Itens (anúncio → produto no ERP)</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Produtos (R$)</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Taxa (R$)</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Frete (R$)</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Líquido (R$)</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Recebimento</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Bling</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Nota de teste</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Situação no ERP</th>
              </tr></thead>
              <tbody>
                {vendas.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Nenhuma venda nesta visão.</td></tr>}
                {vendas.map((v) => (
                  <tr key={v.chave} className={`border-b border-border last:border-0 align-top ${v.status === "cancelled" ? "opacity-60" : ""}`}>
                    <td className="px-2 py-2 [overflow-wrap:anywhere]">
                      <div className="text-sm">{fmtDia(v.data)}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{CONTAS_CURTO[v.conta] || CONTAS[v.conta] || v.conta}</div>
                    </td>
                    <td className="px-2 py-2 [overflow-wrap:anywhere]">
                      {v.itens.map((i, k) => (
                        <div key={k} className="leading-4 mb-0.5">
                          <span className="font-mono">{i.qtd}× {i.sku_anuncio || "sem código"}</span>
                          {i.product_sku ? <span className="text-success"> → {i.product_sku}</span> : i.kit ? <span className="text-primary"> → kit ({(i.componentes || []).map((c) => `${c.quantidade}× ${c.sku}`).join(", ")})</span> : <span className="text-destructive"> → sem cadastro</span>}
                          <span className="text-muted-foreground"> · {String(i.titulo || "").slice(0, 46)}</span>
                        </div>
                      ))}
                    </td>
                    <td className="px-1.5 py-2 text-right whitespace-nowrap tabular-nums">{fmtValor(v.total)}</td>
                    <td className="px-1.5 py-2 text-right whitespace-nowrap tabular-nums text-destructive">{fmtValor(v.taxa)}</td>
                    <td className="px-1.5 py-2 text-right whitespace-nowrap tabular-nums text-destructive">{v.logistica ? fmtValor(v.freteVend) : "—"}</td>
                    <td className="px-1.5 py-2 text-right whitespace-nowrap tabular-nums font-medium">{fmtValor(v.liquido)}</td>
                    <td className="px-2 py-2 [overflow-wrap:anywhere]">
                      {!v.mpTem ? <span className="text-muted-foreground">—</span>
                        : v.status === "cancelled" || v.mpEstornado >= v.total ? <span className="text-muted-foreground">devolvido ao comprador</span>
                        : v.mpLiberado ? <span className="text-success">liberado em {fmtDia(v.mpQuando)}</span>
                        : <span>libera em {fmtDia(v.mpQuando)}</span>}
                      {v.mpAlerta.filter((a) => !a.includes("devolvido")).map((a, k) => <div key={k} className="text-destructive">{a}</div>)}
                    </td>
                    <td className="px-2 py-2 [overflow-wrap:anywhere]">
                      {v.bling ? <>pedido {v.bling}<br />{v.nf ? `nota ${v.nf}` : <span className="text-muted-foreground">sem nota</span>}</> : <span className="text-destructive">não achei</span>}
                    </td>
                    <td className="px-2 py-2 [overflow-wrap:anywhere]">
                      {v.teste === "autorizado" ? (
                        <>
                          <span className="text-success">autorizada{v.testeNumero ? ` nº ${v.testeNumero}` : ""}</span><br />
                          {v.comp?.iguais ? <span className="text-muted-foreground">igual à do Bling</span>
                            : v.comp?.diferencas?.length ? <span className="text-warning" title={v.comp.diferencas.join("\n")}>{v.comp.diferencas.length} diferença{v.comp.diferencas.length === 1 ? "" : "s"} do Bling</span>
                            : <span className="text-muted-foreground">sem nota do Bling para comparar</span>}
                        </>
                      ) : v.teste ? <span className="text-muted-foreground">{v.teste === "nao_enviada" ? "não enviada" : v.teste}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 py-2 [overflow-wrap:anywhere]">
                      {v.status === "cancelled" ? <span className="text-muted-foreground">Cancelada no Mercado Livre</span>
                        : v.pend.length === 0 ? <span className="text-success inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Pronta</span>
                        : v.pend.map((p, k) => <div key={k} className="text-destructive">{p}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
