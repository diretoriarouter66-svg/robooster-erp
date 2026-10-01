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
import { reconciliarPedidoCompra } from "@/lib/stockService";

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
      base44.entities.PurchaseOrder.list("-created_date", 1000),
      base44.entities.Contato.list("-created_date", 1000).then(cs => (cs || []).filter(c => (c.tipos || []).includes("Fornecedor") && c.status !== "inactive")),
      base44.entities.Product.list("-created_date", 1000),
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
  const r2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
  const hoje = () => new Date().toISOString().slice(0, 10);
  const somaDias = (iso, dias) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };

  /** "30/60/90", "30 60 90", "à vista", "28 dias" → lista de prazos em dias (01/10/2026). Sem número = 1 conta na previsão de entrega. */
  const prazosDaCondicao = (txt) => {
    if (/vista/i.test(String(txt || ""))) return [0]; // "à vista" = vence na data do pedido
    const nums = String(txt || "").match(/\d+/g);
    if (!nums) return null;
    const dias = nums.map(n => parseInt(n, 10)).filter(n => n >= 0 && n <= 720);
    return dias.length ? dias : null;
  };

  /** Conta(s) a pagar do pedido de compra (01/10/2026, contradição nº 2 do Manual): Confirmado/Recebido parcial/Recebido
   *  geram pendente(s) na categoria Fornecedor; reeditar recria o pendente e NUNCA mexe no pago; rascunho/enviado/cancelado
   *  removem o pendente. Valor = total em R$ + frete/outras despesas. */
  const sincronizarFinanceiroCompra = async (orderId, data) => {
    const antigas = await base44.entities.FinancialEntry.filter({ reference_id: orderId, reference_type: "purchase_order" }, "-created_date", 100);
    const pagas = (antigas || []).filter(e => e.status === "paid");
    for (const e of (antigas || []).filter(e => e.status !== "paid")) await base44.entities.FinancialEntry.delete(e.id);
    if (!["confirmed", "partial", "received"].includes(data.status)) return;
    const total = r2((data.total_brl || 0) + (parseFloat(data.frete_outras_brl) || 0));
    const jaPago = r2(pagas.reduce((s, e) => s + (e.amount || 0), 0));
    const restante = r2(total - jaPago);
    if (restante <= 0) return;
    const base = data.order_date || hoje();
    const prazos = prazosDaCondicao(data.payment_terms);
    const vencimentos = prazos ? prazos.map(d => somaDias(base, d)) : [data.expected_delivery || somaDias(base, 30)];
    const n = vencimentos.length;
    const parcela = Math.floor((restante / n) * 100) / 100;
    for (let i = 0; i < n; i++) {
      const valor = i === n - 1 ? r2(restante - parcela * (n - 1)) : parcela;
      await base44.entities.FinancialEntry.create({
        type: "payable", category: "supplier", status: "pending", payment_method: "transfer",
        reference_id: orderId, reference_type: "purchase_order",
        amount: valor, due_date: vencimentos[i],
        description: `Compra ${data.po_number} — ${data.supplier_name || "fornecedor"}${n > 1 ? ` (${i + 1}/${n})` : ""}`,
      });
    }
  };

  /** Recebido → custo manual do produto = (preço × câmbio) + frete rateado por valor, só para produto SEM custo de importação;
   *  grava no histórico de custo (origem compra_nacional). Idempotente por pedido. */
  const atualizarCustoProdutos = async (data, cambio) => {
    if (data.status !== "received") return 0;
    const itensProd = (data.items || []).filter(i => i.product_id && (i.quantity || 0) > 0);
    const baseValor = itensProd.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0) * cambio, 0) || 1;
    const frete = parseFloat(data.frete_outras_brl) || 0;
    let n = 0;
    for (const it of itensProd) {
      const prod = products.find(p => p.id === it.product_id);
      if (!prod || parseFloat(prod.cost_landed_brl) > 0) continue; // custo de importação manda
      const valorItem = (it.quantity || 0) * (it.unit_price || 0) * cambio;
      const custo = r2((valorItem + frete * (valorItem / baseValor)) / (it.quantity || 1));
      if (!(custo > 0) || Math.abs((parseFloat(prod.custo_manual_brl) || 0) - custo) < 0.01) continue;
      await base44.entities.Product.update(prod.id, { custo_manual_brl: custo });
      try {
        const ant = await base44.entities.ProductCostHistory.filter({ product_id: prod.id, referencia: data.po_number }, "-data", 20);
        if (!(ant || []).some(h => Math.abs((parseFloat(h.custo) || 0) - custo) < 0.01)) {
          await base44.entities.ProductCostHistory.create({ product_id: prod.id, custo, origem: "compra_nacional", referencia: data.po_number, data: hoje() });
        }
      } catch (err) { console.error("histórico de custo (compra):", err); }
      n++;
    }
    return n;
  };

  const handleSave = async () => {
    for (const item of poItems) {
      if (!item.product_id && !(item.name || "").trim()) {
        alert("Cada item precisa de um produto vinculado ou de um nome (item manual).");
        return;
      }
    }
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
    let orderId;
    try {
      if (editing) {
        await base44.entities.PurchaseOrder.update(editing.id, data);
        orderId = editing.id;
      } else {
        const criado = await base44.entities.PurchaseOrder.create(data);
        orderId = criado.id;
      }
    } catch (err) {
      alert(`Não foi possível salvar o pedido de compra: ${err.message}`);
      return;
    }
    const cambio = data.currency === "BRL" ? 1 : (data.exchange_rate || 1);
    try {
      await reconciliarPedidoCompra(orderId, data.po_number, poItems, cambio, data.status === "received");
    } catch (err) {
      alert(`O pedido foi salvo, mas não foi possível atualizar o estoque: ${err.message}`);
    }
    try {
      await sincronizarFinanceiroCompra(orderId, data);
    } catch (err) {
      alert(`O pedido foi salvo, mas houve erro ao lançar a conta a pagar no Financeiro: ${err.message}`);
    }
    try {
      const n = await atualizarCustoProdutos(data, cambio);
      if (n > 0) alert(`${n} produto(s) com custo atualizado pela compra (só os que não têm custo de importação).`);
    } catch (err) {
      alert(`O pedido foi salvo, mas houve erro ao atualizar o custo dos produtos: ${err.message}`);
    }
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este pedido de compra?")) return;
    const order = orders.find(o => o.id === id);
    try {
      await reconciliarPedidoCompra(id, order?.po_number, order?.items || [], 1, false);
      const pend = await base44.entities.FinancialEntry.filter({ reference_id: id, reference_type: "purchase_order" }, "-created_date", 100);
      for (const e of (pend || []).filter(e => e.status !== "paid")) await base44.entities.FinancialEntry.delete(e.id);
      await base44.entities.PurchaseOrder.delete(id);
    } catch (err) {
      alert(`Não foi possível excluir o pedido de compra: ${err.message}`);
    }
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
      <PageHeader title="Pedidos de Compra" description={`${orders.length} pedidos`} actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo pedido</Button>} />

      {orders.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum pedido de compra" description="Crie pedidos de compra para seus fornecedores." actionLabel="Novo pedido" onAction={openNew} />
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
          <DialogHeader><DialogTitle>{editing ? "Editar pedido de compra" : "Novo pedido de compra"}</DialogTitle></DialogHeader>
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
              <Select value={form.currency || "USD"} onValueChange={v => setForm({...form, currency: v, exchange_rate: v === "BRL" ? 1 : (form.currency === "BRL" ? 5.0 : form.exchange_rate)})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD","EUR","CNY","BRL"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Em reais não há câmbio: campo travado em 1 (pedido do Mauricio, 23/09/2026). */}
            <div><Label>Cotação Câmbio</Label><Input type="number" step="0.01" value={form.currency === "BRL" ? 1 : (form.exchange_rate || "")} disabled={form.currency === "BRL"} onChange={e => setForm({...form, exchange_rate: parseFloat(e.target.value) || 0})} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || "draft"} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[["draft","Rascunho"],["sent","Enviado"],["confirmed","Confirmado"],["partial","Recebido parcial"],["received","Recebido"],["cancelled","Cancelado"]].map(([s, l]) => <SelectItem key={s} value={s}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.status === "partial" && (
                <span className="block text-[10px] text-muted-foreground mt-1">recebido parcial não dá entrada no estoque nesta versão — só "Recebido" movimenta.</span>
              )}
            </div>
            <div>
              <Label>Cond. Pagamento</Label>
              <Input value={form.payment_terms || ""} onChange={e => setForm({...form, payment_terms: e.target.value})} placeholder="ex.: 30/60/90" />
              <span className="block text-[10px] text-muted-foreground mt-1">{prazosDaCondicao(form.payment_terms) ? `${prazosDaCondicao(form.payment_terms).length} conta(s) a pagar: ${prazosDaCondicao(form.payment_terms).join(" / ")} dias da data do pedido` : "sem número = 1 conta a pagar na previsão de entrega (ou 30 dias)"}</span>
            </div>
            <div><Label>Previsão Entrega</Label><Input type="date" value={form.expected_delivery || ""} onChange={e => setForm({...form, expected_delivery: e.target.value})} /></div>
            <div><Label>Data do pedido</Label><Input type="date" value={form.order_date || ""} onChange={e => setForm({...form, order_date: e.target.value})} /></div>
            <div>
              <Label>Frete / outras despesas (R$)</Label>
              <Input type="number" step="0.01" value={form.frete_outras_brl ?? ""} onChange={e => setForm({...form, frete_outras_brl: parseFloat(e.target.value) || 0})} placeholder="0,00" />
              <span className="block text-[10px] text-muted-foreground mt-1">entra na conta a pagar e é rateado no custo dos produtos (por valor)</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Confirmado / Recebido parcial / Recebido geram a conta a pagar (categoria Fornecedor); <strong>Recebido</strong> dá entrada no estoque e atualiza o custo manual dos produtos que não têm custo de importação.</p>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label>Itens</Label>
              <Button size="sm" variant="ghost" onClick={() => setPoItems([...poItems, { product_id: "", name: "", quantity: 1, unit_price: 0 }])}><Plus className="w-3 h-3 mr-1" /> Item</Button>
            </div>
            {poItems.map((item, idx) => (
              <div key={idx} className="mb-2">
                <div className="grid grid-cols-4 gap-2 items-end">
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
                {!item.product_id && (
                  <div className="mt-1">
                    <Input className="h-9 text-xs" placeholder="Nome do item manual" value={item.name || ""} onChange={e => updatePoItem(idx, "name", e.target.value)} />
                    <span className="block text-[10px] text-muted-foreground mt-0.5">item manual — não entra no estoque</span>
                  </div>
                )}
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