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
import { usePermissoes } from "@/hooks/usePermissoes";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ---- Histórico de custo (product_cost_history) --------------------------------
// Ordena do mais recente ao mais antigo: data desc, desempate por created_date
// (prévia e fechamento real da mesma importação podem cair no mesmo dia).
const ordenarHistorico = (regs) => [...(regs || [])].sort((a, b) =>
  String(b.data || "").localeCompare(String(a.data || "")) ||
  String(b.created_date || "").localeCompare(String(a.created_date || ""))
);
const fmtDataBR = (d) => {
  if (!d) return "—";
  const [y, m, dd] = String(d).slice(0, 10).split("-");
  return y && m && dd ? `${dd}/${m}/${y}` : d;
};
const fmtPct = (v) => `${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
// Variação % de `atual` em relação a `anterior` (null se não dá pra comparar)
const variacaoPct = (atual, anterior) => {
  const a = parseFloat(atual), b = parseFloat(anterior);
  if (!isFinite(a) || !isFinite(b) || b === 0) return null;
  return ((a - b) / b) * 100;
};
const rotuloOrigem = (h) => h?.origem === "importacao" ? (h.referencia || "importação") : (h?.referencia === "cadastro" ? "custo manual" : (h?.referencia || "manual"));
const rotuloAnterior = (h) => h?.origem === "importacao" ? "importação anterior" : "custo manual anterior";

// Setinha + % colorida: verde se caiu, vermelho se subiu, cinza se igual
function Variacao({ pct, sufixo = "", className = "" }) {
  if (pct == null) return null;
  if (Math.abs(pct) < 0.05) return <span className={`text-muted-foreground ${className}`}>= sem variação{sufixo}</span>;
  const subiu = pct > 0;
  return (
    <span className={`${subiu ? "text-destructive" : "text-emerald-600"} ${className}`}>
      {subiu ? "▲" : "▼"} {fmtPct(pct)}{sufixo}
    </span>
  );
}

export default function Products() {
  // Custo e margem só aparecem para quem tem o módulo "custos" (master,
  // administrador, contador). Perfil restrito vê o produto sem o lado financeiro.
  const { pode } = usePermissoes();
  const verCustos = pode("custos");
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
  // Histórico de custo: mapa product_id -> registros (mais recente primeiro),
  // carregado de uma vez para a tabela. Só ele pode falhar em silêncio.
  const [costHistoryMap, setCostHistoryMap] = useState({});
  const [editHistory, setEditHistory] = useState([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistoryErro, setEditHistoryErro] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => { loadData(); }, []);
  // verCustos começa false enquanto a permissão carrega — recarrega quando liberar
  useEffect(() => { if (verCustos) loadCostHistoryMap(); }, [verCustos]);

  const loadCostHistoryMap = async () => {
    if (!verCustos) return;
    try {
      const regs = await base44.entities.ProductCostHistory.list("-data", 2000);
      const mapa = {};
      (regs || []).forEach(h => { (mapa[h.product_id] = mapa[h.product_id] || []).push(h); });
      Object.keys(mapa).forEach(k => { mapa[k] = ordenarHistorico(mapa[k]); });
      setCostHistoryMap(mapa);
    } catch (err) {
      console.error("Histórico de custo não carregado (tabela segue sem a variação):", err);
      setCostHistoryMap({});
    }
  };

  const loadData = async () => {
    const [prods, cats, chans, allPricings] = await Promise.all([
      base44.entities.Product.list("-created_date", 1000),
      base44.entities.Categoria.list("-created_date", 200),
      base44.entities.SalesChannel.list("-created_date", 50),
      base44.entities.ProductPricing.list("-created_date", 1000),
    ]);
    loadCostHistoryMap(); // fora do Promise.all: erro aqui não pode travar a tela
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

  // 16/09/2026 (pergunta da Larissa): o SKU nasce sequencial sozinho — maior RB-NNN
  // do cadastro + 1. Continua editável, para quem quiser outro código.
  const proximoSku = () => {
    let max = 0;
    for (const p of products) { const m = /^RB-(\d+)$/i.exec((p.sku || "").trim()); if (m) max = Math.max(max, parseInt(m[1], 10)); }
    return `RB-${String(max + 1).padStart(3, "0")}`;
  };

  const openNew = () => {
    setEditing(null);
    setForm({ sku: proximoSku(), status: "active", unit: "UN", pis_rate: 2.1, cofins_rate: 9.65, origin_country: "China", empilhavel: true, pode_deitar: false, beneficio_5291: false, ex_tarifario: false, ipi_recuperavel: true });
    setShowTech(false);
    setDialogOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({ ...product });
    setShowTech(false);
    setDialogOpen(true);
  };

  // Histórico do produto em edição — carrega quando o diálogo abre
  useEffect(() => {
    if (!dialogOpen || !editing?.id || !verCustos) { setEditHistory([]); setEditHistoryErro(false); setShowAllHistory(false); return; }
    let ativo = true;
    setEditHistoryLoading(true);
    setEditHistoryErro(false);
    setShowAllHistory(false);
    base44.entities.ProductCostHistory.filter({ product_id: editing.id }, "-data", 100)
      .then(regs => { if (ativo) setEditHistory(ordenarHistorico(regs)); })
      .catch(err => { console.error("Histórico de custo do produto não carregado:", err); if (ativo) { setEditHistory([]); setEditHistoryErro(true); } })
      .finally(() => { if (ativo) setEditHistoryLoading(false); });
    return () => { ativo = false; };
  }, [dialogOpen, editing?.id, verCustos]);

  // Registro manual no histórico quando o custo manual muda no cadastro
  // (só sem custo de importação — com cost_landed_brl quem manda é a importação).
  const registrarCustoManual = async (productId, custoNovo, custoAnterior) => {
    const novo = Math.round((parseFloat(custoNovo) || 0) * 100) / 100;
    const antes = Math.round((parseFloat(custoAnterior) || 0) * 100) / 100;
    if (novo <= 0 || Math.abs(novo - antes) < 0.01) return;
    try {
      await base44.entities.ProductCostHistory.create({
        product_id: productId,
        custo: novo,
        origem: "manual",
        referencia: "cadastro",
        data: new Date().toISOString().slice(0, 10),
      });
    } catch (err) {
      console.error("Histórico de custo manual não gravado (produto foi salvo normalmente):", err);
    }
  };

  const [savingProduct, setSavingProduct] = useState(false);
  const handleSave = async () => {
    if (savingProduct) return; // duplo clique = SKU duplicado (agora também travado por índice único no banco)
    setSavingProduct(true);
    try {
      const data = { ...form };
      // Estoque nunca é salvo pelo cadastro — só por movimentação (Kardex)
      if (editing) delete data.stock_quantity;
      // Caixa extra sem as 3 dimensões não entra: sumiria da cubagem em silêncio
      // e subfaturaria o rateio de frete por m³.
      if (Array.isArray(data.volumes_extras)) {
        const incompletos = data.volumes_extras.filter(v => (parseFloat(v.c_cm) || 0) <= 0 || (parseFloat(v.l_cm) || 0) <= 0 || (parseFloat(v.a_cm) || 0) <= 0).length;
        data.volumes_extras = data.volumes_extras.filter(v => (parseFloat(v.c_cm) || 0) > 0 && (parseFloat(v.l_cm) || 0) > 0 && (parseFloat(v.a_cm) || 0) > 0);
        if (incompletos > 0 && !confirm(`${incompletos} caixa(s) extra(s) sem as 3 medidas (C×L×A) serão DESCARTADAS. Continuar?`)) return;
      }
      if (editing) {
        await base44.entities.Product.update(editing.id, data);
        if (verCustos && !data.cost_landed_brl) await registrarCustoManual(editing.id, data.custo_manual_brl, editing.custo_manual_brl);
      } else {
        const criado = await base44.entities.Product.create({ ...data, stock_quantity: 0 });
        if (verCustos && criado?.id && !data.cost_landed_brl) await registrarCustoManual(criado.id, data.custo_manual_brl, 0);
      }
      setDialogOpen(false);
      loadData();
    } catch (err) {
      alert(`Não foi possível salvar o produto: ${err.message}`);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDelete = async (id) => {
    const p = products.find(x => x.id === id);
    // Produto com saldo não se exclui: o estoque se movimenta primeiro (Kardex)
    if ((p?.stock_quantity || 0) > 0) {
      alert(`"${p.name}" tem ${p.stock_quantity} unidade(s) em estoque.\n\nMovimente o estoque primeiro (venda, avaria, uso interno ou ajuste de inventário) — excluir um produto com saldo quebraria o Kardex.`);
      return;
    }
    try {
      // Com histórico no Kardex, inativar preserva a auditoria; excluir apagaria a referência
      const movs = await base44.entities.StockMovement.filter({ product_id: id }, "-created_date", 1);
      if ((movs || []).length > 0) {
        if (!confirm(`"${p?.name}" tem histórico de movimentações no Kardex.\n\nRecomendado: INATIVAR em vez de excluir (preserva a auditoria).\n\nOK = inativar o produto · Cancelar = não fazer nada`)) return;
        await base44.entities.Product.update(id, { status: "inactive" });
      } else {
        if (!confirm("Deseja realmente excluir este produto?")) return;
        await base44.entities.Product.delete(id);
      }
    } catch (err) {
      alert(`Não foi possível excluir o produto: ${err.message}`);
    }
    loadData();
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, image_url: file_url }));
    } catch (err) {
      alert(`Não foi possível enviar a imagem: ${err.message}`);
    }
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
                    {verCustos && <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Custo Landed</th>}
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
                      {verCustos && (() => {
                        const hist = costHistoryMap[product.id] || [];
                        const pct = hist.length >= 2 ? variacaoPct(hist[0].custo, hist[1].custo) : null;
                        return (
                          <td className="px-4 py-3 text-right hidden lg:table-cell">
                            <div>{formatCurrency(product.cost_landed_brl)}</div>
                            {pct != null && (
                              <Variacao pct={pct} sufixo={` vs ${rotuloAnterior(hist[1])}`} className="text-[10px] whitespace-nowrap" />
                            )}
                          </td>
                        );
                      })()}
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(vdPriceMap[product.id])}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={product.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {verCustos && <Link to={`/precificacao?produto=${product.id}`} className="p-1.5 hover:bg-muted rounded-lg transition-colors" title="Precificar">
                            <Calculator className="w-3.5 h-3.5 text-primary" />
                          </Link>}
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
                <Input value={form.sku || ""} onChange={f("sku")} placeholder="RB-001" />
                {!editing && <p className="text-[10px] text-muted-foreground mt-0.5">Sugerido em sequência ao último cadastro. Pode trocar.</p>}
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
                <Label>Lead Time de Reposição (dias)</Label>
                <Input type="number" value={form.lead_time_dias || ""} onChange={f("lead_time_dias")} placeholder="Ex: 90 (importado)" />
                <p className="text-[10px] text-muted-foreground mt-1">Quanto tempo demora pra repor. Máquina importada: ~90-120 dias.</p>
              </div>
              <div>
                <Label>Garantia (meses)</Label>
                <Input type="number" min="0" value={form.garantia_meses ?? ""} onChange={f("garantia_meses")} placeholder="Ex: 12" />
                <p className="text-[10px] text-muted-foreground mt-1">Tempo de garantia dado ao cliente na venda deste produto.</p>
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

            {/* COMPATIBILIDADE peça/insumo ↔ máquina */}
            {["Peças de Reposição", "Insumos"].includes(form.category_name) && (
              <div className="mt-3 border border-border rounded-lg p-3 bg-muted/20">
                <Label className="mb-1 block">Compatível com quais máquinas?</Label>
                <p className="text-[10px] text-muted-foreground mb-2">É isso que responde "qual peça serve na WF-802?" em segundos — marque todas que se aplicam.</p>
                <div className="flex flex-wrap gap-2">
                  {products.filter(p => ["Coladeira de Borda", "Coletor de Pó"].includes(p.category_name) && p.id !== form.id).map(m => {
                    const sel = (form.compativel_com || []).includes(m.id);
                    return (
                      <button key={m.id} type="button"
                        onClick={() => setForm(prev => ({ ...prev, compativel_com: sel ? (prev.compativel_com || []).filter(x => x !== m.id) : [ ...(prev.compativel_com || []), m.id ] }))}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${sel ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/50"}`}>
                        {m.model || m.name}
                      </button>
                    );
                  })}
                  {products.filter(p => ["Coladeira de Borda", "Coletor de Pó"].includes(p.category_name)).length === 0 && (
                    <p className="text-xs text-muted-foreground">Cadastre primeiro as máquinas (Coladeiras / Coletores) para vinculá-las aqui.</p>
                  )}
                </div>
              </div>
            )}

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
            {verCustos && <div className="mt-3">
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

              {/* HISTÓRICO DE CUSTO — evolução a cada importação / ajuste manual */}
              {editing?.id && (() => {
                const visiveis = showAllHistory ? editHistory : editHistory.slice(0, 12);
                const serie = [...editHistory].reverse().map((h, i) => ({ i, data: fmtDataBR(h.data), custo: parseFloat(h.custo) || 0, ref: rotuloOrigem(h) }));
                return (
                  <div className="mt-3 border border-border rounded-lg p-3 bg-muted/20">
                    <div className="flex items-center justify-between mb-1">
                      <Label className="font-semibold">Histórico de custo</Label>
                      {editHistory.length > 0 && <span className="text-[10px] text-muted-foreground">{editHistory.length} registro(s)</span>}
                    </div>
                    {editHistoryLoading ? (
                      <p className="text-xs text-muted-foreground">Carregando histórico...</p>
                    ) : editHistory.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{editHistoryErro ? "Sem histórico (não foi possível consultar agora)." : "Sem histórico — o primeiro registro entra na próxima importação finalizada ou ao alterar o custo manual."}</p>
                    ) : (
                      <>
                        {serie.length >= 2 && (
                          <div className="h-28 mb-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={serie} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                                <XAxis dataKey="data" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                <YAxis tick={{ fontSize: 10 }} width={64} domain={["auto", "auto"]} tickFormatter={(v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} />
                                <Tooltip formatter={(v) => [formatCurrency(v), "Custo"]} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.ref || ""}`} />
                                <Line type="monotone" dataKey="custo" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                        <div className="divide-y divide-border">
                          {visiveis.map((h, idx) => {
                            const anterior = editHistory[idx + 1];
                            const pct = anterior ? variacaoPct(h.custo, anterior.custo) : null;
                            return (
                              <div key={h.id} className="flex items-center gap-2 py-1 text-xs">
                                <span className="font-mono text-muted-foreground w-20 flex-shrink-0">{fmtDataBR(h.data)}</span>
                                <span className="font-medium w-24 flex-shrink-0 text-right">{formatCurrency(parseFloat(h.custo))}</span>
                                <span className="text-muted-foreground truncate flex-1" title={rotuloOrigem(h)}>{h.origem === "importacao" ? "Importação" : "Manual"} · {rotuloOrigem(h)}</span>
                                <span className="w-20 flex-shrink-0 text-right">
                                  {pct != null ? <Variacao pct={pct} /> : <span className="text-muted-foreground">—</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {editHistory.length > 12 && (
                          <button type="button" onClick={() => setShowAllHistory(v => !v)} className="text-xs text-primary hover:underline mt-2">
                            {showAllHistory ? "Mostrar só os 12 mais recentes" : `Ver todos (${editHistory.length})`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>}
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
                {verCustos && <div>
                  <Label>Custo FOB (USD)</Label>
                  <Input type="number" step="0.01" value={form.cost_fob_usd || ""} onChange={f("cost_fob_usd")} placeholder="0.00" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Preço de compra do produto no fornecedor, em dólares</p>
                </div>}

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

                {/* COMISSÃO DO REPRESENTANTE COMERCIAL */}
                <div className="mt-3">
                  <Label>Comissão do Representante (%)</Label>
                  <Input type="number" step="0.1" value={form.seller_commission_percent || ""} onChange={f("seller_commission_percent")} placeholder="0" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Só para produtos com representante comercial. Quando preenchida (&gt; 0), SUBSTITUI a comissão padrão do vendedor (Config. Tributária) — o vendedor fica sem comissão neste produto. Vazio/zero = vale a comissão padrão do vendedor.</p>
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

                  {/* MULTI-VOLUME: produto que embarca em mais de uma caixa por unidade.
                      As medidas acima são o VOLUME 1; aqui entram as caixas 2, 3... */}
                  <div className="mt-3 border border-dashed border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <Label className="font-semibold">Volumes adicionais (produto em mais de uma caixa)</Label>
                      <Button type="button" variant="outline" size="sm" onClick={() => setForm(prev => ({ ...prev, volumes_extras: [ ...(prev.volumes_extras || []), { c_cm: "", l_cm: "", a_cm: "", peso_kg: "" } ] }))}>+ Adicionar caixa</Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-2">As medidas acima são a CAIXA 1. Se a unidade viaja em mais caixas (ex.: máquina + cavalete), adicione cada caixa extra — a cubagem e o frete calculam todas.</p>
                    {(form.volumes_extras || []).map((v, vi) => (
                      <div key={vi} className="grid grid-cols-5 gap-2 items-end mb-2">
                        <div><Label className="text-xs">Caixa {vi + 2} — C (cm)</Label><Input type="number" step="0.1" value={v.c_cm} onChange={e => setForm(prev => ({ ...prev, volumes_extras: prev.volumes_extras.map((x, xi) => xi === vi ? { ...x, c_cm: e.target.value } : x) }))} /></div>
                        <div><Label className="text-xs">L (cm)</Label><Input type="number" step="0.1" value={v.l_cm} onChange={e => setForm(prev => ({ ...prev, volumes_extras: prev.volumes_extras.map((x, xi) => xi === vi ? { ...x, l_cm: e.target.value } : x) }))} /></div>
                        <div><Label className="text-xs">A (cm)</Label><Input type="number" step="0.1" value={v.a_cm} onChange={e => setForm(prev => ({ ...prev, volumes_extras: prev.volumes_extras.map((x, xi) => xi === vi ? { ...x, a_cm: e.target.value } : x) }))} /></div>
                        <div><Label className="text-xs">Peso (kg)</Label><Input type="number" step="0.1" value={v.peso_kg} onChange={e => setForm(prev => ({ ...prev, volumes_extras: prev.volumes_extras.map((x, xi) => xi === vi ? { ...x, peso_kg: e.target.value } : x) }))} /></div>
                        <button type="button" className="h-9 px-2 text-destructive hover:bg-destructive/10 rounded text-sm" onClick={() => setForm(prev => ({ ...prev, volumes_extras: prev.volumes_extras.filter((_, xi) => xi !== vi) }))}>Remover</button>
                      </div>
                    ))}
                    {!(form.volumes_extras || []).length && <p className="text-[10px] text-muted-foreground">Nenhuma caixa extra — este produto viaja em 1 volume.</p>}
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
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setForm(prev => ({ ...prev, embalagem_consolidada: !prev.embalagem_consolidada }))}
                        className={`px-2 py-1 rounded text-xs font-medium ${form.embalagem_consolidada ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {form.embalagem_consolidada ? "Sim" : "Não"}
                      </button>
                      <Label className="cursor-pointer" onClick={() => setForm(prev => ({ ...prev, embalagem_consolidada: !prev.embalagem_consolidada }))}>Peça consolidada</Label>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Dimensões da caixa/embalagem usadas no cálculo de cubagem do container. "Peça consolidada" = peça de reposição que embarca junto com as outras numa caixa única (as dimensões individuais dela são ignoradas na cubagem e no frete — quem conta é a caixa de peças definida na operação de importação).</p>
                </div>
              </div>
            )}
          </div>

          {/* PREÇOS POR CANAL */}
          {editing?.id && verCustos && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Preços por Canal</p>
              <ProductPricingSection productId={editing.id} costLandedBrl={form.cost_landed_brl} />
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.sku || savingProduct}>{savingProduct ? "Salvando..." : "Salvar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}