import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
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
    const data = await base44.entities.FinancialEntry.list("-created_date", 200);
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
    if (editing) {
      await base44.entities.FinancialEntry.update(editing.id, form);
    } else {
      await base44.entities.FinancialEntry.create(form);
    }
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este lançamento?")) return;
    await base44.entities.FinancialEntry.delete(id);
    loadData();
  };

  const formatCurrency = (val) => {
    if (!val && val !== 0) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const receivables = entries.filter(e => e.type === "receivable");
  const payables = entries.filter(e => e.type === "payable");
  const totalReceivable = receivables.filter(e => e.status === "pending").reduce((s, e) => s + (e.amount || 0), 0);
  const totalPayable = payables.filter(e => e.status === "pending").reduce((s, e) => s + (e.amount || 0), 0);
  const overdue = entries.filter(e => e.status === "overdue");

  const filtered = entries.filter(e => {
    if (tab === "receivable" && e.type !== "receivable") return false;
    if (tab === "payable" && e.type !== "payable") return false;
    if (tab === "overdue" && e.status !== "overdue") return false;
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
            <Button variant="outline" onClick={() => openNew("receivable")}><TrendingUp className="w-4 h-4 mr-1" /> A Receber</Button>
            <Button onClick={() => openNew("payable")}><TrendingDown className="w-4 h-4 mr-1" /> A Pagar</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={TrendingUp} label="A Receber (pendente)" value={formatCurrency(totalReceivable)} color="success" />
        <StatCard icon={TrendingDown} label="A Pagar (pendente)" value={formatCurrency(totalPayable)} color="destructive" />
        <StatCard icon={DollarSign} label="Saldo Projetado" value={formatCurrency(totalReceivable - totalPayable)} color={totalReceivable - totalPayable >= 0 ? "success" : "destructive"} />
        <StatCard icon={DollarSign} label="Vencidos" value={overdue.length} color={overdue.length > 0 ? "destructive" : "success"} />
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
                      <td className="px-4 py-3 text-center"><StatusBadge status={e.status} /></td>
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