import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { ClipboardCheck, FileText, AlertTriangle, Download, ShoppingCart } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import PageHeader from "../components/shared/PageHeader";
import StatCard from "../components/shared/StatCard";
import EmptyState from "../components/shared/EmptyState";

/**
 * FECHAMENTO DO MÊS COM A CONTABILIDADE (03/10/2026).
 * Cruza o que foi vendido (vendas pagas do Mercado Livre + pedidos faturados do ERP) com as notas fiscais de saída
 * emitidas (hoje lidas do Bling; na virada, as do próprio ERP) e aponta o que não bate:
 * venda sem nota, nota de venda cancelada/devolvida, nota cancelada de venda paga, valor diferente, venda em disputa,
 * nota sem venda no sistema. Tudo exportável para a contabilidade.
 */
const num = (v) => parseFloat(v) || 0;
const brl = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num(v));
const mesSP = (d) => (d ? new Date(d).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7) : "");
const diaSP = (d) => (d ? (/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).slice(8, 10) + "/" + String(d).slice(5, 7) : new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })) : "—");
const EMPRESA = { router: "ROUTER 66", saber: "SABER" };
const TIPOS = {
  sem_nota: ["Venda paga sem nota fiscal", "Emitir a nota (ou registrar o número, se já foi emitida fora do sistema)."],
  nota_de_cancelada: ["Nota autorizada de venda cancelada ou devolvida", "Cancelar a nota (até o prazo) ou emitir nota de devolução/entrada."],
  nota_cancelada_venda_paga: ["Nota cancelada, mas a venda continua paga", "Emitir nova nota para a venda."],
  valor_diferente: ["Valor da nota diferente do valor da venda", "Conferir frete/desconto; se a nota estiver errada, carta de correção não resolve valor: cancelar e reemitir."],
  nome_diferente: ["Nota em nome diferente do cliente do pedido", "Conferir se é a mesma venda; se for outro cliente, o pedido está sem nota e essa nota é de outra venda."],
  disputa: ["Venda em disputa, estorno ou chargeback", "Acompanhar; se o dinheiro voltar ao comprador, tratar como devolução."],
  nota_sem_venda: ["Nota sem venda correspondente no sistema", "Venda feita fora do sistema (ou de outra empresa): registrar o pedido ou confirmar com a contabilidade."],
};

