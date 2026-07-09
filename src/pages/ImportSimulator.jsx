import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Ship, ArrowLeft, Trash2, Calculator, Save, Loader2, Package } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import ImportResults from "@/components/import/ImportResults";
import CubageResults from "@/components/import/CubageResults";
import {
  calcularOperacaoImportacao, calcularCubagem, produtoFromProduct,
  configParaMotor, CONTAINERS_PADRAO
} from "@/lib/simportEngine";
import { entradaImportacao } from "@/lib/stockService";

const STATUS_OPTIONS = [
  { value: "simulacao", label: "Simulação" },
  { value: "aprovada", label: "Aprovada" },
  { value: "em_transito", label: "Em Trânsito" },
  { value: "realizada", label: "Realizada" }
];

const fmtBRL = (v) => v != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";
const fmtUSD = (v) => v != null ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v) : "—";

export default function ImportSimulator() {
  const [operations, setOperations] = useState([]);
  const [products, setProducts] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [cubageResult, setCubageResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [ops, prods, configs] = await Promise.all([
        base44.entities.ImportOperation.list("-created_date", 100),
        base44.entities.Product.list("-created_date", 500),
        base44.entities.ConfigTributaria.list("-created_date", 5)
      ]);
      setOperations(ops || []);
      setProducts(prods || []);
      setConfig(configs?.[0] || {});
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      nome: "", data: new Date().toISOString().slice(0, 10),
      cambio: config?.cambio_usd || 5.3, container_tipo: "40' High Cube",
      frete_internacional_usd: 0, seguro_usd: 0, despesas_locais_usd: 0,
      itens: [], status: "simulacao"
    });
    setImportResult(null);
    setCubageResult(null);
    setView("editor");
  };

  const openEdit = (op) => {
    setEditing(op);
    setForm({ ...op, itens: op.itens || [] });
    setImportResult(op.resultado_importacao || null);
    setCubageResult(op.resultado_cubagem || null);
    setView("editor");
  };

  const f = (field) => (e) => {
    const val = e.target.type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value;
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const addProduct = (product) => {
    setForm(prev => ({
      ...prev,
      itens: [...(prev.itens || []), { product_id: product.id, product_name: product.name, sku: product.sku, qty: 1 }]
    }));
    setProductSearch("");
  };

  const updateItem = (i, field, val) => {
    setForm(prev => ({ ...prev, itens: prev.itens.map((it, idx) => idx === i ? { ...it, [field]: val } : it) }));
  };

  const removeItem = (i) => {
    setForm(prev => ({ ...prev, itens: prev.itens.filter((_, idx) => idx !== i) }));
  };

  const buildEngineItems = () => {
    return (form.itens || []).map(it => {
      const product = products.find(p => p.id === it.product_id);
      return { produto: produtoFromProduct(product || { id: it.product_id, name: it.product_name }), quantidade: it.qty };
    }).filter(it => it.produto && it.quantidade > 0);
  };

  const handleCalculate = () => {
    const engineItems = buildEngineItems();
    if (!engineItems.length) return;

    const configMotor = configParaMotor(config);
    const operacaoEngine = {
      cambio: form.cambio || config?.cambio_usd || 5.3,
      frete_internacional_usd: form.frete_internacional_usd || 0,
      despesas_locais_usd: form.despesas_locais_usd || 0,
      seguro_usd: form.seguro_usd || 0,
    };

    const result = calcularOperacaoImportacao(engineItems, operacaoEngine, configMotor, form.data || "2026-01-01", (form.pct_declarado ?? 100) / 100);
    setImportResult(result);

    const container = CONTAINERS_PADRAO.find(c => c.nome === form.container_tipo) || CONTAINERS_PADRAO[2];
    const cubage = calcularCubagem(engineItems, container);
    setCubageResult(cubage);
  };

  const handleSave = async () => {
    setSaving(true);
    const data = {
      ...form,
      resultado_cubagem: cubageResult,
      resultado_importacao: importResult,
      cambio: form.cambio || config?.cambio_usd
    };

    const wasRealizada = editing?.status === "realizada";
    const isRealizada = form.status === "realizada";

    if (isRealizada && !wasRealizada && importResult?.resultados) {
      // 1) Atualiza o custo landed de cada produto
      await base44.entities.Product.bulkUpdate(
        importResult.resultados
          .filter(r => r.produto?.id)
          .map(r => ({ id: r.produto.id, cost_landed_brl: r.custo_unitario_formacao }))
      );
      // 2) Dá entrada das quantidades no estoque via Kardex (uma única vez por operação)
      if (!editing?.estoque_lancado) {
        try {
          await entradaImportacao(importResult.resultados, editing?.id, form.nome);
          data.estoque_lancado = true;
        } catch (err) {
          alert(`Custo atualizado, mas houve erro na entrada de estoque: ${err.message}`);
        }
      }
    }

    if (editing) await base44.entities.ImportOperation.update(editing.id, data);
    else await base44.entities.ImportOperation.create(data);

    setSaving(false);
    setView("list");
    loadData();
  };

  const filteredProducts = products.filter(p =>
    !productSearch ||
    p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filteredOps = operations.filter(o => !search || o.nome?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (view === "list") return (
    <div>
      <PageHeader title="Simulador de Importação" description={`${operations.length} operações cadastradas`}
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nova Operação</Button>} />

      {operations.length === 0 ? (
        <EmptyState icon={Ship} title="Nenhuma operação de importação" description="Crie uma simulação para calcular custos e cubagem." actionLabel="Nova Operação" onAction={openNew} />
      ) : (
        <>
          <div className="mb-4 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar operação..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Operação</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Data</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Container</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Itens</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Custo Formação</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOps.map(op => (
                    <tr key={op.id} className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => openEdit(op)}>
                      <td className="px-4 py-3 font-medium">{op.nome || "Sem nome"}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{op.data ? new Date(op.data).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">{op.container_tipo || "—"}</td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">{op.itens?.length || 0}</td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell font-medium">{op.resultado_importacao?.totais?.custo_formacao_preco ? fmtBRL(op.resultado_importacao.totais.custo_formacao_preco) : "—"}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={op.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); openEdit(op); }}>Abrir</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={() => setView("list")}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
        <h1 className="text-xl font-heading font-bold">{editing ? "Editar Operação" : "Nova Operação"}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Dados da Operação</h3>
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={form.nome || ""} onChange={f("nome")} placeholder="Ex: Container 40HC Shenzhen Jan/26" /></div>
              <div><Label>Data</Label><Input type="date" value={form.data || ""} onChange={f("data")} /></div>
              <div><Label>Status</Label>
                <Select value={form.status || "simulacao"} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Câmbio USD (R$)</Label><Input type="number" step="0.01" value={form.cambio ?? ""} onChange={f("cambio")} /></div>
              <div><Label>Container</Label>
                <Select value={form.container_tipo || "40' High Cube"} onValueChange={v => setForm({ ...form, container_tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTAINERS_PADRAO.map(c => <SelectItem key={c.nome} value={c.nome}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Custos em USD</h3>
            <div className="space-y-3">
              <div><Label>Frete Internacional (USD)</Label><Input type="number" step="0.01" value={form.frete_internacional_usd ?? ""} onChange={f("frete_internacional_usd")} /></div>
              <div><Label>Seguro (USD)</Label><Input type="number" step="0.01" value={form.seguro_usd ?? ""} onChange={f("seguro_usd")} /></div>
              <div><Label>Despesas Locais (USD)</Label><Input type="number" step="0.01" value={form.despesas_locais_usd ?? ""} onChange={f("despesas_locais_usd")} /></div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-1">Valor Declarado na Invoice</h3>
            <p className="text-[11px] text-muted-foreground mb-3">O custo real do produto (FOB × câmbio) é mantido. Apenas a base tributária (II, IPI, PIS/COFINS imp., ICMS imp.) é calculada sobre o valor reduzido declarado.</p>
            <div className="flex items-center gap-3">
              <input type="range" min="10" max="100" step="1" value={form.pct_declarado ?? 100} onChange={e => setForm({ ...form, pct_declarado: parseInt(e.target.value, 10) })} className="flex-1 accent-primary" />
              <span className="text-lg font-bold text-primary whitespace-nowrap w-20 text-right">{form.pct_declarado ?? 100}%</span>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>10%</span><span>50%</span><span>100% (real)</span></div>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" variant="outline" onClick={handleCalculate} disabled={!form.itens?.length}>
              <Calculator className="w-4 h-4 mr-1" /> Calcular
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving || !form.nome}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar
            </Button>
          </div>
          {form.status === "realizada" && importResult?.resultados && (
            <p className="text-xs text-primary text-center">Ao salvar, o custo landed será gravado em cada produto do mix.</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Adicionar Produtos</h3>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar produto..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredProducts.slice(0, 20).map(p => (
                <button key={p.id} onClick={() => addProduct(p)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-left transition-colors">
                  <Package className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.sku} · {fmtUSD(p.cost_fob_usd)}</p>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                </button>
              ))}
              {filteredProducts.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Nenhum produto encontrado.</p>}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Mix de Produtos ({form.itens?.length || 0})</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {(form.itens || []).map((item, i) => (
                <div key={i} className="border border-border rounded-lg p-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.product_name}</p>
                      <p className="text-[10px] text-muted-foreground">{item.sku}</p>
                    </div>
                    <button onClick={() => removeItem(i)} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3 h-3 text-destructive" /></button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Input type="number" min="1" value={item.qty || ""} onChange={e => updateItem(i, "qty", parseInt(e.target.value) || 0)} className="h-7 w-20 text-sm" placeholder="Qtd" />
                  </div>
                </div>
              ))}
              {!form.itens?.length && <p className="text-xs text-muted-foreground text-center py-4">Adicione produtos ao mix.</p>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {cubageResult && <CubageResults result={cubageResult} />}
          {importResult && <ImportResults result={importResult} />}
          {!cubageResult && !importResult && (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <Calculator className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Adicione produtos e clique em <strong>Calcular</strong> para ver a cubagem e o custo de importação.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}