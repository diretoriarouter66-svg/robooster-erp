import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, Search, Package, Edit, Trash2, Upload, ExternalLink, X, ChevronDown, ChevronRight, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import ProductPricingSection from "../components/products/ProductPricingSection";

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [categorias, setCategorias] = useState([]);
  const [vdPriceMap, setVdPriceMap] = useState({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showTech, setShowTech] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [prods, cats, chans, allPricings] = await Promise.all([
      base44.entities.Product.list("-created_date", 200),
      base44.entities.Categoria.list("-created_date", 200),
      base44.entities.SalesChannel.list("-created_date", 50),
      base44.entities.ProductPricing.list("-created_date", 500),
    ]);
    const vdChannel = chans.find(c => c.is_master) || chans.find(c => (c.commission_percent || 0) === 0 && (c.fixed_fee || 0) === 0) || chans.find(c => c.type === "venda_direta");
    const vdMap = {};
    if (vdChannel) {
      allPricings.filter(p => p.channel_id === vdChannel.id).forEach(p => { vdMap[p.product_id] = p.price; });
    }
    setProducts(prods);
    setCategorias(cats);
    setVdPriceMap(vdMap);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ status: "active", unit: "UN", pis_rate: 2.1, cofins_rate: 9.65, origin_country: "China", empilhavel: true, pode_deitar: false, beneficio_5291: false, ex_tarifario: false, ipi_recuperavel: true });
    setShowTech(false);
    setDialogOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({ ...product });
    setShowTech(false);
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

  const categoriasAtivas = categorias.filter(c => c.ativa !== false);

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
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(vdPriceMap[product.id])}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={product.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link to={`/precificacao?produto=${product.id}`} className="p-1.5 hover:bg-muted rounded-lg transition-colors" title="Precificar">
                            <Calculator className="w-3.5 h-3.5 text-primary" />
                          </Link>
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

          {/* === DADOS BÁSICOS === */}
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Dados Básicos</p>

            {/* FOTO PRINCIPAL */}
            <div className="mb-4">
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
                    <span><Upload className="w-4 h-4 mr-1" />{uploadingImage ? "Enviando..." : "Enviar Foto"}</span>
                  </Button>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Nome *</Label>
                <Input value={form.name || ""} onChange={f("name")} placeholder="Nome do produto" />
              </div>
              <div>
                <Label>SKU *</Label>
                <Input value={form.sku || ""} onChange={f("sku")} placeholder="SKU-001" />
              </div>
              <div>
                <Label>Modelo</Label>
                <Input value={form.model || ""} onChange={f("model")} placeholder="Ex: WF-802, DW-3600" />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.category_id || "none"} onValueChange={v => {
                  const cat = categoriasAtivas.find(c => c.id === v);
                  setForm(prev => ({ ...prev, category_id: v === "none" ? "" : v, category_name: cat?.nome || "" }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categoriasAtivas.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categoriasAtivas.length === 0 && <p className="text-[10px] text-muted-foreground mt-1">Nenhuma categoria ativa. Cadastre em "Categorias".</p>}
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
                <Label>Código de Barras (EAN)</Label>
                <Input value={form.barcode || ""} onChange={f("barcode")} placeholder="Código de barras" />
              </div>
              <div>
                <Label>Estoque Atual</Label>
                <Input type="number" value={form.stock_quantity ?? 0} readOnly disabled className="bg-muted" />
                <p className="text-[10px] text-muted-foreground mt-1">Somente leitura — movimentado pela tela de Estoque (vendas, importações e ajustes com justificativa).</p>
              </div>
              <div>
                <Label>Estoque Mínimo</Label>
                <Input type="number" value={form.min_stock || ""} onChange={f("min_stock")} placeholder="0" />
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

            {/* DESCRIÇÃO */}
            <div className="mt-3">
              <Label>Descrição</Label>
              <textarea
                className="w-full min-h-[100px] mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.description || ""}
                onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Descrição do produto..."
              />
            </div>

            {/* LINK DE VÍDEO */}
            <div className="mt-3">
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

            {/* CUSTO DO PRODUTO */}
            <div className="mt-3">
              <Label>Custo do Produto (R$)</Label>
              {form.cost_landed_brl ? (
                <>
                  <Input readOnly value={formatCurrency(form.cost_landed_brl)} className="bg-muted" />
                  <p className="text-[10px] text-muted-foreground mt-1">Substituído pelo custo da importação realizada</p>
                </>
              ) : (
                <>
                  <Input type="number" step="0.01" value={form.custo_manual_brl || ""} onChange={f("custo_manual_brl")} placeholder="0,00" />
                  <p className="text-[10px] text-muted-foreground mt-1">Custo manual do produto — usado quando não há importação realizada</p>
                </>
              )}
            </div>
          </div>

          {/* === DADOS TÉCNICOS DE IMPORTAÇÃO === */}
          <div className="mt-4 border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setShowTech(!showTech)}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dados Técnicos de Importação — preenchimento pelo responsável</span>
              {showTech ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>

            {showTech && (
              <div className="p-4 space-y-4">
                {/* IDENTIFICAÇÃO FISCAL */}
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground mb-2">Identificação Fiscal</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>NCM</Label>
                      <Input value={form.ncm || ""} onChange={f("ncm")} placeholder="0000.00.00" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Código fiscal do produto na importação (8 dígitos)</p>
                    </div>
                    <div>
                      <Label>País de Origem</Label>
                      <Input value={form.origin_country || ""} onChange={f("origin_country")} placeholder="China" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">País de fabricação do produto</p>
                    </div>
                  </div>
                </div>

                {/* CUSTO FOB */}
                <div>
                  <Label>Custo FOB (USD)</Label>
                  <Input type="number" step="0.01" value={form.cost_fob_usd || ""} onChange={f("cost_fob_usd")} placeholder="0.00" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Preço de compra do produto no fornecedor, em dólares</p>
                </div>

                {/* ALÍQUOTAS */}
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground mb-2">Alíquotas de Impostos</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div>
                      <Label>II (%)</Label>
                      <Input type="number" step="0.01" value={form.ii_rate || ""} onChange={f("ii_rate")} placeholder="0" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Imposto de Importação</p>
                    </div>
                    <div>
                      <Label>IPI (%)</Label>
                      <Input type="number" step="0.01" value={form.ipi_rate || ""} onChange={f("ipi_rate")} placeholder="0" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Imposto sobre Produtos Industrializados</p>
                    </div>
                    <div>
                      <Label>PIS (%)</Label>
                      <Input type="number" step="0.01" value={form.pis_rate ?? 2.1} onChange={f("pis_rate")} placeholder="2.10" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">PIS sobre importação</p>
                    </div>
                    <div>
                      <Label>COFINS (%)</Label>
                      <Input type="number" step="0.01" value={form.cofins_rate ?? 9.65} onChange={f("cofins_rate")} placeholder="9.65" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">COFINS sobre importação</p>
                    </div>
                    <div>
                      <Label>ICMS (%)</Label>
                      <Input type="number" step="0.01" value={form.icms_rate || ""} onChange={f("icms_rate")} placeholder="0" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">ICMS de destino da mercadoria</p>
                    </div>
                  </div>
                </div>

                {/* BENEFÍCIOS FISCAIS */}
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground mb-2">Benefícios Fiscais</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setForm(prev => ({ ...prev, beneficio_5291: !prev.beneficio_5291 }))}
                        className={`px-2 py-1 rounded text-xs font-medium ${form.beneficio_5291 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {form.beneficio_5291 ? "Ativo" : "Inativo"}
                      </button>
                      <div>
                        <Label className="cursor-pointer" onClick={() => setForm(prev => ({ ...prev, beneficio_5291: !prev.beneficio_5291 }))}>Benefício 5.2.91</Label>
                        <p className="text-[10px] text-muted-foreground">Reduz a base de cálculo do ICMS na importação</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setForm(prev => ({ ...prev, ex_tarifario: !prev.ex_tarifario }))}
                        className={`px-2 py-1 rounded text-xs font-medium ${form.ex_tarifario ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {form.ex_tarifario ? "Ativo" : "Inativo"}
                      </button>
                      <div>
                        <Label className="cursor-pointer" onClick={() => setForm(prev => ({ ...prev, ex_tarifario: !prev.ex_tarifario }))}>Ex-Tarifário</Label>
                        <p className="text-[10px] text-muted-foreground">Isenção de II para bens sem similar nacional</p>
                      </div>
                    </div>
                  </div>
                  {form.ex_tarifario && (
                    <div className="mt-2">
                      <Label>Validade do Ex-Tarifário</Label>
                      <Input type="date" value={form.ex_tarifario_validade || ""} onChange={f("ex_tarifario_validade")} />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Data de vencimento do benefício</p>
                    </div>
                  )}
                </div>

                {/* IPI RECUPERÁVEL */}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setForm(prev => ({ ...prev, ipi_recuperavel: !prev.ipi_recuperavel }))}
                    className={`px-2 py-1 rounded text-xs font-medium ${form.ipi_recuperavel ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {form.ipi_recuperavel ? "Sim" : "Não"}
                  </button>
                  <div>
                    <Label className="cursor-pointer" onClick={() => setForm(prev => ({ ...prev, ipi_recuperavel: !prev.ipi_recuperavel }))}>IPI Recuperável</Label>
                    <p className="text-[10px] text-muted-foreground">Indica se o IPI pode ser recuperado como crédito</p>
                  </div>
                </div>

                {/* COMISSÃO DO VENDEDOR */}
                <div className="mt-3">
                  <Label>Comissão do Vendedor (%)</Label>
                  <Input type="number" step="0.1" value={form.seller_commission_percent || ""} onChange={f("seller_commission_percent")} placeholder="0" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Percentual sobre o preço à vista líquido de impostos — vazio usa o padrão da Configuração Tributária</p>
                </div>

                {/* DIMENSÕES E PESO */}
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground mb-2">Dimensões e Peso da Embalagem</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <Label>Comprimento (cm)</Label>
                      <Input type="number" step="0.1" value={form.length_cm || ""} onChange={f("length_cm")} placeholder="0" />
                    </div>
                    <div>
                      <Label>Largura (cm)</Label>
                      <Input type="number" step="0.1" value={form.width_cm || ""} onChange={f("width_cm")} placeholder="0" />
                    </div>
                    <div>
                      <Label>Altura (cm)</Label>
                      <Input type="number" step="0.1" value={form.height_cm || ""} onChange={f("height_cm")} placeholder="0" />
                    </div>
                    <div>
                      <Label>Peso Bruto (KG)</Label>
                      <Input type="number" step="0.001" value={form.weight_kg || ""} onChange={f("weight_kg")} placeholder="0" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setForm(prev => ({ ...prev, empilhavel: !prev.empilhavel }))}
                        className={`px-2 py-1 rounded text-xs font-medium ${form.empilhavel ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {form.empilhavel ? "Sim" : "Não"}
                      </button>
                      <Label className="cursor-pointer" onClick={() => setForm(prev => ({ ...prev, empilhavel: !prev.empilhavel }))}>Empilhável</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setForm(prev => ({ ...prev, pode_deitar: !prev.pode_deitar }))}
                        className={`px-2 py-1 rounded text-xs font-medium ${form.pode_deitar ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {form.pode_deitar ? "Sim" : "Não"}
                      </button>
                      <Label className="cursor-pointer" onClick={() => setForm(prev => ({ ...prev, pode_deitar: !prev.pode_deitar }))}>Pode Deitar</Label>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Dimensões da caixa/embalagem usadas no cálculo de cubagem do container</p>
                </div>
              </div>
            )}
          </div>

          {/* PREÇOS POR CANAL */}
          {editing?.id && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Preços por Canal</p>
              <ProductPricingSection productId={editing.id} costLandedBrl={form.cost_landed_brl} />
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.sku}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}