export default function Fechamento() {
  const [dados, setDados] = useState(null);
  const [mes, setMes] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); });
  const [filtro, setFiltro] = useState("todos");

  useEffect(() => {
    Promise.all([
      base44.entities.MlPedido.list("-data_pedido", 10000).catch(() => []),
      base44.entities.SaleOrder.list("-created_date", 5000).catch(() => []),
      base44.entities.FiscalNota.list("-data_emissao", 10000).catch(() => []),
    ]).then(([ml, pedidos, notas]) => setDados({ ml: ml || [], pedidos: pedidos || [], notas: notas || [] }));
  }, []);

  const meses = useMemo(() => {
    if (!dados) return [mes];
    const s = new Set([mes]);
    dados.notas.forEach((n) => { const m = mesSP(n.data_emissao); if (m) s.add(m); });
    dados.ml.forEach((p) => { const m = mesSP(p.data_pedido); if (m) s.add(m); });
    return Array.from(s).sort().reverse();
  }, [dados]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = useMemo(() => {
    if (!dados) return null;
    const { ml, pedidos, notas } = dados;
    const notasMes = notas.filter((n) => mesSP(n.data_emissao) === mes);
    const vendasML = ml.filter((p) => mesSP(p.data_pedido) === mes && !p.sale_order_id);
    const pedidosMes = pedidos.filter((o) => ((o.order_date || (o.created_date || "").slice(0, 10)) || "").startsWith(mes) && o.status !== "draft");
    const usadas = new Set();
    const itens = []; // { tipo, empresa, venda, cliente, valorVenda, nota, valorNota, obs }

    // notas por pedido da loja (Mercado Livre) e por número
    const porPedidoLoja = new Map();
    for (const n of notas) if (n.pedido_loja) (porPedidoLoja.get(n.pedido_loja) || porPedidoLoja.set(n.pedido_loja, []).get(n.pedido_loja)).push(n);
    const notaDaVendaML = (p) => {
      const cands = [...(porPedidoLoja.get(String(p.id)) || []), ...(porPedidoLoja.get(String(p.pack_id || "")) || [])]
        .filter((n) => !p.conta || n.empresa === p.conta);
      if (!cands.length && p.bling_nf_numero) return notas.find((n) => n.numero === p.bling_nf_numero && n.empresa === p.conta) || null;
      return cands.find((n) => n.situacao === "autorizada") || cands[0] || null;
    };

    // ---- Mercado Livre (carrinho: várias vendas do mesmo pack saem numa nota só → compara a soma)
    const somaPorNota = new Map();
    for (const p of vendasML) { const n = notaDaVendaML(p); if (n && p.status === "paid") somaPorNota.set(n.id, (somaPorNota.get(n.id) || 0) + num(p.total)); }
    for (const p of vendasML) {
      const n = notaDaVendaML(p); if (n) usadas.add(n.id);
      // nota registrada no Bling mas emitida fora do período carregado (ex.: venda de 31/08 com nota de 01/09): vale como nota autorizada
      const notaBling = !n && p.bling_nf_numero && [5, 6, 7].includes(parseInt(p.bling_nf_situacao, 10));
      const base = { empresa: p.conta, venda: `ML ${p.id}`, cliente: p.comprador_apelido || p.comprador?.first_name || "", valorVenda: num(p.total), nota: n ? `${n.numero} (${n.situacao})` : notaBling ? `${p.bling_nf_numero} (autorizada, Bling)` : "", valorNota: n ? num(n.valor) : null, data: p.data_pedido };
      const devolvida = num(p.mp_estornado) > 0 && num(p.mp_estornado) >= num(p.total) - 0.005;
      if (p.status === "paid" && !devolvida) {
        if (!n && notaBling) { /* ok */ }
        else if (!n || n.situacao !== "autorizada") itens.push({ ...base, tipo: n ? "nota_cancelada_venda_paga" : "sem_nota" });
        else if (Math.abs(num(n.valor) - (somaPorNota.get(n.id) || num(p.total))) > 0.01) itens.push({ ...base, tipo: "valor_diferente", obs: `nota ${brl(n.valor)} × vendas da mesma nota ${brl(somaPorNota.get(n.id) || p.total)}` });
        if (["in_mediation", "charged_back", "refunded"].includes(p.mp_status) || (num(p.mp_estornado) > 0 && !devolvida)) itens.push({ ...base, tipo: "disputa", obs: `${p.mp_status || ""}${num(p.mp_estornado) ? ` · estornado ${brl(p.mp_estornado)}` : ""}` });
      } else if (p.status === "cancelled" || devolvida) {
        if (n && n.situacao === "autorizada") itens.push({ ...base, tipo: "nota_de_cancelada", obs: devolvida ? "venda devolvida (dinheiro voltou ao comprador)" : "venda cancelada" });
      }
    }

    // ---- pedidos do ERP (venda direta): nota pelo número registrado no pedido ou pelo valor/data (provável)
    const notaDoPedido = (o) => {
      if (o.invoice_number) { const n = notas.find((x) => x.numero && x.numero.replace(/^0+/, "") === String(o.invoice_number).replace(/^0+/, "")); if (n) return { n, como: "número" }; }
      if (o.nfe_numero && o.nfe_ambiente === "producao") { const n = notas.find((x) => x.numero && x.numero.replace(/^0+/, "") === String(o.nfe_numero).replace(/^0+/, "")); if (n) return { n, como: "número" }; }
      const d = (o.order_date || (o.created_date || "").slice(0, 10)) || "";
      // mesmo valor, nota sem pedido da loja, emitida até 31 dias antes ou depois do pedido; se houver mais de uma, a de data mais próxima
      const dist = (x) => Math.abs((new Date(String(x.data_emissao).slice(0, 10)) - new Date(d.slice(0, 10))) / 864e5);
      const cand = notas.filter((x) => !usadas.has(x.id) && !x.pedido_loja && Math.abs(num(x.valor) - num(o.total)) <= 0.01 && dist(x) <= 31).sort((a, b) => dist(a) - dist(b));
      return cand.length ? { n: cand[0], como: "valor igual (provável)" } : null;
    };
    for (const o of pedidosMes) {
      const m = notaDoPedido(o); const n = m?.n; if (n) usadas.add(n.id);
      const base = { empresa: n?.empresa || "", venda: o.order_number, cliente: o.customer_name || "", valorVenda: num(o.total), nota: n ? `${n.numero} (${n.situacao})${m.como.includes("provável") ? " · ligação pelo valor" : ""}` : "", valorNota: n ? num(n.valor) : null, data: o.order_date || o.created_date };
      if (["invoiced", "shipped", "delivered"].includes(o.status)) {
        if (!n || n.situacao !== "autorizada") itens.push({ ...base, tipo: n ? "nota_cancelada_venda_paga" : "sem_nota" });
        else if (n.contato_nome && o.customer_name && n.contato_nome.split(" ")[0].toLowerCase() !== o.customer_name.split(" ")[0].toLowerCase()) itens.push({ ...base, tipo: "nome_diferente", obs: `nota em nome de ${n.contato_nome}` });
      } else if (o.status === "cancelled" && n && n.situacao === "autorizada") {
        itens.push({ ...base, tipo: "nota_de_cancelada", obs: "pedido cancelado no ERP" });
      }
    }

    // ---- notas do mês sem venda no sistema
    for (const n of notasMes) {
      if (usadas.has(n.id)) continue;
      itens.push({ tipo: "nota_sem_venda", empresa: n.empresa, venda: "", cliente: n.contato_nome || "", valorVenda: null, nota: `${n.numero} (${n.situacao})`, valorNota: num(n.valor), data: n.data_emissao, obs: n.pedido_loja ? `pedido da loja ${n.pedido_loja} não está no sistema` : "" });
    }

    const vendidoML = vendasML.filter((p) => p.status === "paid").reduce((s, p) => s + num(p.total), 0);
    const vendidoERP = pedidosMes.filter((o) => ["invoiced", "shipped", "delivered"].includes(o.status)).reduce((s, o) => s + num(o.total), 0);
    const porEmpresa = {};
    for (const n of notasMes) { const e = porEmpresa[n.empresa] = porEmpresa[n.empresa] || { autorizadas: 0, vAut: 0, canceladas: 0, vCanc: 0, outras: 0 }; if (n.situacao === "autorizada") { e.autorizadas++; e.vAut += num(n.valor); } else if (n.situacao === "cancelada") { e.canceladas++; e.vCanc += num(n.valor); } else e.outras++; }
    const autorizadas = notasMes.filter((n) => n.situacao === "autorizada");
    return { itens, notasMes, vendasML, pedidosMes, vendidoML, vendidoERP, porEmpresa, nAut: autorizadas.length, vAut: autorizadas.reduce((s, n) => s + num(n.valor), 0), nCanc: notasMes.filter((n) => n.situacao === "cancelada").length };
  }, [dados, mes]);

  const exportar = () => {
    if (!r) return;
    const linhas = [["Tipo", "Empresa", "Venda", "Cliente", "Valor da venda", "Nota", "Valor da nota", "Observação", "O que fazer"]];
    for (const i of r.itens) linhas.push([TIPOS[i.tipo][0], EMPRESA[i.empresa] || i.empresa || "", i.venda, i.cliente, i.valorVenda != null ? i.valorVenda.toFixed(2).replace(".", ",") : "", i.nota, i.valorNota != null ? i.valorNota.toFixed(2).replace(".", ",") : "", i.obs || "", TIPOS[i.tipo][1]]);
    linhas.push([]); linhas.push(["NOTAS FISCAIS DO MÊS"]); linhas.push(["Empresa", "Número", "Série", "Emissão", "Situação", "Valor", "Cliente", "Documento", "UF", "Pedido da loja", "Chave"]);
    for (const n of [...r.notasMes].sort((a, b) => (a.empresa + a.numero).localeCompare(b.empresa + b.numero))) linhas.push([EMPRESA[n.empresa] || n.empresa, n.numero, n.serie, diaSP(n.data_emissao) + "/" + mes.slice(0, 4), n.situacao, num(n.valor).toFixed(2).replace(".", ","), n.contato_nome, n.contato_doc, n.contato_uf, n.pedido_loja || "", n.chave || ""]);
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `fechamento-${mes}.csv`; a.click();
  };

  if (!r) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  const lista = r.itens.filter((i) => filtro === "todos" || i.tipo === filtro).sort((a, b) => Object.keys(TIPOS).indexOf(a.tipo) - Object.keys(TIPOS).indexOf(b.tipo) || String(a.data).localeCompare(String(b.data)));
  const contagem = Object.fromEntries(Object.keys(TIPOS).map((t) => [t, r.itens.filter((i) => i.tipo === t).length]));
  const rotuloMes = (m) => new Date(m + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div>
      <PageHeader title="Fechamento do mês" description="Vendas × notas fiscais, para fechar o mês com a contabilidade sem conferência manual"
        actions={<Button variant="outline" onClick={exportar}><Download className="w-4 h-4 mr-1" /> Baixar para a contabilidade (CSV)</Button>} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-56 h-10 text-base font-medium capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>{meses.map((m) => <SelectItem key={m} value={m} className="capitalize">{rotuloMes(m)}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Notas lidas do Bling (ROUTER 66 e SABER) todo dia de manhã; vendas do Mercado Livre lidas da conta 4× ao dia.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard icon={ShoppingCart} label="Vendido no mês" value={brl(r.vendidoML + r.vendidoERP)} subtitle={`Mercado Livre ${brl(r.vendidoML)} · pedidos do ERP ${brl(r.vendidoERP)}`} />
        <StatCard icon={FileText} label={`Notas autorizadas (${r.nAut})`} value={brl(r.vAut)} subtitle={Object.entries(r.porEmpresa).map(([e, x]) => `${EMPRESA[e] || e}: ${x.autorizadas} · ${brl(x.vAut)}`).join(" | ") || "nenhuma nota no mês"} />
        <StatCard icon={FileText} label="Notas canceladas" value={r.nCanc} color={r.nCanc ? "warning" : "success"} />
        <StatCard icon={AlertTriangle} label="Pontos para resolver" value={r.itens.length} color={r.itens.length ? "destructive" : "success"} subtitle={r.itens.length ? "antes de fechar o mês" : "mês fechado sem pendências"} />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => setFiltro("todos")} className={`text-xs px-3 py-1 rounded-full border ${filtro === "todos" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>Todos ({r.itens.length})</button>
        {Object.entries(TIPOS).map(([t, [rotulo]]) => contagem[t] > 0 && (
          <button key={t} onClick={() => setFiltro(t)} className={`text-xs px-3 py-1 rounded-full border ${filtro === t ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{rotulo} ({contagem[t]})</button>
        ))}
      </div>

      {r.itens.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Nada a resolver" description="Toda venda paga tem nota autorizada e toda nota tem venda. Pode mandar para a contabilidade." />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">O que não bate</th>
                <th className="text-left px-4 py-3 font-medium">Empresa</th>
                <th className="text-left px-4 py-3 font-medium">Venda</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-right px-4 py-3 font-medium">Valor da venda</th>
                <th className="text-left px-4 py-3 font-medium">Nota</th>
                <th className="text-right px-4 py-3 font-medium">Valor da nota</th>
                <th className="text-left px-4 py-3 font-medium">O que fazer</th>
              </tr></thead>
              <tbody>
                {lista.map((i, n) => (
                  <tr key={n} className="border-b border-border last:border-0 align-top hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-xs"><span className={`inline-flex px-2 py-0.5 rounded-full ${i.tipo === "nota_sem_venda" ? "bg-muted text-foreground" : ["disputa", "nome_diferente"].includes(i.tipo) ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}`}>{TIPOS[i.tipo][0]}</span>{i.obs && <div className="text-[11px] text-muted-foreground mt-0.5">{i.obs}</div>}</td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">{EMPRESA[i.empresa] || i.empresa || "—"}</td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">{i.venda || "—"}<div className="text-[11px] text-muted-foreground">{diaSP(i.data)}</div></td>
                    <td className="px-4 py-2.5 text-xs max-w-[200px] truncate" title={i.cliente}>{i.cliente || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-right whitespace-nowrap">{i.valorVenda != null ? brl(i.valorVenda) : "—"}</td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">{i.nota || <span className="text-destructive">sem nota</span>}</td>
                    <td className="px-4 py-2.5 text-xs text-right whitespace-nowrap">{i.valorNota != null ? brl(i.valorNota) : "—"}</td>
                    <td className="px-4 py-2.5 text-[11px] text-muted-foreground max-w-xs">{TIPOS[i.tipo][1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground mt-3">Venda do Mercado Livre casa com a nota pelo número do pedido gravado na nota; pedido do ERP casa pelo número da nota registrado no pedido ou, na falta, por valor igual no mesmo período (marcado como "ligação pelo valor"). Nota sem venda no sistema não é erro fiscal: é venda que não passou pelo ERP.</p>
    </div>
  );
}
