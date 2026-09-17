import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Search, Wrench, Pencil, Trash2, DollarSign, Clock, Fuel, CheckCircle2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import StatCard from "../components/shared/StatCard";
import { usePermissoes } from "@/hooks/usePermissoes";
import { reconciliarPedidoVenda } from "@/lib/stockService";

// Tipos de despesa de viagem — viram a categoria "Despesas de Viagem (OS)" no
// Financeiro, com o tipo no texto do lançamento (dá pra filtrar na busca).
const TIPOS_DESPESA = [
  { value: "combustivel", label: "Combustível" },
  { value: "pedagio", label: "Pedágio" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "hospedagem", label: "Hospedagem" },
  { value: "estacionamento", label: "Estacionamento" },
  { value: "outros", label: "Outros" },
];
const labelDespesa = (v) => TIPOS_DESPESA.find(t => t.value === v)?.label || v;

const STATUS_OS = [
  { value: "aberta", label: "Aberta", cor: "bg-blue-100 text-blue-700" },
  { value: "em_execucao", label: "Em execução", cor: "bg-warning/10 text-warning" },
  { value: "concluida", label: "Concluída", cor: "bg-success/10 text-success" },
  { value: "cancelada", label: "Cancelada", cor: "bg-muted text-muted-foreground" },
];
const statusInfo = (v) => STATUS_OS.find(s => s.value === v) || STATUS_OS[0];

// Mesmos códigos de método que o Financeiro usa nas contas de caixa (metodos[]).
const FORMAS_PAGAMENTO = [
  { value: "pix", label: "Pix" },
  { value: "credit_card", label: "Cartão de Crédito" },
  { value: "debit_card", label: "Cartão de Débito" },
  { value: "boleto", label: "Boleto" },
  { value: "paypal", label: "PayPal" },
  { value: "transfer", label: "Transferência" },
  { value: "cash", label: "Dinheiro" },
];
const labelForma = (v) => FORMAS_PAGAMENTO.find(f => f.value === v)?.label || v || "—";

const formatCurrency = (val) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);
const num = (v) => parseFloat(v) || 0;
const hoje = () => new Date().toISOString().slice(0, 10);
const fmtData = (d) => d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—";
// Texto digitado pelo usuário vai para dentro de document.write no PDF — escapar sempre.
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Totais de uma OS — a MESMA conta na tela, no financeiro, no resumo e no PDF.
function totaisOS(os) {
  const horas = num(os.horas) * num(os.valor_hora);
  const despesas = (os.despesas || []).reduce((s, d) => s + num(d.valor), 0);
  const despesasCobradas = (os.despesas || []).filter(d => d.cobrar !== false).reduce((s, d) => s + num(d.valor), 0);
  const pecas = (os.pecas || []).reduce((s, p) => s + num(p.quantity) * num(p.unit_price), 0);
  const cobrado = Math.max(0, horas + despesasCobradas + pecas - num(os.desconto_brl));
  return { horas, despesas, despesasCobradas, pecas, cobrado, resultado: cobrado - despesas };
}

