import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Search, Store, Edit, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";

const CHANNEL_TYPES = [
  { value: "venda_direta", label: "Venda Direta" },
  { value: "mercado_livre_classico", label: "Mercado Livre Clássico" },
  { value: "mercado_livre_premium", label: "Mercado Livre Premium" },
  { value: "site_woocommerce", label: "Site / WooCommerce" },
  { value: "amazon", label: "Amazon" },
  { value: "outro", label: "Outro" },
];

export default function SalesChannels() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const chans = await base44.entities.SalesChannel.list("-created_date", 100);
    setChannels(chans);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ type: "venda_direta", active: true, commission_percent: 0, fixed_fee: 0 });
    setDialogOpen(true);
  };

  const openEdit = (ch) => {
    setEditing(ch);
    setForm({ ...ch });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editing) await base44.entities.SalesChannel.update(editing.id, form);
    else await base44.entities.SalesChannel.create(form);
    setDialogOpen(false);
    loadData();
  };

  const toggleMaster = async (id) => {
    const channel = channels.find(c => c.id === id);
    const newMaster = !channel.is_master;
    if (newMaster) {
      const others = channels.filter(c => c.id !== id && c.is_master);
      await Promise.all(others.map(c => base44.entities.SalesChannel.update(c.id, { is_master: false })));
    }
    await base44.entities.SalesChannel.update(id, { is_master: newMaster });
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este canal?")) return;
    await base44.entities.SalesChannel.delete(id);
    loadData();
  };

  const f = (field) => (e) => {
    const val = e.target.type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value;
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const formatBRL = (val) => {
    if (!val && val !== 0) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const filtered = channels.filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      <PageHeader title="Canais de Venda" description={`${channels.length} canais cadastrados`} actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo Canal</Button>} />

      {channels.length === 0 ? (
        <EmptyState icon={Store} title="Nenhum canal cadastrado" description="Cadastre canais de venda com comissão e taxa fixa." actionLabel="Adicionar Canal" onAction={openNew} />
      ) : (
        <>
          <div className="mb-4 max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar canal..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Canal</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Tipo</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Comissão</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Taxa Fixa</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Master</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(ch => (
                    <tr key={ch.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{ch.name}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{CHANNEL_TYPES.find(t => t.value === ch.type)?.label || ch.type}</td>
                      <td className="px-4 py-3 text-right">{ch.commission_percent || 0}%</td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">{formatBRL(ch.fixed_fee)}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleMaster(ch.id)} className={`p-1 rounded ${ch.is_master ? "text-warning" : "text-muted-foreground hover:text-foreground"}`} title={ch.is_master ? "Canal Master (Preço à Vista)" : "Marcar como Master"}>
                          <Star className={`w-4 h-4 ${ch.is_master ? "fill-warning" : ""}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">{ch.active ? <StatusBadge status="active" /> : <StatusBadge status="inactive" />}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(ch)} className="p-1.5 hover:bg-muted rounded-lg"><Edit className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => handleDelete(ch.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar Canal" : "Novo Canal de Venda"}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name || ""} onChange={f("name")} placeholder="Ex: Venda Direta, ML Clássico" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type || "venda_direta"} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNEL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Comissão (%)</Label>
                <Input type="number" step="0.1" value={form.commission_percent ?? ""} onChange={f("commission_percent")} />
              </div>
              <div>
                <Label>Taxa Fixa (R$)</Label>
                <Input type="number" step="0.01" value={form.fixed_fee ?? ""} onChange={f("fixed_fee")} />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.active === false ? "inactive" : "active"} onValueChange={v => setForm({ ...form, active: v === "active" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
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