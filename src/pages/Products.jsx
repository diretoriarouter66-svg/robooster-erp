import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Search, Package, Edit, Trash2, Upload, ExternalLink, X } from "lucide-react";
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
  const [categories, setCategories] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [prods, supps, cats] = await Promise.all([
      base44.entities.Product.list("-created_date", 200),
      base44.entities.Supplier.list("-created_date", 200),
      base44.entities.ProductCategory.list("-created_date", 200),
    ]);
    setProducts(prods);
    setSuppliers(supps);
    setCategories(cats);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ status: "active", unit: "UN", pis_rate: 2.1, cofins_rate: 9.65 });
    setDialogOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({ ...product });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editing) await base44.entities.Product.update(editing.id, form);
    else await base44.entities.Product.create(form);
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("Deseja realmente excluir este produto?")) return;
    await base44.entities.Product.delete(id);
    loadData();
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev => ({ ...prev, image_url: file_url }));
    setUploadingImage(false);
  };

  const handleCategoryChange = (categoryId) => {
    if (categoryId === "none") {
      setForm({ ...form, category_id: "", category_name: "" });
      return;
    }
    const cat = categories.find(c => c.id === categoryId);
    setForm({ ...form, category_id: categoryId, category_name: cat?.name || "" });
  };

  const filtered = products.filter(p =>
    !search ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.ncm?.includes(search)
  );

  const formatCurrency = (val) => {
    if (!val && val !== 0) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const f = (field) => (e) => {
    const val = e.target.type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value;
    setForm(prev => ({ ...prev, [field]: val }));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Produtos"
        description={`${products.length} produtos cadastrados`}
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo Produto</Button>}
      />

      {products.length === 0 ? (
        <EmptyState icon={Package} title="Nenhum produto cadastrado" description="Comece adicionando seus produtos importados." actionLabel="Adicionar Produto" onAction={openNew} />
      ) : (
        <>
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, SKU ou NCM..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
                        <div className="flex items-center gap-2">
                          {product.image_url && <img src={product.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />}
                          <div>
                            <p className="font-medium">{product.name}</p>
                            {product.brand && <p className="text-xs text-muted-foreground">{product.brand}</p>}
                          </div>
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
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>

          {/* FOTO PRINCIPAL */}
          <div className="mt-2">
            <Label>Foto Principal</Label>
            <div className="mt-1 flex items-center gap-3">
              {form.image_url ? (
                <div className="relative">
                  <img src={form.image_url} alt="Produto" className="w-20 h-20 rounded-lg object-cover border border-border" />
                  <button onClick={() => setForm(prev => ({ ...prev, image_url: "" }))} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30">
                  <Package className="w-7 h-7 text-muted-foreground" />
                </div>
              )}
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <Button variant="outline" size="sm" disabled={uploadingImage} asChild>
                  <span><Upload className="w-4 h-4 mr-1" />{uploadingImage ? "Enviando..." : "Upload de Foto"}</span>
                </Button>
              </label>
            </div>
          </div>

          {/* IDENTIFICAÇÃO */}
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Identificação</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>SKU *</Label>
                <Input value={form.sku || ""} onChange={f("sku")} placeholder="SKU-001" />
              </div>
              <div>
                <Label>Nome *</Label>
                <Input value={form.name || ""} onChange={f("name")} placeholder="Nome do produto" />
              </div>
              <div>
                <Label>Marca</Label>
                <Input value={form.brand || ""} onChange={f("brand")} />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.category_id || "none"} onValueChange={handleCategoryChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>NCM</Label>
                <Input value={form.ncm || ""} onChange={f("ncm")} placeholder="0000.00.00" />
              </div>
              <div>
                <Label>País de Origem</Label>
                <Input value={form.origin_country || ""} onChange={f("origin_country")} placeholder="China" />
              </div>
              <div>
                <Label>Código de Barras (EAN)</Label>
                <Input value={form.barcode || ""} onChange={f("barcode")} />
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
            </div>
          </div>

          {/* DESCRIÇÃO */}
          <div className="mt-4">
            <Label>Descrição</Label>
            <textarea
              className="w-full min-h-[120px] mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.description || ""}
              onChange={e => setForm({...form, description: e.target.value})}
              placeholder="Descrição detalhada do produto..."
            />
          </div>

          {/* DIMENSÕES E PESO */}
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Dimensões e Peso</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label>Altura (cm)</Label>
                <Input type="number" step="0.1" value={form.height_cm || ""} onChange={f("height_cm")} placeholder="0" />
              </div>
              <div>
                <Label>Largura (cm)</Label>
                <Input type="number" step="0.1" value={form.width_cm || ""} onChange={f("width_cm")} placeholder="0" />
              </div>
              <div>
                <Label>Comprimento (cm)</Label>
                <Input type="number" step="0.1" value={form.length_cm || ""} onChange={f("length_cm")} placeholder="0" />
              </div>
              <div>
                <Label>Peso (KG)</Label>
                <Input type="number" step="0.001" value={form.weight_kg || ""} onChange={f("weight_kg")} placeholder="0" />
              </div>
            </div>
          </div>

          {/* PREÇOS */}
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Preços</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <Label>Custo FOB (USD)</Label>
                <Input type="number" step="0.01" value={form.cost_fob_usd || ""} onChange={f("cost_fob_usd")} />
              </div>
              <div>
                <Label>Custo Landed (BRL)</Label>
                <Input type="number" step="0.01" value={form.cost_landed_brl || ""} onChange={f("cost_landed_brl")} />
              </div>
              <div>
                <Label>Preço de Venda (BRL)</Label>
                <Input type="number" step="0.01" value={form.sale_price || ""} onChange={f("sale_price")} />
              </div>
              <div>
                <Label>Markup (%)</Label>
                <Input type="number" step="0.1" value={form.markup_percent || ""} onChange={f("markup_percent")} />
              </div>
              <div>
                <Label>Estoque Atual</Label>
                <Input type="number" value={form.stock_quantity || ""} onChange={f("stock_quantity")} />
              </div>
              <div>
                <Label>Estoque Mínimo</Label>
                <Input type="number" value={form.min_stock || ""} onChange={f("min_stock")} />
              </div>
            </div>
          </div>

          {/* IMPOSTOS */}
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Alíquotas de Impostos</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <Label>II (%)</Label>
                <Input type="number" step="0.01" value={form.ii_rate || ""} onChange={f("ii_rate")} placeholder="0" />
              </div>
              <div>
                <Label>IPI (%)</Label>
                <Input type="number" step="0.01" value={form.ipi_rate || ""} onChange={f("ipi_rate")} placeholder="0" />
              </div>
              <div>
                <Label>PIS (%)</Label>
                <Input type="number" step="0.01" value={form.pis_rate ?? 2.1} onChange={f("pis_rate")} placeholder="2.10" />
              </div>
              <div>
                <Label>COFINS (%)</Label>
                <Input type="number" step="0.01" value={form.cofins_rate ?? 9.65} onChange={f("cofins_rate")} placeholder="9.65" />
              </div>
              <div>
                <Label>ICMS (%)</Label>
                <Input type="number" step="0.01" value={form.icms_rate || ""} onChange={f("icms_rate")} placeholder="0" />
              </div>
            </div>
          </div>

          {/* MÍDIA */}
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Mídia</p>
            <div>
              <Label>Link de Vídeo</Label>
              <div className="relative">
                <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={form.video_url || ""} onChange={f("video_url")} placeholder="https://youtube.com/..." className="pl-9" />
              </div>
              {form.video_url && (
                <a href={form.video_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Abrir vídeo
                </a>
              )}
            </div>
          </div>

          {/* OBSERVAÇÕES */}
          <div className="mt-4">
            <Label>Observações</Label>
            <textarea
              className="w-full min-h-[60px] mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.notes || ""}
              onChange={e => setForm({...form, notes: e.target.value})}
            />
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