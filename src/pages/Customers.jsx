import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Search, Users, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const data = await base44.entities.Customer.list("-created_date", 200);
    setCustomers(data);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ person_type: "PF", channel: "direct", status: "active" });
    setDialogOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({ ...c });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editing) {
      await base44.entities.Customer.update(editing.id, form);
    } else {
      await base44.entities.Customer.create(form);
    }
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("Deseja excluir este cliente?")) return;
    await base44.entities.Customer.delete(id);
    loadData();
  };

  const filtered = customers.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.document?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
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
        title="Clientes"
        description={`${customers.length} clientes cadastrados`}
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo Cliente</Button>}
      />

      {customers.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum cliente" description="Cadastre seus clientes." actionLabel="Adicionar Cliente" onAction={openNew} />
      ) : (
        <>
          <div className="mb-4 max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Documento</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Contato</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Cidade/UF</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.name}</p>
                        {c.trade_name && <p className="text-xs text-muted-foreground">{c.trade_name}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono hidden md:table-cell">{c.document || "—"}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-sm">{c.email || "—"}</p>
                        <p className="text-xs text-muted-foreground">{c.phone || ""}</p>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-sm">{c.city && c.state ? `${c.city}/${c.state}` : "—"}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={c.person_type} /></td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-muted rounded-lg"><Edit className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => handleDelete(c.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
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
          <DialogHeader><DialogTitle>{editing ? "Editar Cliente" : "Novo Cliente"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div><Label>Nome / Razão Social *</Label><Input value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><Label>Nome Fantasia</Label><Input value={form.trade_name || ""} onChange={e => setForm({...form, trade_name: e.target.value})} /></div>
            <div>
              <Label>Tipo Pessoa</Label>
              <Select value={form.person_type || "PF"} onValueChange={v => setForm({...form, person_type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa Física</SelectItem>
                  <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{form.person_type === "PJ" ? "CNPJ" : "CPF"}</Label><Input value={form.document || ""} onChange={e => setForm({...form, document: e.target.value})} /></div>
            {form.person_type === "PJ" && (
              <div><Label>Inscrição Estadual</Label><Input value={form.state_registration || ""} onChange={e => setForm({...form, state_registration: e.target.value})} /></div>
            )}
            <div><Label>Email</Label><Input value={form.email || ""} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div><Label>Telefone</Label><Input value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            <div><Label>WhatsApp</Label><Input value={form.whatsapp || ""} onChange={e => setForm({...form, whatsapp: e.target.value})} /></div>
            <div><Label>CEP</Label><Input value={form.zip_code || ""} onChange={e => setForm({...form, zip_code: e.target.value})} /></div>
            <div><Label>UF</Label><Input value={form.state || ""} onChange={e => setForm({...form, state: e.target.value})} maxLength={2} /></div>
            <div><Label>Cidade</Label><Input value={form.city || ""} onChange={e => setForm({...form, city: e.target.value})} /></div>
            <div><Label>Bairro</Label><Input value={form.neighborhood || ""} onChange={e => setForm({...form, neighborhood: e.target.value})} /></div>
            <div><Label>Endereço</Label><Input value={form.address || ""} onChange={e => setForm({...form, address: e.target.value})} /></div>
            <div><Label>Número</Label><Input value={form.address_number || ""} onChange={e => setForm({...form, address_number: e.target.value})} /></div>
            <div><Label>Complemento</Label><Input value={form.address_complement || ""} onChange={e => setForm({...form, address_complement: e.target.value})} /></div>
            <div>
              <Label>Canal</Label>
              <Select value={form.channel || "direct"} onValueChange={v => setForm({...form, channel: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direto</SelectItem>
                  <SelectItem value="mercado_livre">Mercado Livre</SelectItem>
                  <SelectItem value="woocommerce">WooCommerce</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            <Button onClick={handleSave} disabled={!form.name}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}