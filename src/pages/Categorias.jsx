import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Search, Tag, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";

export default function Categorias() {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const cats = await base44.entities.Categoria.list("-created_date", 200);
    setCategorias(cats);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ativa: true });
    setDialogOpen(true);
  };

  const openEdit = (cat) => {
    setEditing(cat);
    setForm({ ...cat });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) await base44.entities.Categoria.update(editing.id, form);
      else await base44.entities.Categoria.create(form);
    } catch (err) {
      alert(`Não foi possível salvar a categoria: ${err.message}`);
      return;
    }
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("Deseja realmente excluir esta categoria?")) return;
    try {
      await base44.entities.Categoria.delete(id);
    } catch (err) {
      alert(`Não foi possível excluir a categoria: ${err.message}`);
    }
    loadData();
  };

  const toggleAtiva = async (cat) => {
    try {
      await base44.entities.Categoria.update(cat.id, { ativa: !cat.ativa });
    } catch (err) {
      alert(`Não foi possível alterar a categoria: ${err.message}`);
    }
    loadData();
  };

  const f = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const filtered = categorias.filter(c => !search || c.nome?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      <PageHeader title="Categorias" description={`${categorias.length} categorias cadastradas`} actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nova Categoria</Button>} />

      {categorias.length === 0 ? (
        <EmptyState icon={Tag} title="Nenhuma categoria cadastrada" description="Cadastre categorias para organizar seus produtos." actionLabel="Adicionar Categoria" onAction={openNew} />
      ) : (
        <>
          <div className="mb-4 max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar categoria..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Descrição</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ativa</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(cat => (
                    <tr key={cat.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{cat.nome}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{cat.descricao || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleAtiva(cat)} className="inline-flex">
                          <StatusBadge status={cat.ativa === false ? "inactive" : "active"} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(cat)} className="p-1.5 hover:bg-muted rounded-lg"><Edit className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => handleDelete(cat.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
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
          <DialogHeader><DialogTitle>{editing ? "Editar Categoria" : "Nova Categoria"}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome || ""} onChange={f("nome")} placeholder="Ex: Coladeira de Borda" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={form.descricao || ""} onChange={f("descricao")} placeholder="Descrição opcional" />
            </div>
            <div>
              <Label>Status</Label>
              <div className="flex gap-2">
                <button onClick={() => setForm(prev => ({ ...prev, ativa: true }))} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${form.ativa !== false ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>Ativa</button>
                <button onClick={() => setForm(prev => ({ ...prev, ativa: false }))} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${form.ativa === false ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>Inativa</button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.nome}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}