export default function ServiceOrders() {
  const { pode } = usePermissoes();
  const verCustos = pode("custos");

  const [ordens, setOrdens] = useState([]);
  const [contatos, setContatos] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [contasCaixa, setContasCaixa] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todas");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [os, cts, prods, contas] = await Promise.all([
        base44.entities.ServiceOrder.list("-created_date", 500),
        base44.entities.Contato.list("-created_date", 1000),
        base44.entities.Product.filter({ status: "active" }, "name", 1000),
        base44.entities.CashAccount.list("nome", 50),
      ]);
      setOrdens(os || []);
      setContatos(cts || []);
      setProdutos(prods || []);
      setContasCaixa(contas || []);
    } catch (err) {
      alert(`Não foi possível carregar as Ordens de Serviço: ${err.message}`);
    }
    setLoading(false);
  };

  const clientes = contatos.filter(c => (c.tipos || []).includes("Cliente"));
  const tecnicos = contatos.filter(c => (c.tipos || []).some(t => ["Técnico", "Colaborador", "Diretor"].includes(t)));
  const contasAtivas = contasCaixa.filter(c => c.ativo !== false);

  // Conta de caixa dona do método (Pix → Itaú, cartão → Rede…), igual ao pedido de venda.
  const contaPara = (metodo) => contasAtivas.find(c => (c.metodos || []).includes(metodo))?.id || "";

  const openNew = () => {
    setEditing(null);
    setForm({
      status: "aberta",
      data: hoje(),
      data_entrada: hoje(),
      data_conclusao: "",
      despesas: [],
      pecas: [],
      forma_pagamento: "pix",
      account_id: contaPara("pix"),
      valor_hora: num(localStorage.getItem("os_valor_hora")) || "",
    });
    setDialogOpen(true);
  };

  const openEdit = (os) => {
    setEditing(os);
    const forma = os.forma_pagamento || "pix";
    setForm({
      ...os,
      despesas: os.despesas || [],
      pecas: os.pecas || [],
      forma_pagamento: forma,
      account_id: os.account_id || contaPara(forma),
    });
    setDialogOpen(true);
  };

  const f = (field) => (e) => {
    const val = e.target.type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value;
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const setDespesa = (ix, campo, valor) => setForm(prev => ({
    ...prev,
    despesas: prev.despesas.map((d, i) => i === ix ? { ...d, [campo]: valor } : d),
  }));

  const setPeca = (ix, campo, valor) => setForm(prev => ({
    ...prev,
    pecas: prev.pecas.map((p, i) => i === ix ? { ...p, [campo]: valor } : p),
  }));

  // Escolheu um produto: puxa nome, SKU e sugere o preço de venda. "Manual" limpa o vínculo.
  const escolherProdutoPeca = (ix, productId) => {
    const p = produtos.find(x => x.id === productId);
    setForm(prev => ({
      ...prev,
      pecas: prev.pecas.map((peca, i) => i !== ix ? peca : (p
        ? { ...peca, product_id: p.id, name: p.name, sku: p.sku || "", unit_price: num(p.sale_price) || peca.unit_price || "" }
        : { ...peca, product_id: "", sku: "" })),
    }));
  };

  // Ao virar Concluída com a data de conclusão vazia, preenche com hoje (continua editável).
  const mudarStatus = (v) => setForm(prev => ({
    ...prev,
    status: v,
    data_conclusao: v === "concluida" && !prev.data_conclusao ? hoje() : prev.data_conclusao,
  }));

  const mudarFormaPagamento = (v) => setForm(prev => ({ ...prev, forma_pagamento: v, account_id: contaPara(v) }));

  // ==== Financeiro: 1 conta a receber (o que o cliente paga) + 1 conta paga
  // (o que saiu do bolso na viagem). Idempotente por reference_id — editar e
  // salvar de novo REFAZ os lançamentos, nunca duplica.
  const sincronizarFinanceiro = async (osId, os) => {
    const antigas = await base44.entities.FinancialEntry.filter(
      { reference_id: osId, reference_type: "service_order" }, "-created_date", 50
    ).catch(() => []);
    // Cobrança já RECEBIDA nunca é apagada (dinheiro no caixa é fato); só o que
    // está pendente e as despesas automáticas são refeitos.
    const recebidasPagas = antigas.filter(e => e.type === "receivable" && e.status === "paid");
    for (const e of antigas) {
      if (e.type === "receivable" && e.status === "paid") continue;
      await base44.entities.FinancialEntry.delete(e.id).catch(() => {});
    }
    if (os.status !== "concluida") return;

    const t = totaisOS(os);
    const jaRecebido = recebidasPagas.reduce((s, e) => s + num(e.amount), 0);
    const restante = Math.round((t.cobrado - jaRecebido) * 100) / 100;
    // Pagamento misto (Larissa 17/09): linhas preenchidas MANDAM — cada uma vira conta a receber
    // com a forma, a data e a conta dela (parte Pix hoje, parte cartão na semana que vem…).
    const linhas = (os.pagamentos || []).filter(l => num(l.valor) > 0);
    if (restante > 0 && linhas.length) {
      const somaLinhas = linhas.reduce((sm, l) => sm + num(l.valor), 0);
      const fator = somaLinhas > 0 ? restante / somaLinhas : 1; // reescala se a soma não bater com o restante
      const rot = { pix: "Pix", credit_card: "Cartão de Crédito", debit_card: "Cartão de Débito", boleto: "Boleto", paypal: "PayPal", transfer: "Transferência", cash: "Dinheiro" };
      for (const l of linhas) {
        const valor = Math.round(num(l.valor) * fator * 100) / 100;
        if (valor <= 0) continue;
        await base44.entities.FinancialEntry.create({
          type: "receivable", category: "servicos_os",
          description: `OS #${os.numero} — ${os.cliente_nome || "Cliente"} · ${rot[l.metodo] || l.metodo}${linhas.length > 1 ? ` (${linhas.indexOf(l) + 1}/${linhas.length})` : ""}`,
          amount: valor, due_date: l.data || os.vencimento || os.data,
          status: l.pago && l.data ? "paid" : "pending", ...(l.pago && l.data ? { payment_date: l.data } : {}),
          payment_method: l.metodo || "pix", account_id: l.account_id || contaPara(l.metodo || "pix") || null,
          reference_id: osId, reference_type: "service_order",
        });
      }
    } else if (restante > 0) {
      await base44.entities.FinancialEntry.create({
        type: "receivable",
        category: "servicos_os",
        description: `OS #${os.numero} — ${os.cliente_nome || "Cliente"}${os.equipamento ? ` · ${os.equipamento}` : ""}${jaRecebido > 0 ? " (restante)" : ""}`,
        amount: restante,
        due_date: os.vencimento || os.data,
        status: "pending",
        payment_method: os.forma_pagamento || "pix",
        account_id: os.account_id || null,
        reference_id: osId,
        reference_type: "service_order",
      });
    }
    if (t.despesas > 0) {
      const detalhe = (os.despesas || []).map(d => `${labelDespesa(d.tipo)} ${formatCurrency(num(d.valor))}`).join(", ");
      await base44.entities.FinancialEntry.create({
        type: "payable",
        category: "despesas_viagem_os",
        description: `Despesas OS #${os.numero} — ${os.cliente_nome || "Cliente"} (${detalhe})`,
        amount: Math.round(t.despesas * 100) / 100,
        due_date: os.data,
        status: "paid",
        payment_method: "pix",
        reference_id: osId,
        reference_type: "service_order",
      });
    }
  };

  const handleSave = async () => {
    if (!form.cliente_nome?.trim() && !form.contato_id) { alert("Informe o cliente."); return; }
    const pecaSemNome = (form.pecas || []).find(p => !p.product_id && !String(p.name || "").trim() && (num(p.quantity) > 0 || num(p.unit_price) > 0));
    if (pecaSemNome) { alert("Há uma peça manual sem descrição. Escolha o produto ou digite o nome da peça."); return; }
    setSaving(true);
    try {
      const cliente = clientes.find(c => c.id === form.contato_id);
      const data = {
        ...form,
        cliente_nome: cliente?.name || form.cliente_nome || "",
        despesas: (form.despesas || []).filter(d => num(d.valor) > 0 || d.descricao),
        pecas: (form.pecas || [])
          .filter(p => p.product_id || String(p.name || "").trim())
          .map(p => ({ product_id: p.product_id || "", name: p.name || "", sku: p.sku || "", quantity: num(p.quantity), unit_price: num(p.unit_price) })),
        data_entrada: form.data_entrada || null,
        data_conclusao: form.data_conclusao || null,
        vencimento: form.vencimento || null,
        account_id: form.account_id || null,
      };
      // Virou Concluída por outro caminho que não o seletor: garante a data de conclusão.
      if (data.status === "concluida" && !data.data_conclusao && editing?.status !== "concluida") data.data_conclusao = hoje();
      if (!editing) {
        data.numero = (ordens.reduce((m, o) => Math.max(m, o.numero || 0), 0)) + 1;
      }
      if (num(form.valor_hora) > 0) localStorage.setItem("os_valor_hora", String(num(form.valor_hora)));

      const salvo = editing
        ? await base44.entities.ServiceOrder.update(editing.id, data)
        : await base44.entities.ServiceOrder.create(data);
      // A OS já está salva daqui em diante: falha no estoque ou no Financeiro NÃO pode
      // reabrir o fluxo (senão o segundo clique duplica a OS com o mesmo número).
      const osId = salvo?.id || editing?.id;
      const numero = data.numero || editing?.numero;
      const osSalva = { ...data, numero };

      // Estoque: CONCLUÍDA baixa as peças com produto cadastrado; qualquer outro
      // status devolve. Reconcilia pelo Kardex (origem_id = id da OS), então
      // editar quantidades ou reabrir a OS gera só a diferença.
      const pecasComProduto = osSalva.pecas.filter(p => p.product_id && p.quantity > 0);
      try {
        await reconciliarPedidoVenda(osId, `OS #${numero}`, pecasComProduto, osSalva.status === "concluida");
      } catch (errEst) {
        // Saldo insuficiente (ou falha na movimentação): a OS volta ao status
        // anterior, sem lançar nada no Financeiro.
        const statusAnterior = editing?.status || "aberta";
        let extra = "";
        if (statusAnterior !== "concluida") {
          // Desfaz uma baixa parcial (1ª peça passou, 2ª não) — devolve tudo desta OS.
          try { await reconciliarPedidoVenda(osId, `OS #${numero}`, pecasComProduto, false); }
          catch (e2) { extra = `\n\nAtenção: não consegui desfazer a baixa parcial de estoque (${e2.message}). Confira o Kardex da OS #${numero}.`; }
        }
        try {
          await base44.entities.ServiceOrder.update(osId, { status: statusAnterior, data_conclusao: editing?.data_conclusao || null });
        } catch (e3) { extra += `\n\nE não consegui voltar o status da OS (${e3.message}).`; }
        alert(`Estoque: ${errEst.message}\n\nA OS #${numero} foi salva com o status "${statusInfo(statusAnterior).label}" e nada foi lançado no Financeiro. Acerte o estoque ou as peças e salve de novo como Concluída.${extra}`);
        setDialogOpen(false);
        loadData();
        setSaving(false);
        return;
      }

      try {
        await sincronizarFinanceiro(osId, osSalva);
      } catch (errFin) {
        alert(`A OS foi salva, mas os lançamentos no Financeiro falharam: ${errFin.message}\n\nReabra a OS e salve de novo (ou peça a um administrador).`);
      }
      setDialogOpen(false);
      loadData();
    } catch (err) {
      alert(`Não foi possível salvar a OS: ${err.message}`);
    }
    setSaving(false);
  };

  const handleDelete = async (os) => {
    if (!confirm(`Excluir a OS #${os.numero}? Peças baixadas voltam ao estoque e os lançamentos EM ABERTO dela no Financeiro também serão removidos (cobranças já recebidas ficam — dinheiro no caixa é histórico).`)) return;
    try {
      // Devolve ao estoque o que esta OS tinha baixado (reconcilia para zero).
      await reconciliarPedidoVenda(os.id, `OS #${os.numero}`, (os.pecas || []).filter(p => p.product_id), false);
      const refs = await base44.entities.FinancialEntry.filter(
        { reference_id: os.id, reference_type: "service_order" }, "-created_date", 50
      ).catch(() => []);
      for (const e of refs) {
        if (e.type === "receivable" && e.status === "paid") continue; // receita recebida é fato
        await base44.entities.FinancialEntry.delete(e.id);
      }
      await base44.entities.ServiceOrder.delete(os.id);
    } catch (err) {
      alert(`Não foi possível excluir a OS: ${err.message}`);
    }
    loadData();
  };

  // ==== PDF da OS — documento para o CLIENTE: nunca mostra custo de viagem não
  // cobrado nem o resultado da OS. Mesmo visual do PDF do pedido de venda.
  const gerarPdfOS = (o) => {
    const t = totaisOS(o);
    const cli = contatos.find(c => c.id === o.contato_id);
    const cliLinhas = [
      cli?.document && `${cli.person_type === "PJ" || String(cli.document).replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF"}: ${cli.document}`,
      (cli?.whatsapp || cli?.phone) && `Tel.: ${cli.whatsapp || cli.phone}`,
      cli?.email,
      cli?.address && [`${cli.address}${cli.address_number ? `, ${cli.address_number}` : ""}`, cli.neighborhood, cli.city && `${cli.city}/${cli.state || ""}`].filter(Boolean).join(" — "),
    ].filter(Boolean);
    const pecas = (o.pecas || []).filter(p => p.product_id || p.name);
    const despesasCobradas = (o.despesas || []).filter(d => d.cobrar !== false && num(d.valor) > 0);
    const w = window.open("", "_blank");
    if (!w) { alert("O navegador bloqueou a janela do PDF — libere pop-ups para o ERP e tente de novo."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>OS ${esc(o.numero)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:32px;font-size:13px}
  .topo{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #e65c00;padding-bottom:12px}
  .topo img{height:52px}
  h1{font-size:20px;margin:0}
  .muted{color:#666;font-size:11px}
  .bloco{margin-top:16px;border:1px solid #ddd;border-radius:8px;padding:12px}
  .bloco h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#e65c00;margin:0 0 6px}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th{background:#f5f5f5;text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase}
  td{padding:6px 8px;border-bottom:1px solid #eee}
  .dir{text-align:right}
  .tot{font-size:15px;font-weight:bold}
  .duas{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .pre{white-space:pre-wrap}
  @media print{ .noprint{display:none} }
</style></head><body>
<div class="topo">
  <div style="display:flex;align-items:center;gap:12px">
    <img src="${window.location.origin}/logo.png" onerror="this.style.display='none'">
    <div><h1>ROBOOSTER</h1><div class="muted">R B RESSUTI LTDA · CNPJ 43.926.449/0001-98<br>Av. Fernando Stecca, 745 — Iporanga — Sorocaba/SP — CEP 18087-149<br>www.robooster.com.br</div></div>
  </div>
  <div style="text-align:right">
    <div class="tot">ORDEM DE SERVIÇO Nº ${esc(o.numero)}</div>
    <div class="muted">Entrada: ${fmtData(o.data_entrada)} · Serviço: ${fmtData(o.data)} · Conclusão: ${fmtData(o.data_conclusao)}</div>
    <div class="muted">Status: ${esc(statusInfo(o.status).label)}</div>
  </div>
</div>

<div class="duas">
  <div class="bloco"><h2>Cliente</h2><strong>${esc(o.cliente_nome || cli?.name || "—")}</strong>${cliLinhas.map(l => `<div class="muted">${esc(l)}</div>`).join("")}</div>
  <div class="bloco"><h2>Equipamento</h2><strong>${esc(o.equipamento || "—")}</strong>${o.tecnico ? `<div class="muted">Técnico responsável: ${esc(o.tecnico)}</div>` : ""}</div>
</div>

${o.problema ? `<div class="bloco"><h2>Problema relatado</h2><div class="pre">${esc(o.problema)}</div></div>` : ""}
${o.recebimento ? `<div class="bloco"><h2>Descrição do recebimento</h2><div class="pre">${esc(o.recebimento)}</div></div>` : ""}
${o.descricao ? `<div class="bloco"><h2>Descrição do serviço</h2><div class="pre">${esc(o.descricao)}</div></div>` : ""}

${pecas.length ? `<div class="bloco"><h2>Peças de reposição</h2>
<table><thead><tr><th>Código</th><th>Descrição</th><th class="dir">Qtd</th><th class="dir">Unit.</th><th class="dir">Total</th></tr></thead><tbody>
${pecas.map(p => `<tr><td>${esc(p.sku || "—")}</td><td>${esc(p.name || "—")}</td><td class="dir">${esc(num(p.quantity))}</td><td class="dir">${formatCurrency(num(p.unit_price))}</td><td class="dir">${formatCurrency(num(p.quantity) * num(p.unit_price))}</td></tr>`).join("")}
</tbody></table></div>` : ""}

<div class="bloco"><h2>Valores</h2>
<table><tbody>
${num(o.horas) > 0 ? `<tr><td>Hora técnica — ${esc(o.horas)}h × ${formatCurrency(num(o.valor_hora))}</td><td class="dir">${formatCurrency(t.horas)}</td></tr>` : ""}
${pecas.length ? `<tr><td>Peças de reposição</td><td class="dir">${formatCurrency(t.pecas)}</td></tr>` : ""}
${despesasCobradas.map(d => `<tr><td>${esc(labelDespesa(d.tipo))}${d.descricao ? ` — ${esc(d.descricao)}` : ""}</td><td class="dir">${formatCurrency(num(d.valor))}</td></tr>`).join("")}
${num(o.desconto_brl) > 0 ? `<tr><td>Desconto</td><td class="dir">− ${formatCurrency(num(o.desconto_brl))}</td></tr>` : ""}
<tr><td class="tot">TOTAL</td><td class="dir tot">${formatCurrency(t.cobrado)}</td></tr>
</tbody></table>
<div class="muted" style="margin-top:8px">Forma de pagamento: ${esc(labelForma(o.forma_pagamento))} · Vencimento: ${fmtData(o.vencimento || o.data)}</div>
</div>

<div class="muted" style="margin-top:24px">Documento gerado em ${new Date().toLocaleString("pt-BR")} pelo ERP Robooster.</div>
<div class="noprint" style="margin-top:24px"><button onclick="window.print()" style="padding:10px 20px;font-size:14px;cursor:pointer">Imprimir / Salvar PDF</button></div>
</body></html>`);
    w.document.close();
  };

  // ==== Resumo do mês corrente ====
  const mesAtual = new Date().toISOString().slice(0, 7);
  const osMes = ordens.filter(o => o.status === "concluida" && (o.data || "").startsWith(mesAtual));
  const resumoMes = osMes.reduce((acc, o) => {
    const t = totaisOS(o);
    return {
      cobrado: acc.cobrado + t.cobrado,
      despesas: acc.despesas + t.despesas,
      horas: acc.horas + num(o.horas),
    };
  }, { cobrado: 0, despesas: 0, horas: 0 });

  const filtered = ordens.filter(o => {
    if (filtroStatus !== "todas" && o.status !== filtroStatus) return false;
    const q = search.toLowerCase();
    return !q || o.cliente_nome?.toLowerCase().includes(q) || o.equipamento?.toLowerCase().includes(q) || String(o.numero).includes(q) || o.tecnico?.toLowerCase().includes(q);
  });

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  const totaisForm = totaisOS(form);

  // Opções do seletor de cliente: "Digitar nome" primeiro; OS antiga cujo contato
  // deixou de ser Cliente (ou foi apagado) continua abrindo com o nome gravado.
  const opcoesClientes = [
    { value: "livre", label: "Digitar nome (cliente sem cadastro)" },
    ...clientes.map(c => ({
      value: c.id, label: c.name,
      sub: [c.document, c.whatsapp || c.phone].filter(Boolean).join(" · "),
      keywords: [c.document, c.phone, c.whatsapp, c.email, c.trade_name],
    })),
  ];
  if (form.contato_id && !clientes.some(c => c.id === form.contato_id)) {
    opcoesClientes.push({ value: form.contato_id, label: form.cliente_nome || "(contato fora do cadastro de clientes)" });
  }
  const opcoesProdutos = produtos.map(p => ({
    value: p.id, label: p.name,
    sub: [p.sku, p.category_name].filter(Boolean).join(" · "),
    keywords: [p.sku, p.category_name, p.barcode],
  }));

  return (
    <div>
      <PageHeader
        title="Ordens de Serviço"
        description="Serviço externo com hora técnica, peças e despesas de viagem — concluiu, caiu no Financeiro e no estoque"
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nova OS</Button>}
      />

      <div className={`grid grid-cols-2 ${verCustos ? "lg:grid-cols-4" : "lg:grid-cols-2"} gap-3 mb-4`}>
        <StatCard icon={CheckCircle2} label={`OS concluídas no mês`} value={osMes.length} color="primary" />
        <StatCard icon={Clock} label="Horas técnicas no mês" value={`${resumoMes.horas}h`} color="primary" />
        {verCustos && <StatCard icon={DollarSign} label="Faturado em serviços (mês)" value={formatCurrency(resumoMes.cobrado)} color="success" />}
        {verCustos && <StatCard icon={Fuel} label="Despesas de viagem (mês)" value={formatCurrency(resumoMes.despesas)} color="destructive" />}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[{ value: "todas", label: "Todas" }, ...STATUS_OS].map(s => (
          <button key={s.value} onClick={() => setFiltroStatus(s.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${filtroStatus === s.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
            {s.label}
          </button>
        ))}
        <div className="ml-auto max-w-xs relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente, nº, técnico..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Wrench} title="Nenhuma ordem de serviço" description="Abra a primeira OS: cliente, horas técnicas e despesas da viagem." actionLabel="Nova OS" onAction={openNew} />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nº</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Data</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Técnico</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Horas</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr></thead>
              <tbody>
                {filtered.map(o => {
                  const t = totaisOS(o);
                  const si = statusInfo(o.status);
                  return (
                    <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs">#{o.numero}</td>
                      <td className="px-4 py-3 text-xs hidden sm:table-cell">
                        {fmtData(o.data)}
                        {(o.data_entrada || o.data_conclusao) && (
                          <span className="block text-[10px] text-muted-foreground whitespace-nowrap">
                            {[o.data_entrada && `Entrada ${fmtData(o.data_entrada)}`, o.data_conclusao && `Conclusão ${fmtData(o.data_conclusao)}`].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3"><span className="font-medium">{o.cliente_nome || "—"}</span>{o.equipamento && <span className="block text-xs text-muted-foreground">{o.equipamento}</span>}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs">{o.tecnico || "—"}</td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">{num(o.horas) ? `${o.horas}h` : "—"}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(t.cobrado)}</td>
                      <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${si.cor}`}>{si.label}</span></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => gerarPdfOS(o)} className="p-1.5 hover:bg-muted rounded-lg" title="PDF da OS (enviar ao cliente)"><Printer className="w-4 h-4 text-primary" /></button>
                        <button onClick={() => openEdit(o)} className="p-1.5 hover:bg-muted rounded-lg"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                        <button onClick={() => handleDelete(o)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-4 h-4 text-destructive" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `Editar OS #${editing.numero}` : "Nova Ordem de Serviço"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label>Cliente *</Label>
                <Combobox
                  value={form.contato_id || "livre"}
                  onChange={v => setForm(prev => ({ ...prev, contato_id: v === "livre" ? "" : v }))}
                  placeholder="Selecione o cliente"
                  searchPlaceholder="Nome, CPF, CNPJ ou telefone…"
                  emptyText="Nenhum cliente com esse nome ou documento"
                  options={opcoesClientes}
                />
                {!form.contato_id && <Input className="mt-2" value={form.cliente_nome || ""} onChange={f("cliente_nome")} placeholder="Nome do cliente" />}
              </div>
              <div>
                <Label>Técnico responsável</Label>
                <Select value={form.tecnico || "nenhum"} onValueChange={v => setForm({ ...form, tecnico: v === "nenhum" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">—</SelectItem>
                    {tecnicos.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Data de entrada</Label><Input type="date" value={form.data_entrada || ""} onChange={f("data_entrada")} /><p className="text-[10px] text-muted-foreground mt-1">Quando o equipamento chegou.</p></div>
              <div><Label>Data do serviço</Label><Input type="date" value={form.data || ""} onChange={f("data")} /></div>
              <div><Label>Data de conclusão</Label><Input type="date" value={form.data_conclusao || ""} onChange={f("data_conclusao")} /><p className="text-[10px] text-muted-foreground mt-1">Preenche sozinha ao marcar Concluída.</p></div>
              <div className="sm:col-span-2"><Label>Equipamento / Máquina</Label><Input value={form.equipamento || ""} onChange={f("equipamento")} placeholder="Ex: Coladeira S2" /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status || "aberta"} onValueChange={mudarStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Pedido da Larissa 03/09: registrar como o equipamento CHEGOU (estado, o que veio junto, faltas, avarias) */}
            <div><Label>Descrição do recebimento</Label><textarea className="w-full min-h-[60px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none" value={form.recebimento || ""} onChange={f("recebimento")} placeholder="Como o equipamento chegou: estado geral, o que veio junto (cabos, acessórios, fonte), avarias visíveis, o que falta" /></div>

            {/* Pedido da Larissa 15/09: a queixa do cliente, separada do que foi feito */}
            <div><Label>Problema relatado</Label><textarea className="w-full min-h-[60px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none" value={form.problema || ""} onChange={f("problema")} placeholder="Queixa do cliente: o que ele diz que acontece, desde quando, em que situação" /></div>

            <div><Label>Descrição do serviço</Label><textarea className="w-full min-h-[60px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none" value={form.descricao || ""} onChange={f("descricao")} placeholder="O que foi feito / o que será feito" /></div>

            {/* HORA TÉCNICA */}
            <div className="rounded-lg border border-border p-3">
              <Label className="font-semibold">Hora técnica</Label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div><Label className="text-xs">Horas</Label><Input type="number" step="0.5" min="0" value={form.horas ?? ""} onChange={f("horas")} placeholder="0" /></div>
                <div><Label className="text-xs">Valor da hora (R$)</Label><Input type="number" step="0.01" min="0" value={form.valor_hora ?? ""} onChange={f("valor_hora")} placeholder="0,00" /></div>
                <div><Label className="text-xs">Subtotal</Label><Input readOnly value={formatCurrency(totaisForm.horas)} className="bg-muted" /></div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">O último valor de hora usado fica guardado e já vem preenchido na próxima OS.</p>
            </div>

            {/* PEÇAS DE REPOSIÇÃO */}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Peças</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setForm(prev => ({ ...prev, pecas: [...(prev.pecas || []), { product_id: "", name: "", sku: "", quantity: 1, unit_price: "" }] }))}>+ Peça</Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 mb-2">Peça do estoque (busca por nome ou SKU) ou "Manual" para item sem cadastro. Ao salvar como Concluída, as peças do estoque são baixadas; em qualquer outro status, voltam.</p>
              {(form.pecas || []).map((p, ix) => {
                const opcoes = [{ value: "manual", label: "Manual" }, ...opcoesProdutos];
                if (p.product_id && !produtos.some(x => x.id === p.product_id)) opcoes.push({ value: p.product_id, label: p.name || "(produto inativo)", sub: p.sku });
                return (
                  <div key={ix} className="mb-2">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 sm:col-span-3">
                        <Label className="text-xs">Produto</Label>
                        <Combobox
                          value={p.product_id || "manual"}
                          onChange={v => escolherProdutoPeca(ix, v === "manual" ? "" : v)}
                          placeholder="Produto"
                          searchPlaceholder="Nome, SKU ou categoria…"
                          emptyText="Nenhum produto com esse nome ou SKU"
                          triggerClassName="h-9 text-xs"
                          options={opcoes}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2"><Label className="text-xs">Código</Label><Input className="h-9 text-xs" value={p.sku || ""} readOnly={!!p.product_id} onChange={e => setPeca(ix, "sku", e.target.value)} placeholder="SKU" /></div>
                      <div className="col-span-3 sm:col-span-2"><Label className="text-xs">Qtd</Label><Input type="number" min="0" step="1" className="h-9 text-xs" value={p.quantity ?? ""} onChange={e => setPeca(ix, "quantity", e.target.value)} /></div>
                      <div className="col-span-3 sm:col-span-2"><Label className="text-xs">Unit. (R$)</Label><Input type="number" step="0.01" min="0" className="h-9 text-xs" value={p.unit_price ?? ""} onChange={e => setPeca(ix, "unit_price", e.target.value)} placeholder="0,00" /></div>
                      <div className="col-span-3 sm:col-span-2"><Label className="text-xs">Subtotal</Label><Input readOnly className="h-9 text-xs bg-muted" value={formatCurrency(num(p.quantity) * num(p.unit_price))} /></div>
                      <button type="button" className="col-span-12 sm:col-span-1 h-9 text-destructive hover:bg-destructive/10 rounded text-sm" title="Excluir esta peça" onClick={() => setForm(prev => ({ ...prev, pecas: prev.pecas.filter((_, i) => i !== ix) }))}>✕</button>
                    </div>
                    {!p.product_id && <Input className="h-9 text-xs mt-1" value={p.name || ""} onChange={e => setPeca(ix, "name", e.target.value)} placeholder="Descrição da peça (manual, sem baixa de estoque)" />}
                  </div>
                );
              })}
              {!(form.pecas || []).length && <p className="text-[10px] text-muted-foreground">Nenhuma peça lançada.</p>}
            </div>

            {/* DESPESAS DE VIAGEM */}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Despesas de viagem</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setForm(prev => ({ ...prev, despesas: [...(prev.despesas || []), { tipo: "combustivel", descricao: "", valor: "", cobrar: true }] }))}>+ Despesa</Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 mb-2">Combustível, pedágio, almoço, hospedagem... Marque "cobrar" nas que entram na conta do cliente — TODAS entram como custo da viagem no Financeiro.</p>
              {(form.despesas || []).map((d, ix) => (
                <div key={ix} className="grid grid-cols-12 gap-2 items-end mb-2">
                  <div className="col-span-3">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={d.tipo || "combustivel"} onValueChange={v => setDespesa(ix, "tipo", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TIPOS_DESPESA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4"><Label className="text-xs">Detalhe</Label><Input value={d.descricao || ""} onChange={e => setDespesa(ix, "descricao", e.target.value)} placeholder="opcional" /></div>
                  <div className="col-span-2"><Label className="text-xs">Valor (R$)</Label><Input type="number" step="0.01" min="0" value={d.valor ?? ""} onChange={e => setDespesa(ix, "valor", e.target.value)} /></div>
                  <label className="col-span-2 flex items-center gap-1.5 h-9 text-xs cursor-pointer">
                    <input type="checkbox" checked={d.cobrar !== false} onChange={e => setDespesa(ix, "cobrar", e.target.checked)} /> cobrar
                  </label>
                  <button type="button" className="col-span-1 h-9 text-destructive hover:bg-destructive/10 rounded text-sm" onClick={() => setForm(prev => ({ ...prev, despesas: prev.despesas.filter((_, i) => i !== ix) }))}>✕</button>
                </div>
              ))}
              {!(form.despesas || []).length && <p className="text-[10px] text-muted-foreground">Nenhuma despesa lançada.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Desconto (R$)</Label><Input type="number" step="0.01" min="0" value={form.desconto_brl ?? ""} onChange={f("desconto_brl")} placeholder="0,00" /></div>
              <div><Label>Vencimento da cobrança</Label><Input type="date" value={form.vencimento || ""} onChange={f("vencimento")} /><p className="text-[10px] text-muted-foreground mt-1">Vazio = data do serviço.</p></div>
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={form.forma_pagamento || "pix"} onValueChange={mudarFormaPagamento}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMAS_PAGAMENTO.map(fp => <SelectItem key={fp.value} value={fp.value}>{fp.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Conta de caixa</Label>
                <Select value={form.account_id || "nenhuma"} onValueChange={v => setForm(prev => ({ ...prev, account_id: v === "nenhuma" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">— sem conta —</SelectItem>
                    {contasAtivas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">Vem sozinha pela forma de pagamento (conta dona do método no Financeiro); pode trocar.</p>
              </div>
            </div>

            {/* PAGAMENTO MISTO (Larissa 17/09): igual ao pedido de venda — parte em Pix, parte no cartão, dias diferentes */}
            {(() => {
              const linhas = form.pagamentos || [];
              const soma = linhas.reduce((sm, l) => sm + num(l.valor), 0);
              const alvo = Math.max(0, Math.round(totaisForm.cobrado * 100) / 100);
              const add = () => { const resto = Math.max(0, Math.round((alvo - soma) * 100) / 100); setForm(prev => ({ ...prev, pagamentos: [...(prev.pagamentos || []), { metodo: "pix", valor: resto > 0 ? String(resto) : "", data: "", pago: false, account_id: contaPara("pix") }] })); };
              const setL = (ix, patch) => setForm(prev => ({ ...prev, pagamentos: prev.pagamentos.map((x, i) => i === ix ? { ...x, ...patch } : x) }));
              return (
                <div className="mt-3 rounded-lg border border-dashed border-border p-3">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold">Pagamento misto (opcional)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={add}>+ Forma</Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 mb-2">Cliente pagando parte em Pix e parte no cartão, ou em dias diferentes? Uma linha por forma. Com linhas aqui, "Forma de pagamento" e "Vencimento" acima são ignorados: cada linha vira uma conta a receber própria ao concluir a OS. Marque <b>Pago</b> quando o dinheiro já entrou.</p>
                  {linhas.map((l, ix) => (
                    <div key={ix} className="grid grid-cols-12 gap-2 items-end mb-2">
                      <div className="col-span-3"><Label className="text-xs">Forma</Label>
                        <Select value={l.metodo || "pix"} onValueChange={v => setL(ix, { metodo: v, account_id: contaPara(v) })}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{FORMAS_PAGAMENTO.map(fp => <SelectItem key={fp.value} value={fp.value}>{fp.label}</SelectItem>)}</SelectContent>
                        </Select></div>
                      <div className="col-span-3"><Label className="text-xs flex justify-between">Valor (R$){(() => { const outras = linhas.reduce((sm, x, i) => sm + (i === ix ? 0 : num(x.valor)), 0); const resto = Math.max(0, Math.round((alvo - outras) * 100) / 100); return Math.abs(num(l.valor) - resto) >= 0.01 ? <button type="button" className="text-[10px] text-primary underline font-normal" onClick={() => setL(ix, { valor: String(resto) })}>= restante</button> : null; })()}</Label>
                        <Input type="number" step="0.01" min="0" className="h-9 text-xs" value={l.valor ?? ""} onChange={e => setL(ix, { valor: e.target.value })} /></div>
                      <div className="col-span-2"><Label className="text-xs">Data</Label><Input type="date" className="h-9 text-xs" value={l.data || ""} onChange={e => setL(ix, { data: e.target.value })} /></div>
                      <div className="col-span-2"><Label className="text-xs">Conta</Label>
                        <Select value={l.account_id || "nenhuma"} onValueChange={v => setL(ix, { account_id: v === "nenhuma" ? "" : v })}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="nenhuma">—</SelectItem>{contasAtivas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                        </Select></div>
                      <div className="col-span-1 flex flex-col items-center"><Label className="text-xs">Pago</Label><input type="checkbox" className="h-5 w-5 mt-2 accent-primary" checked={!!l.pago} disabled={!l.data} title={l.data ? "Já recebido nesta data" : "Preencha a data para marcar como pago"} onChange={e => setL(ix, { pago: e.target.checked })} /></div>
                      <button type="button" className="col-span-1 h-9 text-destructive hover:bg-destructive/10 rounded text-sm" onClick={() => setForm(prev => ({ ...prev, pagamentos: prev.pagamentos.filter((_, i) => i !== ix) }))}>✕</button>
                    </div>
                  ))}
                  {linhas.length > 0 && <p className={`text-[11px] ${Math.abs(soma - alvo) < 0.01 ? "text-success" : "text-warning"}`}>Soma das linhas: {formatCurrency(soma)} · a cobrar: {formatCurrency(alvo)}{Math.abs(soma - alvo) >= 0.01 ? " — ao salvar, as linhas são ajustadas na proporção para fechar o valor a cobrar" : " ✓"}</p>}
                </div>
              );
            })()}
            <div className="hidden">
            </div>

            {/* RESUMO */}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className={`grid grid-cols-2 ${verCustos ? "sm:grid-cols-5" : "sm:grid-cols-3"} gap-2 text-xs`}>
                <div><p className="text-muted-foreground">Hora técnica</p><p className="font-semibold">{formatCurrency(totaisForm.horas)}</p></div>
                <div><p className="text-muted-foreground">Peças</p><p className="font-semibold">{formatCurrency(totaisForm.pecas)}</p></div>
                <div><p className="text-muted-foreground">A COBRAR DO CLIENTE</p><p className="font-bold text-sm text-primary">{formatCurrency(totaisForm.cobrado)}</p></div>
                {verCustos && <div><p className="text-muted-foreground">Custo da viagem</p><p className="font-semibold text-destructive">−{formatCurrency(totaisForm.despesas)}</p></div>}
                {verCustos && <div><p className="text-muted-foreground">RESULTADO DA OS</p><p className={`font-bold text-sm ${totaisForm.resultado < 0 ? "text-destructive" : "text-success"}`}>{formatCurrency(totaisForm.resultado)}</p></div>}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                {form.status === "concluida"
                  ? "Ao salvar como CONCLUÍDA: as peças do estoque são baixadas, a cobrança vira conta a receber e as despesas viram conta paga no Financeiro — nas categorias próprias de OS, prontas para a DRE."
                  : "Enquanto não estiver Concluída, nada é lançado no Financeiro nem baixado do estoque. Marque Concluída e salve para gerar a cobrança, as despesas e a baixa das peças."}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
