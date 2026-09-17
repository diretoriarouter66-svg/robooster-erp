import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { statusFinanceiro, emAberto } from "@/lib/utils";
import { Plus, Search, DollarSign, Edit, Trash2, TrendingUp, TrendingDown, Tag, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import StatCard from "../components/shared/StatCard";
import EmptyState from "../components/shared/EmptyState";

export default function Financial() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [categories, setCategories] = useState([]);
  const [catOpen, setCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [contas, setContas] = useState([]);
  const [contasOpen, setContasOpen] = useState(false);
  // Caixas e Bancos (Larissa 17/09): extrato por conta com saldo corrido + transferência entre contas
  const [extratoConta, setExtratoConta] = useState(null);
  const [extMes, setExtMes] = useState(new Date().toISOString().slice(0, 7));
  const [transfOpen, setTransfOpen] = useState(false);
  const [transf, setTransf] = useState({ de: "", para: "", valor: "", data: new Date().toISOString().slice(0, 10), descricao: "" });
  const dataMov = (e) => (e.payment_date || e.due_date || (e.created_date || "").slice(0, 10) || "");
  const extratoLinhas = (c, mes) => {
    const movs = entries.filter(e => e.account_id === c.id && e.status === "paid").map(e => ({ ...e, _d: dataMov(e), _v: (e.type === "receivable" ? 1 : -1) * (parseFloat(e.amount) || 0) })).sort((a, b) => a._d.localeCompare(b._d) || String(a.id).localeCompare(String(b.id)));
    const ini = mes === "todos" ? "" : mes + "-01";
    let saldo = (parseFloat(c.saldo_inicial) || 0) + movs.filter(m => ini && m._d < ini).reduce((t, m) => t + m._v, 0);
    const saldoAbertura = saldo;
    const doMes = movs.filter(m => !ini || m._d.slice(0, 7) === mes).map(m => { saldo = Math.round((saldo + m._v) * 100) / 100; return { ...m, _saldo: saldo }; });
    return { saldoAbertura, linhas: doMes, saldoFinal: saldo, entradas: doMes.filter(m => m._v > 0).reduce((t, m) => t + m._v, 0), saidas: doMes.filter(m => m._v < 0).reduce((t, m) => t - m._v, 0) };
  };
  const exportarExtrato = (c, mes) => {
    const { saldoAbertura, linhas } = extratoLinhas(c, mes);
    const rows = [["Data", "Categoria", "Historico", "Entrada", "Saida", "Saldo"], ["", "", `Saldo anterior`, "", "", saldoAbertura.toFixed(2).replace(".", ",")]];
    for (const m of linhas) rows.push([m._d.split("-").reverse().join("/"), m.category || "", (m.description || "").replace(/;/g, ","), m._v > 0 ? m._v.toFixed(2).replace(".", ",") : "", m._v < 0 ? (-m._v).toFixed(2).replace(".", ",") : "", m._saldo.toFixed(2).replace(".", ",")]);
    const csv = "\ufeff" + rows.map(r => r.join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `extrato-${c.nome.replace(/\s+/g, "-")}-${mes}.csv`; a.click();
  };
  const salvarTransferencia = async () => {
    const v = Math.round((parseFloat(transf.valor) || 0) * 100) / 100;
    const de = contas.find(c => c.id === transf.de), para = contas.find(c => c.id === transf.para);
    if (!de || !para || de.id === para.id || v <= 0) { alert("Escolha a conta de origem, a de destino (diferentes) e um valor maior que zero."); return; }
    const ref = `transf-${Date.now()}`; const desc = transf.descricao || `Transferência ${de.nome} → ${para.nome}`;
    await base44.entities.FinancialEntry.create({ type: "payable", category: "transferencia", description: desc, amount: v, due_date: transf.data, payment_date: transf.data, status: "paid", payment_method: "transfer", account_id: de.id, reference_type: "transferencia", reference_id: ref });
    await base44.entities.FinancialEntry.create({ type: "receivable", category: "transferencia", description: desc, amount: v, due_date: transf.data, payment_date: transf.data, status: "paid", payment_method: "transfer", account_id: para.id, reference_type: "transferencia", reference_id: ref });
    setTransfOpen(false); setTransf({ de: "", para: "", valor: "", data: new Date().toISOString().slice(0, 10), descricao: "" }); loadData();
  };
  const [novaConta, setNovaConta] = useState({ nome: "", saldo_inicial: "" });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const data = await base44.entities.FinancialEntry.list("-created_date", 1000);
    setEntries(data);
    const cats = await base44.entities.FinancialCategory.list("nome", 100).catch(() => []);
    setCategories(cats || []);
    try {
      const cx = await base44.entities.CashAccount.list("nome", 100);
      setContas(cx || []);
    } catch (err) {
      // erro visível, nunca engolido (regra da casa): sem contas o financeiro
      // continua funcionando, só sem os saldos por caixa.
      console.error("Falha ao carregar contas/caixas:", err);
      setContas([]);
    }
    setLoading(false);
  };

  // ==== Cadastro de categorias (as de "sistema" são usadas pelos lançamentos
  // automáticos de pedidos/importação — não podem ser excluídas) ====
  const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const addCategory = async () => {
    const nome = newCatName.trim();
    if (!nome) return;
    const slug = slugify(nome);
    if (categories.some(c => c.slug === slug)) { alert("Já existe uma categoria com esse nome."); return; }
    await base44.entities.FinancialCategory.create({ nome, slug, sistema: false, ativo: true });
    setNewCatName("");
    loadData();
  };
  const renameCategory = async (c, nome) => {
    const n = (nome || "").trim();
    if (!n || n === c.nome) return;
    await base44.entities.FinancialCategory.update(c.id, { nome: n });
    loadData();
  };
  const toggleCategory = async (c) => {
    await base44.entities.FinancialCategory.update(c.id, { ativo: !(c.ativo !== false) });
    loadData();
  };
  const deleteCategory = async (c) => {
    if (c.sistema) { alert("Categoria de sistema (usada pelos lançamentos automáticos) — não pode ser excluída."); return; }
    const usados = entries.filter(e => e.category === c.slug).length;
    if (usados > 0) { alert(`${usados} lançamento(s) usam esta categoria. Desative-a em vez de excluir.`); return; }
    if (!confirm(`Excluir a categoria "${c.nome}"?`)) return;
    await base44.entities.FinancialCategory.delete(c.id);
    loadData();
  };

  // ==== Contas / caixas (Itaú, PayPal, Caixinha...): onde o dinheiro mora.
  // Pedido do dono em 28/08/2026 — cada lançamento pago aponta a conta, e o
  // painel mostra o saldo por conta (saldo inicial + recebidos − pagos).
  const addConta = async () => {
    const nome = (novaConta.nome || "").trim();
    if (!nome) return;
    if (contas.some(c => c.nome.toLowerCase() === nome.toLowerCase())) { alert("Já existe uma conta com esse nome."); return; }
    await base44.entities.CashAccount.create({ nome, saldo_inicial: parseFloat(novaConta.saldo_inicial) || 0, ativo: true });
    setNovaConta({ nome: "", saldo_inicial: "" });
    loadData();
  };
  const renameConta = async (c, nome) => {
    const n = (nome || "").trim();
    if (!n || n === c.nome) return;
    await base44.entities.CashAccount.update(c.id, { nome: n });
    loadData();
  };
  const toggleConta = async (c) => {
    await base44.entities.CashAccount.update(c.id, { ativo: !(c.ativo !== false) });
    loadData();
  };
  const deleteConta = async (c) => {
    const usados = entries.filter(e => e.account_id === c.id).length;
    if (usados > 0) { alert(`${usados} lançamento(s) usam esta conta. Desative-a em vez de excluir.`); return; }
    if (!confirm(`Excluir a conta "${c.nome}"?`)) return;
    await base44.entities.CashAccount.delete(c.id);
    loadData();
  };
  const saldoConta = (c) => {
    const pagos = entries.filter(e => e.account_id === c.id && e.status === "paid");
    const entrou = pagos.filter(e => e.type === "receivable").reduce((t, e) => t + (e.amount || 0), 0);
    const saiu = pagos.filter(e => e.type === "payable").reduce((t, e) => t + (e.amount || 0), 0);
    return (parseFloat(c.saldo_inicial) || 0) + entrou - saiu;
  };

  const openNew = (type) => {
    setEditing(null);
    setForm({ type: type || "payable", category: "other", status: "pending", payment_method: "pix" });
    setDialogOpen(true);
  };

  const openEdit = (e) => {
    setEditing(e);
    setForm({ ...e });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const nParcelas = Math.max(1, parseInt(form.parcelas) || 1);
      // Conta automática pelo método ("qual método cai em qual conta"), quando o usuário não apontou
      const contaPadrao = (m) => contas.find(c => c.ativo !== false && (c.metodos || []).includes(m))?.id || null;
      if (!form.account_id && form.payment_method) form.account_id = contaPadrao(form.payment_method);
      if (editing || nParcelas === 1) {
        const { parcelas, ...payload } = form;
        if (editing) await base44.entities.FinancialEntry.update(editing.id, payload);
        else await base44.entities.FinancialEntry.create(payload);
      } else {
        // PARCELADO (ex.: seguro do imóvel em 10x): o VALOR informado é o TOTAL,
        // dividido em N lançamentos com vencimentos mensais a partir do 1º vencimento.
        const total = parseFloat(form.amount) || 0;
        const valorParcela = Math.round((total / nParcelas) * 100) / 100;
        const base = form.due_date ? new Date(form.due_date + "T12:00:00") : new Date();
        const { parcelas, payment_date, ...payload } = form;
        for (let i = 0; i < nParcelas; i++) {
          // Soma meses SEM rollover: 31/01 + 1 mês = 28/02 (e não 03/03) —
          // senão fevereiro fica sem parcela e as demais deslizam de dia.
          const venc = new Date(base.getFullYear(), base.getMonth() + i, 1, 12);
          const ultimoDiaDoMes = new Date(venc.getFullYear(), venc.getMonth() + 1, 0).getDate();
          venc.setDate(Math.min(base.getDate(), ultimoDiaDoMes));
          const ultima = i === nParcelas - 1;
          const valor = ultima ? Math.round((total - valorParcela * (nParcelas - 1)) * 100) / 100 : valorParcela;
          await base44.entities.FinancialEntry.create({
            ...payload,
            description: `${form.description} (parcela ${i + 1}/${nParcelas})`,
            amount: valor,
            due_date: venc.toISOString().slice(0, 10),
            status: "pending",
          });
        }
      }
    } catch (err) {
      alert(`Não foi possível salvar o lançamento: ${err.message}`);
      return;
    }
    setDialogOpen(false);
    loadData();
  };

  const gerarContasDoMes = async () => {
    try {
      const mesRef = new Date().toISOString().slice(0, 7); // YYYY-MM
      const configs = await base44.entities.ConfigTributaria.list("-created_date", 1);
      const despesas = configs?.[0]?.despesas_fixas || [];
      if (!despesas.length) { alert("Nenhuma despesa fixa cadastrada na Config. Tributária."); return; }
      // Se esta consulta falhar, o erro tem que subir — senão gera tudo em dobro
      const existentes = await base44.entities.FinancialEntry.filter({ reference_type: "despesa_fixa", reference_id: mesRef }, "-created_date", 100);
      if ((existentes || []).length > 0) { alert(`As contas fixas de ${mesRef} já foram geradas (${existentes.length} lançamentos).`); return; }
      if (!confirm(`Gerar ${despesas.length} contas a pagar das despesas fixas de ${mesRef} (vencimento dia 5)?`)) return;
      const venc = `${mesRef}-05`;
      for (const d of despesas) {
        if (!d?.nome || !(d?.valor > 0)) continue;
        await base44.entities.FinancialEntry.create({
          type: "payable", category: "other",
          description: `${d.nome} — ${mesRef}`,
          reference_id: mesRef, reference_type: "despesa_fixa",
          amount: d.valor, due_date: venc, status: "pending", payment_method: "boleto",
        });
      }
    } catch (err) {
      alert(`Não foi possível gerar as contas do mês: ${err.message}`);
    }
    loadData();
  };

  const fluxoCaixa = (() => {
    const hoje = new Date();
    const faixas = [
      { nome: "Próximos 7 dias", dias: 7 },
      { nome: "Próximos 30 dias", dias: 30 },
      { nome: "Próximos 90 dias", dias: 90 },
    ];
    return faixas.map(f => {
      const limite = new Date(); limite.setDate(hoje.getDate() + f.dias);
      const pend = entries.filter(e => emAberto(e) && e.due_date && new Date(e.due_date) <= limite);
      const entra = pend.filter(e => e.type === "receivable").reduce((t, e) => t + (e.amount || 0), 0);
      const sai = pend.filter(e => e.type === "payable").reduce((t, e) => t + (e.amount || 0), 0);
      return { ...f, entra, sai, liquido: entra - sai };
    });
  })();

  const handleDelete = async (id) => {
    if (!confirm("Excluir este lançamento?")) return;
    try {
      await base44.entities.FinancialEntry.delete(id);
    } catch (err) {
      alert(`Não foi possível excluir o lançamento: ${err.message}`);
    }
    loadData();
  };

  const formatCurrency = (val) => {
    if (!val && val !== 0) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  // Vencido é derivado do vencimento (statusFinanceiro) — ninguém marca na mão
  const receivables = entries.filter(e => e.type === "receivable");
  const payables = entries.filter(e => e.type === "payable");
  const totalReceivable = receivables.filter(emAberto).reduce((s, e) => s + (e.amount || 0), 0);
  const totalPayable = payables.filter(emAberto).reduce((s, e) => s + (e.amount || 0), 0);
  const overdue = entries.filter(e => statusFinanceiro(e) === "overdue");

  const filtered = entries.filter(e => {
    if (tab === "receivable" && e.type !== "receivable") return false;
    if (tab === "payable" && e.type !== "payable") return false;
    if (tab === "overdue" && statusFinanceiro(e) !== "overdue") return false;
    if (search && !e.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Rótulos vêm do cadastro de categorias; a lista fixa é só fallback de segurança
  const categoryLabels = categories.length
    ? Object.fromEntries(categories.map(c => [c.slug, c.nome]))
    : {
        sale: "Venda", import: "Importação", freight: "Frete", tax: "Imposto",
        salary: "Salário", rent: "Aluguel", supplier: "Fornecedor", marketplace_fee: "Taxa Marketplace", other: "Outro"
      };
  const categoriasAtivas = categories.length
    ? categories.filter(c => c.ativo !== false)
    : Object.entries(categoryLabels).map(([slug, nome]) => ({ slug, nome }));

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Contas a pagar e receber"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCatOpen(true)}><Tag className="w-4 h-4 mr-1" /> Categorias</Button>
            <Button variant="outline" onClick={() => setContasOpen(true)}><DollarSign className="w-4 h-4 mr-1" /> Contas</Button>
            <Button variant="outline" onClick={gerarContasDoMes}><Plus className="w-4 h-4 mr-1" /> Gerar Contas do Mês</Button>
            <Button variant="outline" onClick={() => openNew("receivable")}><TrendingUp className="w-4 h-4 mr-1" /> A Receber</Button>
            <Button onClick={() => openNew("payable")}><TrendingDown className="w-4 h-4 mr-1" /> A Pagar</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={TrendingUp} label="A Receber (em aberto)" value={formatCurrency(totalReceivable)} color="success" />
        <StatCard icon={TrendingDown} label="A Pagar (em aberto)" value={formatCurrency(totalPayable)} color="destructive" />
        <StatCard icon={DollarSign} label="Saldo Projetado" value={formatCurrency(totalReceivable - totalPayable)} color={totalReceivable - totalPayable >= 0 ? "success" : "destructive"} />
        <StatCard icon={DollarSign} label="Vencidos" value={overdue.length} color={overdue.length > 0 ? "destructive" : "success"} />
      </div>

      <div className="bg-card rounded-xl border border-border p-4 mb-6">
        <h3 className="font-heading font-semibold text-sm mb-3">Fluxo de Caixa Projetado (pelos vencimentos)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {fluxoCaixa.map(f => (
            <div key={f.nome} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">{f.nome}</p>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Entradas</span><span className="font-semibold text-success">{formatCurrency(f.entra)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Saídas</span><span className="font-semibold text-destructive">{formatCurrency(f.sai)}</span></div>
              <div className="flex justify-between text-sm border-t border-border mt-1.5 pt-1.5"><span className="font-medium">Líquido</span><span className={`font-bold ${f.liquido >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(f.liquido)}</span></div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Considera contas pendentes/atrasadas pela data de vencimento — incluindo a liberação prevista dos marketplaces e as parcelas de vendas a prazo.</p>
      </div>

      {contas.filter(c => c.ativo !== false).length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4 mb-6">
          <div className="flex items-center justify-between mb-3"><h3 className="font-heading font-semibold text-sm">Caixas e bancos</h3><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setTransfOpen(true)}>Transferir entre contas</Button></div></div>
          <p className="text-[10px] text-muted-foreground mb-2">Clique numa conta para ver o extrato com saldo corrido, lançar manualmente ou exportar para a contabilidade.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {contas.filter(c => c.ativo !== false).map(c => {
              const s = saldoConta(c);
              return (
                <div key={c.id} className="rounded-lg border border-border p-3 cursor-pointer hover:border-primary hover:bg-muted/20 transition-colors" onClick={() => { setExtMes(new Date().toISOString().slice(0, 7)); setExtratoConta(c); }} title="Ver extrato">
                  <p className="text-xs text-muted-foreground">{c.nome}</p>
                  <p className={`font-semibold ${s < 0 ? "text-destructive" : ""}`}>{formatCurrency(s)}</p>
                </div>
              );
            })}
            {(() => {
              const semConta = entries.filter(e => !e.account_id && e.status === "paid").length;
              return semConta > 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3">
                  <p className="text-xs text-muted-foreground">Sem conta definida</p>
                  <p className="text-xs mt-1">{semConta} lançamento(s) pagos — edite e aponte a conta para o saldo fechar.</p>
                </div>
              ) : null;
            })()}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Saldo = saldo inicial + recebidos − pagos (só lançamentos com status Pago e conta apontada).</p>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="receivable">A Receber</TabsTrigger>
          <TabsTrigger value="payable">A Pagar</TabsTrigger>
          <TabsTrigger value="overdue">Vencidos</TabsTrigger>
        </TabsList>
      </Tabs>

      {entries.length === 0 ? (
        <EmptyState icon={DollarSign} title="Nenhum lançamento" description="Registre suas contas a pagar e receber." actionLabel="Novo Lançamento" onAction={() => openNew("payable")} />
      ) : (
        <>
          <div className="mb-4 max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar lançamento..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descrição</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Categoria</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Vencimento</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr></thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{e.description}</td>
                      <td className="px-4 py-3 text-center text-xs hidden sm:table-cell">{categoryLabels[e.category] || e.category}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium ${e.type === "receivable" ? "text-success" : "text-destructive"}`}>
                          {e.type === "receivable" ? "Receber" : "Pagar"}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${e.type === "receivable" ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(e.amount)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs hidden md:table-cell">{e.due_date || "—"}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={statusFinanceiro(e)} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(e)} className="p-1.5 hover:bg-muted rounded-lg"><Edit className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => handleDelete(e.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div>
              <Label>Tipo</Label>
              <Select value={form.type || "payable"} onValueChange={v => setForm({...form, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receivable">A Receber</SelectItem>
                  <SelectItem value="payable">A Pagar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category || "other"} onValueChange={v => setForm({...form, category: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoriasAtivas.map(c => <SelectItem key={c.slug} value={c.slug}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Descrição *</Label><Input value={form.description || ""} onChange={e => setForm({...form, description: e.target.value})} /></div>
            <div><Label>Valor {parseInt(form.parcelas) > 1 ? "TOTAL " : ""}*</Label><Input type="number" step="0.01" value={form.amount || ""} onChange={e => setForm({...form, amount: parseFloat(e.target.value) || 0})} /></div>
            <div><Label>{parseInt(form.parcelas) > 1 ? "1º Vencimento" : "Vencimento"}</Label><Input type="date" value={form.due_date || ""} onChange={e => setForm({...form, due_date: e.target.value})} /></div>
            {!editing && (
              <div>
                <Label>Parcelas</Label>
                <Select value={String(form.parcelas || 1)} onValueChange={v => setForm({...form, parcelas: parseInt(v)})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5,6,7,8,9,10,11,12,18,24].map(n => <SelectItem key={n} value={String(n)}>{n === 1 ? "À vista / única" : `${n}x mensais`}</SelectItem>)}
                  </SelectContent>
                </Select>
                {parseInt(form.parcelas) > 1 && <p className="text-[10px] text-muted-foreground mt-1">O valor TOTAL será dividido em {form.parcelas} lançamentos com vencimentos mensais a partir do 1º vencimento (ex.: seguro do imóvel em 10x).</p>}
              </div>
            )}
            <div><Label>Data Pagamento</Label><Input type="date" value={form.payment_date || ""} onChange={e => setForm({...form, payment_date: e.target.value})} /></div>
            <div>
              <Label>Conta / Caixa</Label>
              <Select value={form.account_id || "none"} onValueChange={v => setForm({...form, account_id: v === "none" ? null : v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— sem conta —</SelectItem>
                  {contas.filter(c => c.ativo !== false).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || "pending"} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="overdue">Vencido</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma Pagamento</Label>
              <Select value={form.payment_method || "pix"} onValueChange={v => setForm({...form, payment_method: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pix","boleto","credit_card","transfer","cash","other"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <textarea className="w-full min-h-[50px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none" value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.description || !form.amount}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==== Cadastro de Categorias do Financeiro ==== */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Categorias do Financeiro</DialogTitle></DialogHeader>
          <div className="flex gap-2 mb-3">
            <Input placeholder="Nova categoria (ex.: Marketing)" value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === "Enter" && addCategory()} />
            <Button onClick={addCategory} disabled={!newCatName.trim()}><Plus className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {categories.map(c => (
              <div key={c.id} className={`flex items-center gap-2 border border-border rounded-lg px-2 py-1.5 ${c.ativo === false ? "opacity-50" : ""}`}>
                <Input defaultValue={c.nome} onBlur={e => renameCategory(c, e.target.value)} className="h-7 text-sm border-0 shadow-none focus-visible:ring-1 flex-1" />
                {c.sistema && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap" title="Usada pelos lançamentos automáticos (pedidos/importação) — não pode ser excluída">sistema</span>}
                <span className="text-[10px] text-muted-foreground">{entries.filter(e => e.category === c.slug).length} lçtos</span>
                <button onClick={() => toggleCategory(c)} className="p-1 hover:bg-muted rounded" title={c.ativo === false ? "Reativar" : "Desativar (some do seletor; lançamentos antigos continuam)"}>
                  <Power className={`w-3.5 h-3.5 ${c.ativo === false ? "text-muted-foreground" : "text-success"}`} />
                </button>
                {!c.sistema && (
                  <button onClick={() => deleteCategory(c)} className="p-1 hover:bg-destructive/10 rounded" title="Excluir (só sem lançamentos)">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Renomear: clique no nome, edite e saia do campo. Desativar tira do seletor de novos lançamentos sem mexer no histórico. Categorias de sistema (Venda, Importação, Outro) são geradas automaticamente por pedidos e importações.</p>
        </DialogContent>
      </Dialog>

      {/* ==== EXTRATO por conta (Larissa 17/09: "Caixas e Bancos" do Bling) ==== */}
      <Dialog open={!!extratoConta} onOpenChange={o => { if (!o) setExtratoConta(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {extratoConta && (() => {
            const c = contas.find(x => x.id === extratoConta.id) || extratoConta;
            const ex = extratoLinhas(c, extMes);
            const meses = Array.from(new Set(entries.filter(e => e.account_id === c.id && e.status === "paid").map(e => dataMov(e).slice(0, 7)).filter(Boolean))).sort().reverse();
            if (!meses.includes(extMes) && extMes !== "todos") meses.unshift(extMes);
            return (<>
              <DialogHeader><DialogTitle>Extrato · {c.nome}</DialogTitle></DialogHeader>
              <div className="flex flex-wrap items-end gap-2">
                <div><Label className="text-xs">Período</Label>
                  <Select value={extMes} onValueChange={setExtMes}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="todos">Tudo</SelectItem>{meses.map(m => <SelectItem key={m} value={m}>{m.split("-").reverse().join("/")}</SelectItem>)}</SelectContent>
                  </Select></div>
                <Button size="sm" onClick={() => { const conta = c; setExtratoConta(null); openNew("receivable"); setForm(f => ({ ...f, account_id: conta.id, status: "paid", payment_date: new Date().toISOString().slice(0, 10) })); }}>+ Incluir lançamento</Button>
                <Button size="sm" variant="outline" onClick={() => { setTransf(t => ({ ...t, de: c.id })); setTransfOpen(true); }}>Transferir</Button>
                <Button size="sm" variant="outline" onClick={() => exportarExtrato(c, extMes)}>Exportar extrato (CSV)</Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Saldo anterior</p><p className="font-semibold">{formatCurrency(ex.saldoAbertura)}</p></div>
                <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Entradas</p><p className="font-semibold text-success">{formatCurrency(ex.entradas)}</p></div>
                <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Saídas</p><p className="font-semibold text-destructive">{formatCurrency(ex.saidas)}</p></div>
                <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Saldo final</p><p className={`font-semibold ${ex.saldoFinal < 0 ? "text-destructive" : ""}`}>{formatCurrency(ex.saldoFinal)}</p></div>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-muted-foreground"><th className="text-left py-2 pr-2">Data</th><th className="text-left py-2 pr-2">Categoria</th><th className="text-left py-2 pr-2">Histórico</th><th className="text-right py-2 pr-2">Valor</th><th className="text-right py-2">Saldo</th></tr></thead>
                  <tbody>
                    {ex.linhas.length === 0 && <tr><td colSpan="5" className="py-4 text-center text-muted-foreground">Nenhuma movimentação paga nesta conta no período.</td></tr>}
                    {ex.linhas.map(m => (
                      <tr key={m.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer" onClick={() => { setExtratoConta(null); openEdit(m); }} title="Abrir lançamento">
                        <td className="py-1.5 pr-2 whitespace-nowrap">{m._d.split("-").reverse().join("/")}</td>
                        <td className="py-1.5 pr-2">{m.category || "—"}</td>
                        <td className="py-1.5 pr-2">{m.description}</td>
                        <td className={`py-1.5 pr-2 text-right font-medium whitespace-nowrap ${m._v < 0 ? "text-destructive" : "text-success"}`}>{m._v < 0 ? "− " : ""}{formatCurrency(Math.abs(m._v))}</td>
                        <td className={`py-1.5 text-right whitespace-nowrap ${m._saldo < 0 ? "text-destructive" : ""}`}>{formatCurrency(m._saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Só entra no extrato o que está marcado como pago nesta conta (data do pagamento). Pendentes ficam em Contas a receber / a pagar.</p>
            </>);
          })()}
        </DialogContent>
      </Dialog>

      {/* ==== TRANSFERÊNCIA entre contas: sai de uma (paga) e entra na outra (recebida), sem passar pelo DRE ==== */}
      <Dialog open={transfOpen} onOpenChange={setTransfOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Transferência entre contas</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>De</Label><Select value={transf.de || "x"} onValueChange={v => setTransf(t => ({ ...t, de: v === "x" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger><SelectContent><SelectItem value="x">—</SelectItem>{contas.filter(c => c.ativo !== false).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Para</Label><Select value={transf.para || "x"} onValueChange={v => setTransf(t => ({ ...t, para: v === "x" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Destino" /></SelectTrigger><SelectContent><SelectItem value="x">—</SelectItem>{contas.filter(c => c.ativo !== false).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Valor (R$)</Label><Input type="number" step="0.01" min="0" value={transf.valor} onChange={e => setTransf(t => ({ ...t, valor: e.target.value }))} /></div>
              <div><Label>Data</Label><Input type="date" value={transf.data} onChange={e => setTransf(t => ({ ...t, data: e.target.value }))} /></div>
              <div className="col-span-2"><Label>Histórico</Label><Input value={transf.descricao} onChange={e => setTransf(t => ({ ...t, descricao: e.target.value }))} placeholder="Ex.: Resgate PayPal para Itaú" /></div>
            </div>
            <p className="text-[10px] text-muted-foreground">Gera uma saída paga na origem e uma entrada paga no destino, categoria "transferencia": muda o saldo das contas, não entra como receita nem despesa no DRE.</p>
            <div className="flex justify-end"><Button onClick={salvarTransferencia}>Transferir</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==== Contas / caixas: onde o dinheiro mora (Itaú, PayPal, Caixinha...) ==== */}
      <Dialog open={contasOpen} onOpenChange={setContasOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Contas / Caixas</DialogTitle></DialogHeader>
          <div className="flex gap-2">
            <Input placeholder="Nome (ex.: Nubank)" value={novaConta.nome} onChange={e => setNovaConta(p => ({ ...p, nome: e.target.value }))} />
            <Input type="number" step="0.01" className="w-32" placeholder="Saldo inicial" value={novaConta.saldo_inicial} onChange={e => setNovaConta(p => ({ ...p, saldo_inicial: e.target.value }))} />
            <Button onClick={addConta}>Criar</Button>
          </div>
          <div className="mt-3 space-y-1 max-h-72 overflow-auto">
            {contas.map(c => (
              <div key={c.id} className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 ${c.ativo === false ? "opacity-50" : ""}`}>
                <Input defaultValue={c.nome} className="h-8 border-0 shadow-none px-1" onBlur={e => renameConta(c, e.target.value)} />
                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatCurrency(saldoConta(c))}</span>
                <button className="text-xs underline text-muted-foreground" onClick={() => toggleConta(c)}>{c.ativo === false ? "ativar" : "desativar"}</button>
                <button className="text-destructive text-xs" onClick={() => deleteConta(c)}>excluir</button>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium">Qual método cai em qual conta (automático nos novos lançamentos):</p>
            {contas.filter(c => c.ativo !== false).map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-1">
                <span className="text-xs w-24 shrink-0 text-muted-foreground">{c.nome}:</span>
                {[["pix","Pix"],["credit_card","Crédito"],["debit_card","Débito"],["boleto","Boleto"],["paypal","PayPal"],["transfer","Transf."],["cash","Dinheiro"]].map(([m, label]) => {
                  const on = (c.metodos || []).includes(m);
                  const outra = !on && contas.some(x => x.id !== c.id && x.ativo !== false && (x.metodos || []).includes(m));
                  return (
                    <button key={m} type="button"
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${on ? "bg-primary text-primary-foreground border-primary" : outra ? "opacity-35 border-border" : "border-border"}`}
                      title={outra ? "Já mapeado em outra conta — clique para trazer para cá" : ""}
                      onClick={async () => {
                        const novos = on ? (c.metodos || []).filter(x => x !== m) : [...(c.metodos || []), m];
                        await base44.entities.CashAccount.update(c.id, { metodos: novos });
                        if (!on) {
                          // um método mora numa conta só — tira das outras
                          for (const x of contas.filter(x => x.id !== c.id && (x.metodos || []).includes(m))) {
                            await base44.entities.CashAccount.update(x.id, { metodos: x.metodos.filter(y => y !== m) });
                          }
                        }
                        loadData();
                      }}>{label}</button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Renomear: clique no nome, edite e saia do campo. O saldo inicial é o ponto de partida; daí em diante cada lançamento PAGO com a conta apontada entra na soma. Desativar tira do seletor sem mexer no histórico. <strong>Métodos:</strong> lançamento novo (pedido, importação ou manual) sem conta escolhida cai sozinho na conta dona do método — Pix no Itaú, PayPal no PayPal. Você sempre pode trocar depois, editando o lançamento.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}