import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Search, Truck, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const data = await base44.entities.Supplier.list("-created_date", 200);
    setSuppliers(data);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ type: "international", currency: "USD", status: "active" });
    setDialogOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({ ...s });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editing) {
      await base44.entities.Supplier.update(editing.id, form);
    } else {
      await base44.entities.Supplier.create(form);
    }
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("Deseja realmente excluir este fornecedor?")) return;
    await base44.entities.Supplier.delete(id);
    loadData();
  };

  const filtered = suppliers.filter(s =>
    !search || s.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.trade_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.contact_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        description={`${suppliers.length} fornecedores cadastrados`}
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo Fornecedor</Button>}
      />

      {suppliers.length === 0 ? (
        <EmptyState icon={Truck} title="Nenhum fornecedor" description="Cadastre seus fornecedores internacionais e nacionais." actionLabel="Adicionar Fornecedor" onAction={openNew} />
      ) : (
        <>
          <div className="mb-4 max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar fornecedor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Empresa</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Contato</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">País</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Moeda</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{s.company_name}</p>
                        {s.trade_name && <p className="text-xs text-muted-foreground">{s.trade_name}</p>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-sm">{s.contact_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{s.email || ""}</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">{s.country || "—"}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={s.type} /></td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell font-mono text-xs">{s.currency}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-muted rounded-lg"><Edit className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div><Label>Razão Social *</Label><Input value={form.company_name || ""} onChange={e => setForm({...form, company_name: e.target.value})} /></div>
            <div><Label>Nome Fantasia</Label><Input value={form.trade_name || ""} onChange={e => setForm({...form, trade_name: e.target.value})} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type || "international"} onValueChange={v => setForm({...form, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="international">Internacional</SelectItem>
                  <SelectItem value="national">Nacional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>CNPJ / Tax ID</Label><Input value={form.document || ""} onChange={e => setForm({...form, document: e.target.value})} /></div>
            <div><Label>País</Label><Input value={form.country || ""} onChange={e => setForm({...form, country: e.target.value})} /></div>
            <div><Label>Cidade</Label><Input value={form.city || ""} onChange={e => setForm({...form, city: e.target.value})} /></div>
            <div className="sm:col-span-2"><Label>Endereço</Label><Input value={form.address || ""} onChange={e => setForm({...form, address: e.target.value})} /></div>
            <div><Label>Contato</Label><Input value={form.contact_name || ""} onChange={e => setForm({...form, contact_name: e.target.value})} /></div>
            <div><Label>Email</Label><Input value={form.email || ""} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div><Label>Telefone</Label><Input value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            <div><Label>WhatsApp</Label><Input value={form.whatsapp || ""} onChange={e => setForm({...form, whatsapp: e.target.value})} /></div>
            <div>
              <Label>Moeda</Label>
              <Select value={form.currency || "USD"} onValueChange={v => setForm({...form, currency: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="CNY">CNY</SelectItem>
                  <SelectItem value="BRL">BRL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Cond. Pagamento</Label><Input value={form.payment_terms || ""} onChange={e => setForm({...form, payment_terms: e.target.value})} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || "active"} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <textarea className="w-full min-h-[60px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.company_name}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}