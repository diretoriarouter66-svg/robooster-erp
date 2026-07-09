import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Search, FileText, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";

export default function PurchaseOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [poItems, setPoItems] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [o, s, p] = await Promise.all([
      base44.entities.PurchaseOrder.list("-created_date", 200),
      base44.entities.Contato.list("-created_date", 500).then(cs => (cs || []).filter(c => (c.tipos || []).includes("Fornecedor") && c.status !== "inactive")),
      base44.entities.Product.list("-created_date", 200),
    ]);
    setOrders(o);
    setSuppliers(s);
    setProducts(p);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ status: "draft", currency: "USD", exchange_rate: 5.0 });
    setPoItems([{ product_id: "", name: "", quantity: 1, unit_price: 0 }]);
    setDialogOpen(true);
  };

  const openEdit = (o) => {
    setEditing(o);
    setForm({ ...o });
    setPoItems(o.items || [{ product_id: "", name: "", quantity: 1, unit_price: 0 }]);
    setDialogOpen(true);
  };

  const updatePoItem = (idx, field, value) => {
    const updated = [...poItems];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "product_id" && value) {
      const p = products.find(pr => pr.id === value);
      if (p) {
        updated[idx].name = p.name;
        updated[idx].sku = p.sku;
        updated[idx].unit_price = p.cost_fob_usd || 0;
      }
    }
    setPoItems(updated);
  };

  const calcSubtotal = () => poItems.reduce((s, i) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0);

  const handleSave = async () => {
    const sub = calcSubtotal();
    const supplier = suppliers.find(s => s.id === form.supplier_id);
    const data = {
      ...form,
      supplier_name: supplier?.name || form.supplier_name || "",
      items: poItems,
      subtotal: sub,
      total_brl: sub * (form.exchange_rate || 1),
      po_number: form.po_number || `PO-${Date.now().toString(36).toUpperCase()}`,
    };
    if (editing) {
      await base44.entities.PurchaseOrder.update(editing.id, data);
    } else {
      await base44.entities.PurchaseOrder.create(data);
    }
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este pedido de compra?")) return;
    await base44.entities.PurchaseOrder.delete(id);
    loadData();
  };

  const formatCurrency = (val, cur) => {
    if (!val && val !== 0) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: cur || "BRL" }).format(val);
  };

  const filtered = orders.filter(o =>
    !search || o.po_number?.toLowerCase().includes(search.toLowerCase()) ||
    o.supplier_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader title="Pedidos de Compra" description={`${orders.length} pedidos`} actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nova PO</Button>} />

      {orders.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum pedido de compra" description="Crie pedidos de compra para seus fornecedores." actionLabel="Nova PO" onAction={openNew} />
      ) : (
        <>
          <div className="mb-4 max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar PO..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">PO</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Fornecedor</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Moeda</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Subtotal</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Total BRL</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr></thead>
                <tbody>
                  {filtered.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{o.po_number}</td>
                      <td className="px-4 py-3 hidden md:table-cell">{o.supplier_name || "—"}</td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell font-mono text-xs">{o.currency}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(o.subtotal, o.currency)}</td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell font-medium">{formatCurrency(o.total_brl)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(o)} className="p-1.5 hover:bg-muted rounded-lg"><Edit className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => handleDelete(o.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
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
          <DialogHeader><DialogTitle>{editing ? "Editar PO" : "Novo Pedido de Compra"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div>
              <Label>Fornecedor</Label>
              <Select value={form.supplier_id || "none"} onValueChange={v => setForm({...form, supplier_id: v === "none" ? "" : v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Moeda</Label>
              <Select value={form.currency || "USD"} onValueChange={v => setForm({...form, currency: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD","EUR","CNY","BRL"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Cotação Câmbio</Label><Input type="number" step="0.01" value={form.exchange_rate || ""} onChange={e => setForm({...form, exchange_rate: parseFloat(e.target.value) || 0})} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || "draft"} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["draft","sent","confirmed","partial","received","cancelled"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Cond. Pagamento</Label><Input value={form.payment_terms || ""} onChange={e => setForm({...form, payment_terms: e.target.value})} /></div>
            <div><Label>Previsão Entrega</Label><Input type="date" value={form.expected_delivery || ""} onChange={e => setForm({...form, expected_delivery: e.target.value})} /></div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label>Itens</Label>
              <Button size="sm" variant="ghost" onClick={() => setPoItems([...poItems, { product_id: "", name: "", quantity: 1, unit_price: 0 }])}><Plus className="w-3 h-3 mr-1" /> Item</Button>
            </div>
            {poItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-2 mb-2 items-end">
                <div className="col-span-2">
                  <Select value={item.product_id || "manual"} onValueChange={v => updatePoItem(idx, "product_id", v === "manual" ? "" : v)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Produto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Input type="number" className="h-9 text-xs" placeholder="Qtd" value={item.quantity || ""} onChange={e => updatePoItem(idx, "quantity", parseFloat(e.target.value) || 0)} />
                <Input type="number" step="0.01" className="h-9 text-xs" placeholder="Preço" value={item.unit_price || ""} onChange={e => updatePoItem(idx, "unit_price", parseFloat(e.target.value) || 0)} />
              </div>
            ))}
            <div className="text-right mt-2">
              <span className="text-sm text-muted-foreground">Subtotal: </span>
              <span className="font-bold">{formatCurrency(calcSubtotal(), form.currency)}</span>
            </div>
          </div>

          <div className="mt-3">
            <Label>Observações</Label>
            <textarea className="w-full min-h-[50px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none" value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}