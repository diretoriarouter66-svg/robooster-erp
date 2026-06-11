import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Search, Package, Edit, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [prods, supps] = await Promise.all([
      base44.entities.Product.list("-created_date", 200),
      base44.entities.Supplier.list("-created_date", 200),
    ]);
    setProducts(prods);
    setSuppliers(supps);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ status: "active", unit: "UN" });
    setDialogOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({ ...product });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editing) {
      await base44.entities.Product.update(editing.id, form);
    } else {
      await base44.entities.Product.create(form);
    }
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("Deseja realmente excluir este produto?")) return;
    await base44.entities.Product.delete(id);
    loadData();
  };

  const filtered = products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.ncm?.includes(search)
  );

  const formatCurrency = (val) => {
    if (!val && val !== 0) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

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
        title="Produtos"
        description={`${products.length} produtos cadastrados`}
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo Produto</Button>}
      />

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum produto cadastrado"
          description="Comece adicionando seus produtos importados."
          actionLabel="Adicionar Produto"
          onAction={openNew}
        />
      ) : (
        <>
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, SKU ou NCM..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produto</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">NCM</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Estoque</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Custo Landed</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Preço Venda</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => (
                    <tr key={product.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{product.sku}</td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{product.name}</p>
                          {product.brand && <p className="text-xs text-muted-foreground">{product.brand}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono hidden md:table-cell">{product.ncm || "—"}</td>
                      <td className={`px-4 py-3 text-right hidden sm:table-cell font-medium ${
                        product.stock_quantity <= (product.min_stock || 0) && product.min_stock > 0 ? "text-destructive" : ""
                      }`}>
                        {product.stock_quantity || 0}
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">{formatCurrency(product.cost_landed_brl)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(product.sale_price)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={product.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(product)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                            <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          <button onClick={() => handleDelete(product.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors">
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
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
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div>
              <Label>SKU *</Label>
              <Input value={form.sku || ""} onChange={e => setForm({...form, sku: e.target.value})} placeholder="SKU-001" />
            </div>
            <div>
              <Label>Nome *</Label>
              <Input value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nome do produto" />
            </div>
            <div>
              <Label>Marca</Label>
              <Input value={form.brand || ""} onChange={e => setForm({...form, brand: e.target.value})} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Input value={form.category || ""} onChange={e => setForm({...form, category: e.target.value})} />
            </div>
            <div>
              <Label>NCM</Label>
              <Input value={form.ncm || ""} onChange={e => setForm({...form, ncm: e.target.value})} placeholder="0000.00.00" />
            </div>
            <div>
              <Label>País de Origem</Label>
              <Input value={form.origin_country || ""} onChange={e => setForm({...form, origin_country: e.target.value})} placeholder="China" />
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={form.unit || "UN"} onValueChange={v => setForm({...form, unit: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["UN", "KG", "CX", "PC", "MT", "LT", "PAR"].map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Peso (KG)</Label>
              <Input type="number" step="0.001" value={form.weight_kg || ""} onChange={e => setForm({...form, weight_kg: parseFloat(e.target.value) || 0})} />
            </div>
            <div>
              <Label>Custo FOB (USD)</Label>
              <Input type="number" step="0.01" value={form.cost_fob_usd || ""} onChange={e => setForm({...form, cost_fob_usd: parseFloat(e.target.value) || 0})} />
            </div>
            <div>
              <Label>Preço de Venda (BRL)</Label>
              <Input type="number" step="0.01" value={form.sale_price || ""} onChange={e => setForm({...form, sale_price: parseFloat(e.target.value) || 0})} />
            </div>
            <div>
              <Label>Estoque Mínimo</Label>
              <Input type="number" value={form.min_stock || ""} onChange={e => setForm({...form, min_stock: parseInt(e.target.value) || 0})} />
            </div>
            <div>
              <Label>Código de Barras</Label>
              <Input value={form.barcode || ""} onChange={e => setForm({...form, barcode: e.target.value})} />
            </div>
            <div>
              <Label>Fornecedor</Label>
              <Select value={form.supplier_id || "none"} onValueChange={v => setForm({...form, supplier_id: v === "none" ? "" : v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>
                  ))}
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
                  <SelectItem value="discontinued">Descontinuado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <textarea
                className="w-full min-h-[60px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.description || ""}
                onChange={e => setForm({...form, description: e.target.value})}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <textarea
                className="w-full min-h-[60px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.notes || ""}
                onChange={e => setForm({...form, notes: e.target.value})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.sku}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}