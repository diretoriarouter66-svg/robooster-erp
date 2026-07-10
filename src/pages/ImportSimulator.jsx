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
import { entradaImportacao, operacaoJaDeuEntrada } from "@/lib/stockService";

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

  // ==== Remessas de pagamento: câmbio médio ponderado ====
  const calcCambioMedio = (remessas) => {
    const rs = (remessas || []).filter(r => (parseFloat(r.valor_usd) || 0) > 0 && (parseFloat(r.cotacao) || 0) > 0);
    if (!rs.length) return null;
    const totalUsd = rs.reduce((s, r) => s + parseFloat(r.valor_usd), 0);
    const totalBrl = rs.reduce((s, r) => s + parseFloat(r.valor_usd) * parseFloat(r.cotacao) + (parseFloat(r.taxas_brl) || 0), 0);
    return totalUsd > 0 ? totalBrl / totalUsd : null;
  };
  const cambioMedio = calcCambioMedio(form.remessas);
  const cambioEfetivo = cambioMedio ?? (form.cambio || config?.cambio_usd || 5.3);

  // Quitação do fornecedor: as remessas devem cobrir o valor da compra (FOB do mix)
  const fobCompraUsd = (form.itens || []).reduce((t, item) => {
    const prod = products.find(pr => pr.id === item.product_id);
    return t + (prod?.cost_fob_usd || 0) * (item.qty || item.quantidade || item.quantity || 0);
  }, 0);
  const totalEnviadoUsd = (form.remessas || []).reduce((t, r) => t + (parseFloat(r.valor_usd) || 0), 0);
  const saldoQuitarUsd = Math.round((fobCompraUsd - totalEnviadoUsd) * 100) / 100;
  const fmtUsd = (v) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const addRemessa = () => setForm(prev => ({ ...prev, remessas: [...(prev.remessas || []), { data: new Date().toISOString().slice(0, 10), valor_usd: "", cotacao: "", taxas_brl: "" }] }));
  const updRemessa = (i, campo, val) => setForm(prev => ({ ...prev, remessas: prev.remessas.map((r, idx) => idx === i ? { ...r, [campo]: val } : r) }));
  const delRemessa = (i) => setForm(prev => ({ ...prev, remessas: prev.remessas.filter((_, idx) => idx !== i) }));

  // ==== Remessas → Financeiro: cada envio vira uma conta paga (saída de caixa real) ====
  const sincronizarRemessasFinanceiro = async (opId, opNome, remessas) => {
    if (!opId) return;
    const antigas = await base44.entities.FinancialEntry.filter({ reference_id: opId, reference_type: "import_remessa" }, "-created_date", 100).catch(() => []);
    for (const e of antigas || []) {
      await base44.entities.FinancialEntry.delete(e.id).catch(() => {});
    }
    const rs = (remessas || []).filter(r => (parseFloat(r.valor_usd) || 0) > 0 && (parseFloat(r.cotacao) || 0) > 0);
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      const valorBrl = Math.round((parseFloat(r.valor_usd) * parseFloat(r.cotacao) + (parseFloat(r.taxas_brl) || 0)) * 100) / 100;
      await base44.entities.FinancialEntry.create({
        type: "payable",
        category: "import",
        description: `Remessa ${i + 1}/${rs.length} — ${opNome || "Importação"} (US$ ${parseFloat(r.valor_usd).toLocaleString("pt-BR")} @ ${parseFloat(r.cotacao).toFixed(4)})`,
        reference_id: opId,
        reference_type: "import_remessa",
        amount: valorBrl,
        due_date: r.data || new Date().toISOString().slice(0, 10),
        payment_date: r.data || new Date().toISOString().slice(0, 10),
        status: "paid",
        payment_method: "transfer",
      });
    }
  };

  // ==== Finalizar Importação: recalcula, mostra conferência e executa tudo ====
  const [finalizarOpen, setFinalizarOpen] = useState(false);
  const [resumoFinal, setResumoFinal] = useState(null);
  const [finalizando, setFinalizando] = useState(false);

  const abrirFinalizacao = () => {
    const engineItems = buildEngineItems();
    if (!engineItems.length) { alert("A operação não tem produtos."); return; }
    const configMotor = configParaMotor(config);
    const operacaoEngine = { cambio: cambioEfetivo, frete_internacional_usd: form.frete_internacional_usd || 0, despesas_locais_usd: form.despesas_locais_usd || 0, seguro_usd: form.seguro_usd || 0 };
    const result = calcularOperacaoImportacao(engineItems, operacaoEngine, configMotor, form.data || "2026-01-01", (form.pct_declarado ?? 100) / 100);
    const container = CONTAINERS_PADRAO.find(c => c.nome === form.container_tipo) || CONTAINERS_PADRAO[2];
    const cubage = calcularCubagem(engineItems, container);
    setImportResult(result);
    setCubageResult(cubage);
    setResumoFinal(result);
    setFinalizarOpen(true);
  };

  const confirmarFinalizacao = async () => {
    if (!resumoFinal?.resultados || !editing?.id) return;
    setFinalizando(true);
    try {
      // 1) Custo landed em cada produto
      await base44.entities.Product.bulkUpdate(
        resumoFinal.resultados.filter(r => r.produto?.id).map(r => ({ id: r.produto.id, cost_landed_brl: r.custo_unitario_formacao }))
      );
      // 2) Entrada no estoque via Kardex (guardada pelo próprio Kardex)
      const jaEntrou = await operacaoJaDeuEntrada(editing.id);
      if (!jaEntrou) await entradaImportacao(resumoFinal.resultados, editing.id, form.nome);
      // 3) Grava a operação como Realizada com os resultados finais
      await base44.entities.ImportOperation.update(editing.id, {
        ...form,
        status: "realizada",
        cambio: cambioEfetivo,
        resultado_importacao: resumoFinal,
        resultado_cubagem: cubageResult,
      });
      await sincronizarRemessasFinanceiro(editing.id, form.nome, form.remessas).catch(() => {});
      setFinalizarOpen(false);
      setView("list");
      loadData();
    } catch (err) {
      alert(`Erro ao finalizar: ${err.message}`);
    }
    setFinalizando(false);
  };

  const handleCalculate = () => {
    const engineItems = buildEngineItems();
    if (!engineItems.length) return;

    const configMotor = configParaMotor(config);
    const operacaoEngine = {
      cambio: cambioEfetivo,
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
      cambio: cambioEfetivo
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
      // 2) Dá entrada das quantidades no estoque via Kardex (o próprio Kardex garante que é uma única vez)
      const jaEntrou = await operacaoJaDeuEntrada(editing?.id);
      if (!jaEntrou) {
        try {
          await entradaImportacao(importResult.resultados, editing?.id, form.nome);
        } catch (err) {
          alert(`Custo atualizado, mas houve erro na entrada de estoque: ${err.message}`);
        }
      }
    }

    let opId = editing?.id;
    if (editing) {
      await base44.entities.ImportOperation.update(editing.id, data);
    } else {
      const created = await base44.entities.ImportOperation.create(data);
      opId = created.id;
    }

    // Remessas viram contas pagas no Financeiro (fluxo de caixa real da importação)
    await sincronizarRemessasFinanceiro(opId, form.nome, form.remessas).catch(() => {});

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
              <div>
                <Label>Câmbio USD (R$)</Label>
                {cambioMedio != null ? (
                  <>
                    <Input type="number" value={cambioMedio.toFixed(4)} readOnly disabled className="bg-muted" />
                    <p className="text-[10px] text-primary mt-1 font-medium">Câmbio médio ponderado de {(form.remessas || []).filter(r => parseFloat(r.valor_usd) > 0).length} remessa(s)</p>
                  </>
                ) : (
                  <Input type="number" step="0.01" value={form.cambio ?? ""} onChange={f("cambio")} />
                )}
              </div>
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

          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-heading font-semibold text-sm">Remessas de Pagamento</h3>
              <Button size="sm" variant="outline" onClick={addRemessa}><Plus className="w-3.5 h-3.5 mr-1" /> Remessa</Button>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">Lance cada envio ao fornecedor. O câmbio da operação vira a média ponderada automaticamente.</p>
            {(form.remessas || []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">Nenhuma remessa lançada — o câmbio manual acima será usado.</p>
            ) : (
              <div className="space-y-2">
                {(form.remessas || []).map((r, i) => (
                  <div key={i} className="rounded-lg border border-border p-3 relative">
                    <button onClick={() => delRemessa(i)} className="absolute top-2 right-2 p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-4 h-4 text-destructive" /></button>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-8">
                      <div><Label className="text-xs">Data do envio</Label><Input type="date" value={r.data || ""} onChange={e => updRemessa(i, "data", e.target.value)} /></div>
                      <div><Label className="text-xs">Valor enviado (USD)</Label><Input type="number" step="0.01" value={r.valor_usd} onChange={e => updRemessa(i, "valor_usd", e.target.value)} placeholder="10.000,00" /></div>
                      <div><Label className="text-xs">Cotação do dólar (R$)</Label><Input type="number" step="0.0001" value={r.cotacao} onChange={e => updRemessa(i, "cotacao", e.target.value)} placeholder="5,2000" /></div>
                      <div><Label className="text-xs">Taxas bancárias (R$)</Label><Input type="number" step="0.01" value={r.taxas_brl} onChange={e => updRemessa(i, "taxas_brl", e.target.value)} placeholder="0,00" /></div>
                    </div>
                  </div>
                ))}
                {cambioMedio != null && (
                  <div className="flex justify-between items-center px-3 py-2 bg-primary/5 rounded-lg text-sm mt-1">
                    <span className="text-muted-foreground text-xs">Total enviado: US$ {fmtUsd(totalEnviadoUsd)}</span>
                    <span className="font-bold text-primary">Câmbio médio: R$ {cambioMedio.toFixed(4)}</span>
                  </div>
                )}
              </div>
            )}
            {fobCompraUsd > 0 && (
              <div className={`mt-3 rounded-lg p-3 border ${saldoQuitarUsd > 0 ? "bg-warning/10 border-warning/30" : "bg-success/10 border-success/30"}`}>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Valor da compra (FOB do mix)</span><span className="font-semibold">US$ {fmtUsd(fobCompraUsd)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total enviado ao fornecedor</span><span className="font-semibold">US$ {fmtUsd(totalEnviadoUsd)}</span></div>
                <div className="flex justify-between text-sm border-t border-border mt-1.5 pt-1.5">
                  <span className="font-medium">{saldoQuitarUsd > 0 ? "Falta enviar" : saldoQuitarUsd < 0 ? "Enviado a mais" : "Fornecedor quitado"}</span>
                  <span className={`font-bold ${saldoQuitarUsd > 0 ? "text-warning" : "text-success"}`}>{saldoQuitarUsd === 0 ? "✓" : `US$ ${fmtUsd(Math.abs(saldoQuitarUsd))}`}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" variant="outline" onClick={handleCalculate} disabled={!form.itens?.length}>
              <Calculator className="w-4 h-4 mr-1" /> Calcular
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving || !form.nome}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar
            </Button>
          </div>
          {editing && form.status !== "realizada" && (
            <Button className="w-full bg-success hover:bg-success/90 text-white" onClick={abrirFinalizacao} disabled={!importResult?.resultados}>
              Finalizar Importação
            </Button>
          )}
          {form.status === "realizada" && (
            <p className="text-xs text-success text-center font-medium">Importação realizada — custos e estoque já lançados no sistema.</p>
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

      {finalizarOpen && resumoFinal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !finalizando && setFinalizarOpen(false)}>
          <div className="bg-card rounded-xl border border-border max-w-lg w-full max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-heading font-bold text-lg mb-1">Finalizar Importação</h3>
            <p className="text-xs text-muted-foreground mb-4">Confira antes de confirmar — esta ação grava o custo nos produtos, dá entrada no estoque e marca a operação como Realizada.</p>

            {saldoQuitarUsd > 0 && (
              <div className="px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg text-xs text-warning font-medium mb-3">
                Atenção: ainda faltam US$ {fmtUsd(saldoQuitarUsd)} de remessas para quitar o fornecedor (compra de US$ {fmtUsd(fobCompraUsd)}, enviado US$ {fmtUsd(totalEnviadoUsd)}). Você pode finalizar mesmo assim, mas o câmbio médio ficará provisório.
              </div>
            )}
            <div className="px-3 py-2 bg-primary/5 rounded-lg text-sm flex justify-between mb-3">
              <span className="text-muted-foreground">Câmbio usado</span>
              <span className="font-bold text-primary">R$ {Number(cambioEfetivo).toFixed(4)}{calcCambioMedio(form.remessas) != null ? " (média ponderada)" : " (manual)"}</span>
            </div>

            <table className="w-full text-sm mb-3">
              <thead><tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left py-1.5">Produto</th>
                <th className="text-right py-1.5">Entrada Estoque</th>
                <th className="text-right py-1.5">Custo Landed/un</th>
              </tr></thead>
              <tbody>
                {resumoFinal.resultados.map((r, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5">{r.produto.nome}</td>
                    <td className="py-1.5 text-right font-bold text-success">+{r.quantidade}</td>
                    <td className="py-1.5 text-right font-semibold">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(r.custo_unitario_formacao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-2 text-sm mb-4">
              <div className="px-3 py-2 bg-success/10 rounded-lg"><span className="block text-[10px] text-muted-foreground">Crédito ICMS gerado</span><span className="font-bold text-success">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(resumoFinal.totais?.credito_icms || 0)}</span></div>
              <div className="px-3 py-2 bg-success/10 rounded-lg"><span className="block text-[10px] text-muted-foreground">Crédito IPI gerado</span><span className="font-bold text-success">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(resumoFinal.totais?.credito_ipi || 0)}</span></div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFinalizarOpen(false)} disabled={finalizando}>Cancelar</Button>
              <Button className="bg-success hover:bg-success/90 text-white" onClick={confirmarFinalizacao} disabled={finalizando}>
                {finalizando ? "Executando..." : "Confirmar e Finalizar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}