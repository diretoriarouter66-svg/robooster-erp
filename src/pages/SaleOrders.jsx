import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Search, ShoppingCart, Edit, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import { reconciliarPedidoVenda } from "@/lib/stockService";

const CHANNEL_TYPE_MAP = {
  direct: "venda_direta",
  mercado_livre: "mercado_livre_classico",
  woocommerce: "site_woocommerce",
  other: "outro",
};

export default function SaleOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [channels, setChannels] = useState([]);
  const [pricings, setPricings] = useState([]);
  const [orderItems, setOrderItems] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [o, c, p, ch, pr] = await Promise.all([
      base44.entities.SaleOrder.list("-created_date", 200),
      base44.entities.Contato.list("-created_date", 500).then(cs => (cs || []).filter(c => (c.tipos || []).includes("Cliente") && c.status !== "inactive")),
      base44.entities.Product.list("-created_date", 200),
      base44.entities.SalesChannel.list("-created_date", 50),
      base44.entities.ProductPricing.list("-created_date", 500),
    ]);
    setOrders(o);
    setCustomers(c);
    setProducts(p);
    setChannels(ch);
    setPricings(pr);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ status: "pending", channel: "direct", payment_method: "pix", payment_status: "pending", discount: 0, shipping_cost: 0, installments: 1, installment_interval_days: 30, first_due_days: 0 });
    setOrderItems([{ product_id: "", name: "", quantity: 1, unit_price: 0 }]);
    setDialogOpen(true);
  };

  const openEdit = (o) => {
    setEditing(o);
    setForm({ ...o });
    setOrderItems(o.items || [{ product_id: "", name: "", quantity: 1, unit_price: 0 }]);
    setDialogOpen(true);
  };

  const getChannelPrice = (productId, channelId) => {
    if (!channelId) return null;
    const pricing = pricings.find(p => p.product_id === productId && p.channel_id === channelId);
    return pricing?.price || null;
  };

  const canalDoPedido = () => channels.find(c => c.id === form.channel_id) || null;

  const updateOrderItem = (idx, field, value) => {
    const updated = [...orderItems];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "product_id" && value) {
      const p = products.find(pr => pr.id === value);
      if (p) {
        updated[idx].name = p.name;
        updated[idx].sku = p.sku;
        const channelPrice = getChannelPrice(value, form.channel_id);
        updated[idx].unit_price = channelPrice ?? 0;
      }
    }
    setOrderItems(updated);
  };

  const handleChannelChange = (newChannelId) => {
    const ch = channels.find(c => c.id === newChannelId);
    const legado = ch?.type?.startsWith("mercado_livre") ? "mercado_livre" : ch?.type === "site_woocommerce" ? "woocommerce" : ch?.type === "venda_direta" ? "direct" : "other";
    setForm(prev => ({ ...prev, channel_id: newChannelId, channel: legado }));
    setOrderItems(prev => prev.map(item => {
      if (!item.product_id) return item;
      const price = getChannelPrice(item.product_id, newChannelId);
      return { ...item, unit_price: price ?? 0 };
    }));
  };

  const calcTotal = () => {
    const sub = orderItems.reduce((s, i) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0);
    return sub - (parseFloat(form.discount) || 0) + (parseFloat(form.shipping_cost) || 0);
  };

  // Status que baixam estoque e geram conta a receber
  const STATUS_BAIXA = ["invoiced", "shipped", "delivered"];

  const handleSave = async () => {
    const sub = orderItems.reduce((s, i) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0);
    const total = calcTotal();
    const customer = customers.find(c => c.id === form.customer_id);
    const deveBaixar = STATUS_BAIXA.includes(form.status);

    const data = {
      ...form,
      customer_name: customer?.name || form.customer_name || "",
      items: orderItems,
      subtotal: sub,
      total,
      order_number: form.order_number || `PV-${Date.now().toString(36).toUpperCase()}`,
    };

    // 1) Salva o pedido primeiro para ter um ID (o Kardex referencia o pedido)
    let orderId;
    if (editing) {
      await base44.entities.SaleOrder.update(editing.id, data);
      orderId = editing.id;
    } else {
      const created = await base44.entities.SaleOrder.create(data);
      orderId = created.id;
    }

    // 2) Estoque: reconcilia com o Kardex como fonte da verdade
    try {
      await reconciliarPedidoVenda(orderId, data.order_number, orderItems, deveBaixar);
    } catch (err) {
      // Sem estoque suficiente: pedido volta para Pendente e o usuário é avisado
      await base44.entities.SaleOrder.update(orderId, { status: "pending" }).catch(() => {});
      alert(`Não foi possível baixar o estoque: ${err.message}\n\nO pedido foi salvo como PENDENTE.`);
      setDialogOpen(false);
      loadData();
      return;
    }

    // 3) Financeiro: contas a receber automáticas (parcelas + liberação do marketplace)
    const entradas = await base44.entities.FinancialEntry.filter({ reference_id: orderId, reference_type: "sale_order" }, "-created_date", 50).catch(() => []);
    const pagas = (entradas || []).filter(e => e.status === "paid");
    const pendentes = (entradas || []).filter(e => e.status === "pending" || e.status === "overdue");

    // Cancela as pendentes antigas (as pagas são preservadas sempre)
    for (const e of pendentes) {
      await base44.entities.FinancialEntry.update(e.id, { status: "cancelled" }).catch(() => {});
    }

    if (deveBaixar) {
      // Data-base: hoje + dias de liberação do canal (ex: Mercado Livre segura ~14 dias)
      const canalObj = channels.find(c => c.type === (form.channel === "mercado_livre" ? "mercado_livre_premium" : form.channel)) || channels.find(c => (c.type || "").startsWith(form.channel));
      const diasLiberacao = canalObj?.dias_liberacao || 0;
      const nParcelas = Math.max(1, parseInt(form.installments) || 1);
      const intervalo = Math.max(0, parseInt(form.installment_interval_days) || 30);
      const primeiroVenc = Math.max(0, parseInt(form.first_due_days) || 0);
      const totalPago = pagas.reduce((t, e) => t + (e.amount || 0), 0);
      const restante = Math.max(0, total - totalPago);
      const parcelasRestantes = Math.max(1, nParcelas - pagas.length);
      const valorParcela = Math.round((restante / parcelasRestantes) * 100) / 100;
      const metodoValido = ["pix", "boleto", "credit_card", "transfer", "cash"].includes(form.payment_method) ? form.payment_method : "other";

      if (restante > 0) {
        for (let i = 0; i < parcelasRestantes; i++) {
          const venc = new Date();
          venc.setDate(venc.getDate() + diasLiberacao + primeiroVenc + i * intervalo);
          const ultima = i === parcelasRestantes - 1;
          const valor = ultima ? Math.round((restante - valorParcela * (parcelasRestantes - 1)) * 100) / 100 : valorParcela;
          const idxParcela = pagas.length + i + 1;
          await base44.entities.FinancialEntry.create({
            type: "receivable",
            category: "sale",
            description: `Pedido ${data.order_number} — ${data.customer_name || "Cliente"}${nParcelas > 1 ? ` (parcela ${idxParcela}/${nParcelas})` : ""}${diasLiberacao > 0 ? " · liberação marketplace" : ""}`,
            reference_id: orderId,
            reference_type: "sale_order",
            amount: valor,
            due_date: venc.toISOString().slice(0, 10),
            status: form.payment_status === "paid" ? "paid" : "pending",
            payment_method: metodoValido,
            ...(form.payment_status === "paid" ? { payment_date: new Date().toISOString().slice(0, 10) } : {}),
          });
        }
      }
    }

    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este pedido?")) return;
    const order = orders.find(o => o.id === id);
    // Reconcilia o estoque para zero (devolve o que estiver baixado) e cancela a conta a receber
    try {
      await reconciliarPedidoVenda(id, order?.order_number, order?.items || [], false);
    } catch (err) { alert(err.message); }
    const entradas = await base44.entities.FinancialEntry.filter({ reference_id: id, reference_type: "sale_order" }, "-created_date", 5).catch(() => []);
    for (const e of entradas || []) {
      if (e.status !== "paid" && e.status !== "cancelled") {
        await base44.entities.FinancialEntry.update(e.id, { status: "cancelled" }).catch(() => {});
      }
    }
    await base44.entities.SaleOrder.delete(id);
    loadData();
  };

  const formatCurrency = (val) => {
    if (!val && val !== 0) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const filtered = orders.filter(o =>
    !search || o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader title="Pedidos de Venda" description={`${orders.length} pedidos`} actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo Pedido</Button>} />

      {orders.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Nenhum pedido" description="Crie pedidos de venda para seus clientes." actionLabel="Novo Pedido" onAction={openNew} />
      ) : (
        <>
          <div className="mb-4 max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar pedido..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pedido</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Cliente</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Canal</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Pagamento</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr></thead>
                <tbody>
                  {filtered.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{o.order_number || `#${o.id.slice(0,6)}`}</td>
                      <td className="px-4 py-3 hidden md:table-cell">{o.customer_name || "—"}</td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell text-xs">{o.channel}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(o.total)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell"><StatusBadge status={o.payment_status} /></td>
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
          <DialogHeader><DialogTitle>{editing ? "Editar Pedido" : "Novo Pedido de Venda"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div>
              <Label>Cliente</Label>
              <Select value={form.customer_id || "none"} onValueChange={v => setForm({...form, customer_id: v === "none" ? "" : v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Canal</Label>
              <Select value={form.channel_id || ""} onValueChange={v => handleChannelChange(v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o canal" /></SelectTrigger>
                <SelectContent>
                  {channels.filter(c => c.active !== false).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.commission_percent > 0 ? ` (${c.commission_percent}%)` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || "pending"} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[["pending","Pendente"],["approved","Aprovado"],["invoiced","Faturado"],["shipped","Enviado"],["delivered","Entregue"],["cancelled","Cancelado"],["returned","Devolvido"]].map(([s, label]) => <SelectItem key={s} value={s}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pagamento</Label>
              <Select value={form.payment_method || "pix"} onValueChange={v => setForm({...form, payment_method: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[["pix","Pix"],["boleto","Boleto"],["credit_card","Cartão de Crédito"],["transfer","Transferência"],["marketplace","Marketplace"]].map(([m, label]) => <SelectItem key={m} value={m}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Condição</Label>
              <Select value={String(form.installments || 1)} onValueChange={v => setForm({...form, installments: parseInt(v)})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[[1,"À vista / 1 parcela"],[2,"2 parcelas"],[3,"3 parcelas"],[4,"4 parcelas"],[6,"6 parcelas"],[10,"10 parcelas"],[12,"12 parcelas"]].map(([n, label]) => <SelectItem key={n} value={String(n)}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(form.installments || 1) > 1 && (
              <>
                <div>
                  <Label>1º vencimento (dias)</Label>
                  <Input type="number" min="0" value={form.first_due_days ?? 0} onChange={e => setForm({...form, first_due_days: parseInt(e.target.value) || 0})} placeholder="30" />
                </div>
                <div>
                  <Label>Intervalo (dias)</Label>
                  <Input type="number" min="1" value={form.installment_interval_days ?? 30} onChange={e => setForm({...form, installment_interval_days: parseInt(e.target.value) || 30})} placeholder="30" />
                </div>
              </>
            )}
          </div>
          {(() => {
            const canalObj = channels.find(c => (c.type || "").startsWith(form.channel === "mercado_livre" ? "mercado_livre" : (form.channel || "")));
            const dias = canalObj?.dias_liberacao || 0;
            return dias > 0 ? <p className="text-[11px] text-warning mt-1">Canal com liberação em ~{dias} dias: as contas a receber serão previstas a partir da data de liberação.</p> : null;
          })()}

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label>Itens</Label>
              <Button size="sm" variant="ghost" onClick={() => setOrderItems([...orderItems, { product_id: "", name: "", quantity: 1, unit_price: 0 }])}><Plus className="w-3 h-3 mr-1" /> Item</Button>
            </div>
            {orderItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-2 mb-2 items-end">
                <div className="col-span-2">
                  <Select value={item.product_id || "manual"} onValueChange={v => updateOrderItem(idx, "product_id", v === "manual" ? "" : v)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Produto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Input type="number" className="h-9 text-xs" placeholder="Qtd" value={item.quantity || ""} onChange={e => updateOrderItem(idx, "quantity", parseFloat(e.target.value) || 0)} />
                <Input type="number" step="0.01" className="h-9 text-xs" placeholder="Preço" value={item.unit_price || ""} onChange={e => updateOrderItem(idx, "unit_price", parseFloat(e.target.value) || 0)} />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-3">
            <div><Label className="text-xs">Desconto</Label><Input type="number" step="0.01" value={form.discount || ""} onChange={e => setForm({...form, discount: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">Frete</Label><Input type="number" step="0.01" value={form.shipping_cost || ""} onChange={e => setForm({...form, shipping_cost: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">Total</Label><Input readOnly className="bg-muted font-bold" value={formatCurrency(calcTotal())} /></div>
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