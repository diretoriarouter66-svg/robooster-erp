import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { statusFinanceiro, emAberto } from "@/lib/utils";
import { Plus, Search, DollarSign, Edit, Trash2, TrendingUp, TrendingDown } from "lucide-react";
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

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const data = await base44.entities.FinancialEntry.list("-created_date", 500);
    setEntries(data);
    setLoading(false);
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
      if (editing) {
        await base44.entities.FinancialEntry.update(editing.id, form);
      } else {
        await base44.entities.FinancialEntry.create(form);
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

  const categoryLabels = {
    sale: "Venda", import: "Importação", freight: "Frete", tax: "Imposto",
    salary: "Salário", rent: "Aluguel", supplier: "Fornecedor", marketplace_fee: "Taxa Marketplace", other: "Outro"
  };

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
                  {Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Descrição *</Label><Input value={form.description || ""} onChange={e => setForm({...form, description: e.target.value})} /></div>
            <div><Label>Valor *</Label><Input type="number" step="0.01" value={form.amount || ""} onChange={e => setForm({...form, amount: parseFloat(e.target.value) || 0})} /></div>
            <div><Label>Vencimento</Label><Input type="date" value={form.due_date || ""} onChange={e => setForm({...form, due_date: e.target.value})} /></div>
            <div><Label>Data Pagamento</Label><Input type="date" value={form.payment_date || ""} onChange={e => setForm({...form, payment_date: e.target.value})} /></div>
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
    </div>
  );
}