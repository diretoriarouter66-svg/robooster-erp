import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Factory, AlertTriangle, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";

const CONSUMIVEL_CATS = ["Peças de Reposição", "Insumos"];
const MAQUINA_CATS = ["Coladeira de Borda", "Coletor de Pó"];
const DIAS_ALERTA = 60;

export default function BaseInstalada() {
  const [rows, setRows] = useState([]);
  const [contatos, setContatos] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos"); // todos | frios
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [b, c, p, o] = await Promise.all([
      base44.entities.BaseInstalada.list("-created_date", 2000),
      base44.entities.Contato.list("-created_date", 2000),
      base44.entities.Product.list("-created_date", 1000),
      base44.entities.SaleOrder.list("-created_date", 2000),
    ]);
    setRows(b || []);
    setContatos(c || []);
    setProducts(p || []);
    setOrders(o || []);
    setLoading(false);
  };

  const maquinas = products.filter(p => MAQUINA_CATS.includes(p.category_name));
  const clientes = contatos.filter(c => (c.tipos || []).includes("Cliente") || rows.some(r => r.contato_id === c.id));

  // Por cliente: última compra de consumível (pedido faturado contendo item de Peças/Insumos)
  const ultimoConsumivelPorCliente = useMemo(() => {
    const consumivelIds = new Set(products.filter(p => CONSUMIVEL_CATS.includes(p.category_name)).map(p => p.id));
    const map = {};
    for (const o of orders) {
      if (!["invoiced", "shipped", "delivered"].includes(o.status)) continue;
      const temConsumivel = (o.items || []).some(i => consumivelIds.has(i.product_id));
      if (!temConsumivel || !o.customer_id) continue;
      const d = o.order_date || (o.created_date || "").slice(0, 10);
      if (!map[o.customer_id] || d > map[o.customer_id]) map[o.customer_id] = d;
    }
    return map;
  }, [orders, products]);

  const porCliente = useMemo(() => {
    const grupos = {};
    for (const r of rows) {
      if (!grupos[r.contato_id]) grupos[r.contato_id] = [];
      grupos[r.contato_id].push(r);
    }
    const hoje = new Date();
    return Object.entries(grupos).map(([contatoId, maqs]) => {
      const contato = contatos.find(c => c.id === contatoId);
      const ultimo = ultimoConsumivelPorCliente[contatoId] || null;
      const diasSem = ultimo ? Math.floor((hoje - new Date(ultimo + "T12:00:00")) / 86400000) : null;
      const frio = ultimo ? diasSem >= DIAS_ALERTA : true; // nunca comprou consumível = frio também
      return { contatoId, contato, maqs, ultimo, diasSem, frio };
    }).sort((a, b) => (b.frio === a.frio ? 0 : b.frio ? 1 : -1) || (b.diasSem ?? 99999) - (a.diasSem ?? 99999));
  }, [rows, contatos, ultimoConsumivelPorCliente]);

  const listaFiltrada = filtro === "frios" ? porCliente.filter(g => g.frio) : porCliente;
  const totalFrios = porCliente.filter(g => g.frio).length;

  const handleSave = async () => {
    if (!form.contato_id || !form.product_id) { alert("Cliente e máquina são obrigatórios."); return; }
    setSaving(true);
    try {
      await base44.entities.BaseInstalada.create({
        contato_id: form.contato_id,
        product_id: form.product_id,
        numero_serie: form.numero_serie || "",
        data_venda: form.data_venda || null,
        origem: "manual",
        notes: form.notes || "",
      });
      setDialogOpen(false);
      setForm({});
      loadData();
    } catch (err) {
      alert(`Não foi possível registrar: ${err.message}`);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Remover esta máquina da base instalada?")) return;
    await base44.entities.BaseInstalada.delete(id);
    loadData();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div>
      <PageHeader title="Base Instalada" description="Quem tem qual máquina — e quem está há tempo demais sem comprar consumível" actions={
        <Button onClick={() => { setForm({}); setDialogOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Registrar Máquina</Button>
      } />

      <div className="flex gap-2 mb-4">
        <button onClick={() => setFiltro("todos")} className={`px-3 py-1.5 rounded-full text-sm font-medium border ${filtro === "todos" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
          Todos ({porCliente.length})
        </button>
        <button onClick={() => setFiltro("frios")} className={`px-3 py-1.5 rounded-full text-sm font-medium border flex items-center gap-1 ${filtro === "frios" ? "bg-destructive text-destructive-foreground border-destructive" : "bg-card border-border"}`}>
          <AlertTriangle className="w-3.5 h-3.5" /> Sem consumível há {DIAS_ALERTA}+ dias ({totalFrios})
        </button>
      </div>

      {listaFiltrada.length === 0 ? (
        <EmptyState icon={Factory} title="Base instalada vazia" description="Pedidos faturados com máquinas alimentam esta tela automaticamente. Máquinas vendidas antes do ERP: use 'Registrar Máquina'." />
      ) : (
        <div className="space-y-3">
          {listaFiltrada.map(g => (
            <div key={g.contatoId} className={`bg-card rounded-xl border p-4 ${g.frio ? "border-destructive/40" : "border-border"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <p className="font-semibold">{g.contato?.name || "Cliente removido"}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.ultimo
                      ? `Último consumível: ${new Date(g.ultimo + "T12:00:00").toLocaleDateString("pt-BR")} — há ${g.diasSem} dias`
                      : "Nunca comprou consumível pelo ERP"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {g.frio && <span className="text-xs font-medium text-destructive flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Oportunidade de venda</span>}
                  {g.contato?.whatsapp && (
                    <a href={`https://wa.me/55${String(g.contato.whatsapp).replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-success border border-success/40 rounded-full px-3 py-1 hover:bg-success/10">
                      <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                    </a>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {g.maqs.map(m => {
                  const p = products.find(pr => pr.id === m.product_id);
                  return (
                    <div key={m.id} className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-xs">
                      <Factory className="w-3.5 h-3.5 text-primary" />
                      <span className="font-medium">{p?.model || p?.name || "?"}</span>
                      {m.numero_serie && <span className="text-muted-foreground">nº {m.numero_serie}</span>}
                      {m.data_venda && <span className="text-muted-foreground">· {new Date(m.data_venda + "T12:00:00").toLocaleDateString("pt-BR")}</span>}
                      <span className="text-muted-foreground">· {m.origem === "pedido" ? "via pedido" : "manual"}</span>
                      <button onClick={() => handleDelete(m.id)} className="ml-1 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar máquina na base instalada</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">Para máquinas vendidas ANTES do ERP. As novas entram sozinhas pelo pedido faturado.</p>
          <div className="space-y-3">
            <div>
              <Label>Cliente *</Label>
              <Select value={form.contato_id || ""} onValueChange={v => setForm(p => ({ ...p, contato_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {contatos.filter(c => (c.tipos || []).includes("Cliente")).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Cliente não aparece? Cadastre em Contatos com o tipo "Cliente".</p>
            </div>
            <div>
              <Label>Máquina *</Label>
              <Select value={form.product_id || ""} onValueChange={v => setForm(p => ({ ...p, product_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a máquina" /></SelectTrigger>
                <SelectContent>
                  {maquinas.map(m => <SelectItem key={m.id} value={m.id}>{m.model || m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nº de série</Label><Input value={form.numero_serie || ""} onChange={e => setForm(p => ({ ...p, numero_serie: e.target.value }))} /></div>
              <div><Label>Data da venda</Label><Input type="date" value={form.data_venda || ""} onChange={e => setForm(p => ({ ...p, data_venda: e.target.value }))} /></div>
            </div>
            <div><Label>Observações</Label><Input value={form.notes || ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Registrar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
