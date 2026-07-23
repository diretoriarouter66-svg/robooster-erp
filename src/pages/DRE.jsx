import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowLeft, Save, Loader2, Calculator, FileBarChart, Trash2, GitCompare } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import DREResults from "@/components/dre/DREResults";
import DREDistribution from "@/components/dre/DREDistribution";
import {
  montarDRE, calcularDistribuicao, sugerirMesesIrrf, configParaMotor, DESPESAS_FIXAS_PADRAO
} from "@/lib/simportEngine";

const fmtBRL = (v) => v != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";
const fmtPct = (v) => v != null ? `${(v).toFixed(2)}%` : "—";

export default function DRE() {
  const [savedDREs, setSavedDREs] = useState([]);
  const [operations, setOperations] = useState([]);
  const [socios, setSocios] = useState([]);
  const [vendaDiretaPrices, setVendaDiretaPrices] = useState({});
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [compareIds, setCompareIds] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [dres, ops, socs, configs, chans, prices] = await Promise.all([
        base44.entities.DRESalvo.list("-created_date", 100),
        base44.entities.ImportOperation.list("-created_date", 100),
        base44.entities.Socio.list("-created_date", 50),
        base44.entities.ConfigTributaria.list("-created_date", 5),
        base44.entities.SalesChannel.list("-created_date", 50),
        base44.entities.ProductPricing.list("-created_date", 1000)
      ]);
      setSavedDREs(dres || []);
      setOperations((ops || []).filter(o => o.resultado_importacao?.resultados));
      setSocios(socs || []);
      setConfig(configs?.[0] || {});
      const vd = (chans || []).find(c => c.type === "venda_direta") || (chans || []).find(c => (c.commission_percent || 0) === 0 && (c.fixed_fee || 0) === 0);
      const priceMap = {};
      (prices || []).forEach(p => { if (vd && p.channel_id === vd.id && p.price > 0) priceMap[p.product_id] = p.price; });
      setVendaDiretaPrices(priceMap);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  };

  const buildVendas = (op) => {
    const resultados = op.resultado_importacao?.resultados || [];
    return resultados.map(r => ({
      product_id: r.produto.id,
      product_name: r.produto.nome,
      qty: r.quantidade,
      custo_unitario: r.custo_unitario_formacao,
      preco_venda: vendaDiretaPrices[r.produto.id] || 0
    }));
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      nome: "", operacao_id: "", operacao_nome: "",
      vendas: [],
      mix_geo: { pct_sp: 100, pct_sul_sudeste: 0, pct_norte_ne_co_es: 0 },
      meses_venda: 3, comissao: config?.comissao_vendedor_padrao ?? 0, saldo_credor_icms: 0,
    });
    setView("editor");
  };

  const openEdit = (dre) => {
    const op = operations.find(o => o.id === dre.operacao_id);
    const vendas = op ? buildVendas(op).map(v => ({
      ...v,
      preco_venda: dre.preco_overrides?.[v.product_id] ?? (vendaDiretaPrices[v.product_id] || 0)
    })) : [];
    setEditing(dre);
    setForm({
      nome: dre.nome, operacao_id: dre.operacao_id, operacao_nome: dre.operacao_nome,
      vendas,
      mix_geo: dre.mix_geo || { pct_sp: 100, pct_sul_sudeste: 0, pct_norte_ne_co_es: 0 },
      meses_venda: dre.meses_venda || 3, comissao: dre.comissao || 0,
      saldo_credor_icms: dre.saldo_credor_icms || 0,
    });
    setView("editor");
  };

  const selectOperation = (opId) => {
    const op = operations.find(o => o.id === opId);
    if (!op) return;
    setForm(prev => ({ ...prev, operacao_id: opId, operacao_nome: op.nome, vendas: buildVendas(op) }));
  };

  const updatePreco = (i, val) => {
    setForm(prev => ({ ...prev, vendas: prev.vendas.map((v, idx) => idx === i ? { ...v, preco_venda: val } : v) }));
  };

  const f = (field) => (e) => {
    const val = e.target.type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value;
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const updateMix = (field, val) => {
    setForm(prev => {
      const keys = ["pct_sp", "pct_sul_sudeste", "pct_norte_ne_co_es"];
      const others = keys.filter(k => k !== field);
      const restante = 100 - val;
      const restAtual = others.reduce((s, k) => s + (prev.mix_geo?.[k] || 0), 0);
      const mix = { [field]: val };
      if (restAtual > 0) {
        const primeiro = Math.round(((prev.mix_geo?.[others[0]] || 0) / restAtual) * restante);
        mix[others[0]] = primeiro;
        mix[others[1]] = Math.max(0, restante - primeiro);
      } else {
        mix[others[0]] = Math.floor(restante / 2);
        mix[others[1]] = restante - Math.floor(restante / 2);
      }
      return { ...prev, mix_geo: mix };
    });
  };

  const [dreResult, setDreResult] = useState(null);
  const [dreError, setDreError] = useState(null);

  const handleMontarDRE = () => {
    setDreError(null);
    setDreResult(null);
    if (!form.operacao_id) { setDreError("Selecione uma operação de importação."); return; }
    if (!form.vendas?.length) { setDreError("A operação não tem produtos carregados. Reabra o cenário ou selecione a operação novamente."); return; }
    if (!config) { setDreError("Configuração tributária não carregada. Recarregue a página."); return; }
    const op = operations.find(o => o.id === form.operacao_id);
    if (!op?.resultado_importacao?.resultados) { setDreError("A operação selecionada não tem resultado calculado — abra o Simulador, clique em Calcular e depois em Salvar."); return; }
    const mixSoma = (form.mix_geo?.pct_sp || 0) + (form.mix_geo?.pct_sul_sudeste || 0) + (form.mix_geo?.pct_norte_ne_co_es || 0);
    if (mixSoma !== 100) { setDreError(`O Mix Geográfico soma ${mixSoma}% — ajuste para totalizar 100%.`); return; }

    const configMotor = configParaMotor(config);
    const importacao = op.resultado_importacao;

    const vendas = form.vendas.map(v => {
      const resultado = importacao.resultados.find(r => r.produto.id === v.product_id);
      if (!resultado) return null;
      return {
        produto: resultado.produto,
        quantidade: v.qty,
        preco_unitario: Number(v.preco_venda) || 0
      };
    }).filter(v => v && v.preco_unitario > 0);

    if (!vendas.length) { setDreError("Defina pelo menos um preço de venda maior que zero na tabela de produtos."); return; }

    const mixGeografico = form.mix_geo ? {
      pct_sp: (form.mix_geo.pct_sp || 0) / 100,
      pct_sul_sudeste: (form.mix_geo.pct_sul_sudeste || 0) / 100,
      pct_norte_ne_co_es: (form.mix_geo.pct_norte_ne_co_es || 0) / 100
    } : null;

    const meses = form.meses_venda || 1;

    // Crédito de ICMS da própria importação é somado automaticamente ao saldo credor inicial (igual ao app original)
    const saldoCredorTotal = (form.saldo_credor_icms || 0) + (importacao.totais?.credito_icms || 0);

    const dreBase = montarDRE(importacao, vendas, configMotor, socios, saldoCredorTotal, form.comissao || 0, mixGeografico);

    const despesasFixas = config.despesas_fixas?.length ? config.despesas_fixas : DESPESAS_FIXAS_PADRAO;
    const despesasFixasMensais = despesasFixas.reduce((s, d) => s + (d.valor || 0), 0);
    const despesasFixasTotal = despesasFixasMensais * meses;
    const lucroDistribuivelAjustado = dreBase.lucro_distribuivel - despesasFixasTotal;

    const distribuicao = calcularDistribuicao(lucroDistribuivelAjustado, socios, configMotor, meses);
    const totalIrrf = distribuicao.reduce((s, d) => s + d.irrf, 0);
    const liquidoFinal = lucroDistribuivelAjustado - totalIrrf;

    const sugestoesIrrf = sugerirMesesIrrf(lucroDistribuivelAjustado, socios, configMotor);
    const alertaDespesasFixas = despesasFixasTotal > dreBase.lucro_distribuivel;
    const alertaDistribuicaoAnual = distribuicao.filter(d => {
      const anual = (d.distribuicao_bruta / meses) * 12;
      return anual > 600000;
    });

    setDreResult({
      ...dreBase,
      despesas_fixas_mensais: despesasFixasMensais,
      despesas_fixas_total: despesasFixasTotal,
      lucro_distribuivel_ajustado: lucroDistribuivelAjustado,
      distribuicao, total_irrf: totalIrrf, liquido_final: liquidoFinal,
      sugestoes_irrf: sugestoesIrrf,
      alerta_despesas_fixas: alertaDespesasFixas,
      alerta_distribuicao_anual: alertaDistribuicaoAnual,
      meses_venda: meses
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const precoOverrides = {};
    form.vendas.forEach(v => { precoOverrides[v.product_id] = v.preco_venda; });

    const data = {
      nome: form.nome, operacao_id: form.operacao_id, operacao_nome: form.operacao_nome,
      mix_geo: form.mix_geo, meses_venda: form.meses_venda, comissao: form.comissao,
      saldo_credor_icms: form.saldo_credor_icms, preco_overrides: precoOverrides,
      resultado: dreResult
    };

    if (editing) await base44.entities.DRESalvo.update(editing.id, data);
    else await base44.entities.DRESalvo.create(data);

    setSaving(false);
    setView("list");
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este cenário DRE?")) return;
    await base44.entities.DRESalvo.delete(id);
    loadData();
  };

  const toggleCompare = (id) => {
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (view === "list") return (
    <div>
      <PageHeader title="DRE — Lucro Presumido" description={`${savedDREs.length} cenários salvos`}
        actions={
          <div className="flex gap-2">
            {compareIds.length >= 2 && (
              <Button variant="outline" onClick={() => setView("compare")}><GitCompare className="w-4 h-4 mr-1" /> Comparar ({compareIds.length})</Button>
            )}
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo Cenário</Button>
          </div>
        } />

      {savedDREs.length === 0 ? (
        <EmptyState icon={FileBarChart} title="Nenhum cenário DRE salvo" description="Selecione uma operação de importação e projete o DRE de venda." actionLabel="Novo Cenário" onAction={openNew} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedDREs.map(dre => {
            const r = dre.resultado || {};
            const margemPct = r.receita > 0 ? (r.liquido_final / r.receita) * 100 : 0;
            const selected = compareIds.includes(dre.id);
            return (
              <div key={dre.id} className={`bg-card rounded-xl border p-4 transition-all cursor-pointer ${selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:shadow-md"}`} onClick={() => openEdit(dre)}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={selected} onClick={e => e.stopPropagation()} onChange={() => toggleCompare(dre.id)} className="mt-1" />
                    <div>
                      <h3 className="font-heading font-semibold text-sm">{dre.nome}</h3>
                      <p className="text-[10px] text-muted-foreground">{dre.operacao_nome}</p>
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleDelete(dre.id); }} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                </div>
                <div className="space-y-1 mt-3">
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Receita Bruta</span><span className="font-medium">{fmtBRL(r.receita)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Lucro Bruto</span><span className={`font-medium ${r.lucro_bruto >= 0 ? "text-success" : "text-destructive"}`}>{fmtBRL(r.lucro_bruto)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Lucro Líquido</span><span className={`font-bold ${r.liquido_final >= 0 ? "text-success" : "text-destructive"}`}>{fmtBRL(r.liquido_final)}</span></div>
                  <div className="flex justify-between text-xs pt-1 border-t border-border"><span className="text-muted-foreground">Margem Líquida</span><span className={`font-bold ${margemPct >= 0 ? "text-success" : "text-destructive"}`}>{fmtPct(margemPct)}</span></div>
                </div>
                <div className="flex gap-2 mt-3 text-[10px] text-muted-foreground">
                  <span>{dre.meses_venda} meses</span><span>·</span>
                  <span>Comissão {dre.comissao}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (view === "compare") {
    const selected = savedDREs.filter(d => compareIds.includes(d.id));
    const metrics = [
      { key: "receita", label: "Receita Bruta" },
      { key: "cmv", label: "CMV" },
      { key: "lucro_bruto", label: "Lucro Bruto" },
      { key: "total_impostos", label: "Total Impostos" },
      { key: "lucro_operacional", label: "Lucro Operacional" },
      { key: "comissoes", label: "Comissões" },
      { key: "despesas_fixas_total", label: "Despesas Fixas" },
      { key: "lucro_distribuivel_ajustado", label: "Lucro Distribuível" },
      { key: "total_irrf", label: "IRRF" },
      { key: "liquido_final", label: "Líquido Final" },
    ];
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => setView("list")}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
          <h1 className="text-xl font-heading font-bold">Comparação de Cenários</h1>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Métrica</th>
                {selected.map(d => <th key={d.id} className="text-right py-2 px-3 font-heading font-semibold">{d.nome}</th>)}
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => (
                <tr key={m.key} className="border-b border-border/30">
                  <td className="py-2 px-2 text-muted-foreground">{m.label}</td>
                  {selected.map(d => <td key={d.id} className="text-right py-2 px-3 font-medium">{fmtBRL(d.resultado?.[m.key])}</td>)}
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="py-2 px-2 font-semibold">Margem Líquida</td>
                {selected.map(d => {
                  const pct = d.resultado?.receita > 0 ? (d.resultado.liquido_final / d.resultado.receita) * 100 : 0;
                  return <td key={d.id} className={`text-right py-2 px-3 font-bold ${pct >= 0 ? "text-success" : "text-destructive"}`}>{fmtPct(pct)}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const op = operations.find(o => o.id === form.operacao_id);
  const mixSum = (form.mix_geo?.pct_sp || 0) + (form.mix_geo?.pct_sul_sudeste || 0) + (form.mix_geo?.pct_norte_ne_co_es || 0);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={() => setView("list")}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
        <h1 className="text-xl font-heading font-bold">{editing ? "Editar Cenário DRE" : "Novo Cenário DRE"}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Cenário</h3>
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={form.nome || ""} onChange={f("nome")} placeholder="Ex: Cenário Otimista Q1" /></div>
              <div>
                <Label>Operação de Importação *</Label>
                <Select value={form.operacao_id || ""} onValueChange={selectOperation} disabled={!!editing}>
                  <SelectTrigger><SelectValue placeholder="Selecione a operação" /></SelectTrigger>
                  <SelectContent>{operations.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                </Select>
                {operations.length === 0 && <p className="text-[10px] text-destructive mt-1">Calcule e salve uma operação no Simulador primeiro.</p>}
              </div>
              <div>
                <Label>Prazo para Vender (meses)</Label>
                <Select value={String(form.meses_venda || 3)} onValueChange={v => setForm({ ...form, meses_venda: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Array.from({ length: 12 }, (_, i) => i + 1).map(m => <SelectItem key={m} value={String(m)}>{m} {m === 1 ? "mês" : "meses"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Comissão (%)</Label>
                <Input type="number" step="0.1" value={form.comissao ?? 0} onChange={f("comissao")} />
                <p className="text-[10px] text-muted-foreground mt-1">Pré-carregada da Config. Tributária (Comissão Padrão Vendedor). Aplicada sobre o lucro operacional do cenário — ajuste se este lote tiver comissão diferente.</p>
              </div>
              <div>
                <Label>Saldo Credor ICMS Inicial (R$)</Label>
                <Input type="number" step="0.01" value={form.saldo_credor_icms ?? 0} onChange={f("saldo_credor_icms")} />
                <p className="text-[10px] text-muted-foreground mt-1">Primeira operação? Deixe 0. O crédito de ICMS desta importação é somado automaticamente.</p>
              </div>
            </div>
          </div>

          {op && (
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="font-heading font-semibold text-sm mb-3">Mix Geográfico de Vendas</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">SP Interno</span><span className="font-medium">{form.mix_geo?.pct_sp ?? 100}%</span></div>
                  <input type="range" min="0" max="100" value={form.mix_geo?.pct_sp ?? 100} onChange={e => updateMix("pct_sp", parseInt(e.target.value))} className="w-full accent-primary" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Sul / Sudeste</span><span className="font-medium">{form.mix_geo?.pct_sul_sudeste ?? 0}%</span></div>
                  <input type="range" min="0" max="100" value={form.mix_geo?.pct_sul_sudeste ?? 0} onChange={e => updateMix("pct_sul_sudeste", parseInt(e.target.value))} className="w-full accent-primary" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Norte / NE / CO / ES</span><span className="font-medium">{form.mix_geo?.pct_norte_ne_co_es ?? 0}%</span></div>
                  <input type="range" min="0" max="100" value={form.mix_geo?.pct_norte_ne_co_es ?? 0} onChange={e => updateMix("pct_norte_ne_co_es", parseInt(e.target.value))} className="w-full accent-primary" />
                </div>
                {mixSum !== 100 && <p className="text-[10px] text-warning">Soma: {mixSum}% (deve totalizar 100%)</p>}
              </div>
            </div>
          )}

          <Button className="w-full" onClick={handleSave} disabled={saving || !form.nome || !form.operacao_id}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar Cenário
          </Button>
        </div>

        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-heading font-semibold text-sm mb-3">Preços de Venda por Produto</h3>
          {form.vendas?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2">Produto</th>
                    <th className="text-right py-2">Qtd</th>
                    <th className="text-right py-2 hidden sm:table-cell">Custo Un.</th>
                    <th className="text-right py-2">Preço Venda</th>
                    <th className="text-right py-2 hidden sm:table-cell">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {form.vendas.map((v, i) => {
                    const receita = (v.preco_venda || 0) * v.qty;
                    return (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 truncate max-w-[120px]">{v.product_name}</td>
                        <td className="text-right py-2">{v.qty}</td>
                        <td className="text-right py-2 hidden sm:table-cell text-muted-foreground">{fmtBRL(v.custo_unitario)}</td>
                        <td className="text-right py-2">
                          <Input type="number" step="0.01" value={v.preco_venda || ""} onChange={e => updatePreco(i, parseFloat(e.target.value) || 0)} className="h-7 w-24 text-right text-xs" />
                        </td>
                        <td className="text-right py-2 hidden sm:table-cell font-medium">{fmtBRL(receita)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Selecione uma operação para carregar os produtos.</p>
          )}
        </div>

        <div className="space-y-4">
          <Button className="w-full" size="lg" onClick={handleMontarDRE} disabled={!form.operacao_id}>
            <Calculator className="w-4 h-4 mr-2" /> Montar DRE
          </Button>
          {dreError && (
            <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive font-medium">{dreError}</div>
          )}
          {dreResult ? (
            <>
              <DREResults dre={dreResult} />
              <DREDistribution dre={dreResult} />
            </>
          ) : (
            !dreError && (
              <div className="bg-card rounded-xl border border-border p-8 text-center">
                <Calculator className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Preencha os preços de venda e clique em “Montar DRE” para ver o resultado.</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}