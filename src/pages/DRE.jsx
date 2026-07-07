import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowLeft, Save, Loader2, Calculator, FileBarChart, Trash2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import DREResultPanel from "@/components/dre/DREResultPanel";
import { calcDRE, formatBRL, formatPct } from "@/lib/importCalc";

export default function DRE() {
  const [savedDREs, setSavedDREs] = useState([]);
  const [operations, setOperations] = useState([]);
  const [socios, setSocios] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [dres, ops, socs, configs] = await Promise.all([
      base44.entities.DRESalvo.list("-created_date", 100),
      base44.entities.ImportOperation.list("-created_date", 100),
      base44.entities.Socio.list("-created_date", 50),
      base44.entities.ConfigTributaria.list("-created_date", 5)
    ]);
    setSavedDREs(dres);
    setOperations(ops.filter(o => o.resultado_importacao));
    setSocios(socs);
    setConfig(configs[0] || {});
    setLoading(false);
  };

  // Build vendas from operation items when creating new DRE
  const buildVendas = (op) => {
    const landed = op.resultado_importacao?.itens || [];
    return landed.map(it => ({
      product_id: it.product_id,
      product_name: it.product_name,
      sku: it.sku,
      qty: it.qty,
      preco_venda: 0
    }));
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      nome: "", operacao_id: "", operacao_nome: "",
      vendas: [], mix_geo: { interna: 100, interestadual: 0 },
      meses_venda: 3, comissao: 0, saldo_credor_icms: 0,
      preco_overrides: {}
    });
    setView("editor");
  };

  const openEdit = (dre) => {
    const op = operations.find(o => o.id === dre.operacao_id);
    const vendas = op ? buildVendas(op).map(v => ({
      ...v,
      preco_venda: dre.preco_overrides?.[v.product_id] ?? v.preco_venda
    })) : [];
    setEditing(dre);
    setForm({
      nome: dre.nome, operacao_id: dre.operacao_id, operacao_nome: dre.operacao_nome,
      vendas, mix_geo: dre.mix_geo || { interna: 100, interestadual: 0 },
      meses_venda: dre.meses_venda || 3, comissao: dre.comissao || 0,
      saldo_credor_icms: dre.saldo_credor_icms || 0,
      preco_overrides: dre.preco_overrides || {}
    });
    setView("editor");
  };

  const selectOperation = (opId) => {
    const op = operations.find(o => o.id === opId);
    if (!op) return;
    setForm(prev => ({
      ...prev, operacao_id: opId, operacao_nome: op.nome,
      vendas: buildVendas(op)
    }));
  };

  const updatePreco = (i, val) => {
    setForm(prev => ({
      ...prev,
      vendas: prev.vendas.map((v, idx) => idx === i ? { ...v, preco_venda: val } : v)
    }));
  };

  const f = (field) => (e) => {
    const val = e.target.type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value;
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const updateMix = (field, val) => {
    setForm(prev => {
      const other = field === "interna" ? "interestadual" : "interna";
      return { ...prev, mix_geo: { ...prev.mix_geo, [field]: val, [other]: 100 - val } };
    });
  };

  // Live DRE calculation
  const dreResult = useMemo(() => {
    if (!form.operacao_id || !form.vendas?.length) return null;
    const op = operations.find(o => o.id === form.operacao_id);
    if (!op) return null;
    return calcDRE(op, form.vendas, config, socios, form.mix_geo, form.meses_venda, form.comissao, form.saldo_credor_icms);
  }, [form, operations, config, socios]);

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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (view === "list") return (
    <div>
      <PageHeader title="DRE — Lucro Presumido" description={`${savedDREs.length} cenários salvos`}
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo Cenário</Button>} />

      {savedDREs.length === 0 ? (
        <EmptyState icon={FileBarChart} title="Nenhum cenário DRE salvo" description="Selecione uma operação de importação e projete o DRE de venda." actionLabel="Novo Cenário" onAction={openNew} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedDREs.map(dre => {
            const r = dre.resultado || {};
            return (
              <div key={dre.id} className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => openEdit(dre)}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-heading font-semibold text-sm">{dre.nome}</h3>
                    <p className="text-[10px] text-muted-foreground">{dre.operacao_nome}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleDelete(dre.id); }} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                </div>
                <div className="space-y-1 mt-3">
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Receita Bruta</span><span className="font-medium">{formatBRL(r.receita_bruta)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Lucro Bruto</span><span className={`font-medium ${r.lucro_bruto >= 0 ? "text-success" : "text-destructive"}`}>{formatBRL(r.lucro_bruto)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Lucro Líquido</span><span className={`font-bold ${r.lucro_liquido >= 0 ? "text-success" : "text-destructive"}`}>{formatBRL(r.lucro_liquido)}</span></div>
                  <div className="flex justify-between text-xs pt-1 border-t border-border"><span className="text-muted-foreground">Margem</span><span className={`font-bold ${r.lucro_liquido >= 0 ? "text-success" : "text-destructive"}`}>{formatPct(r.margem_pct)}</span></div>
                </div>
                <div className="flex gap-2 mt-3 text-[10px] text-muted-foreground">
                  <span>{dre.meses_venda} meses</span>
                  <span>·</span>
                  <span>Comissão {dre.comissao}%</span>
                  <span>·</span>
                  <span>Mix {dre.mix_geo?.interna ?? 100}/{dre.mix_geo?.interestadual ?? 0}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // EDITOR VIEW
  const op = operations.find(o => o.id === form.operacao_id);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={() => setView("list")}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
        <h1 className="text-xl font-heading font-bold">{editing ? "Editar Cenário DRE" : "Novo Cenário DRE"}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Config */}
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Cenário</h3>
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={form.nome || ""} onChange={f("nome")} placeholder="Ex: Cenário Otimista Q1" /></div>
              <div>
                <Label>Operação de Importação *</Label>
                <Select value={form.operacao_id || ""} onValueChange={selectOperation} disabled={!!editing}>
                  <SelectTrigger><SelectValue placeholder="Selecione a operação" /></SelectTrigger>
                  <SelectContent>
                    {operations.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {operations.length === 0 && <p className="text-[10px] text-destructive mt-1">Calcule e salve uma operação no Simulador primeiro.</p>}
              </div>
              <div><Label>Prazo de Venda (meses)</Label><Input type="number" min="1" value={form.meses_venda ?? 3} onChange={f("meses_venda")} /></div>
              <div><Label>Comissão (%)</Label><Input type="number" step="0.1" value={form.comissao ?? 0} onChange={f("comissao")} /></div>
              <div><Label>Saldo Credor ICMS Inicial (R$)</Label><Input type="number" step="0.01" value={form.saldo_credor_icms ?? 0} onChange={f("saldo_credor_icms")} /></div>
            </div>
          </div>

          {op && (
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="font-heading font-semibold text-sm mb-3">Mix Geográfico de Vendas</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Venda Interna</span><span className="font-medium">{form.mix_geo?.interna ?? 100}%</span></div>
                  <input type="range" min="0" max="100" value={form.mix_geo?.interna ?? 100} onChange={e => updateMix("interna", parseInt(e.target.value))} className="w-full accent-primary" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Interestadual</span><span className="font-medium">{form.mix_geo?.interestadual ?? 0}%</span></div>
                  <input type="range" min="0" max="100" value={form.mix_geo?.interestadual ?? 0} onChange={e => updateMix("interestadual", parseInt(e.target.value))} className="w-full accent-primary" />
                </div>
              </div>
            </div>
          )}

          <Button className="w-full" onClick={handleSave} disabled={saving || !form.nome || !form.operacao_id}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar Cenário
          </Button>
        </div>

        {/* MIDDLE: Sale prices table */}
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
                    const landedItem = op?.resultado_importacao?.itens?.find(l => l.product_id === v.product_id);
                    const custo = landedItem?.unit_landed_cost || 0;
                    const receita = (v.preco_venda || 0) * v.qty;
                    return (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 truncate max-w-[120px]">{v.product_name}</td>
                        <td className="text-right py-2">{v.qty}</td>
                        <td className="text-right py-2 hidden sm:table-cell text-muted-foreground">{formatBRL(custo)}</td>
                        <td className="text-right py-2">
                          <Input type="number" step="0.01" value={v.preco_venda || ""} onChange={e => updatePreco(i, parseFloat(e.target.value) || 0)} className="h-7 w-24 text-right text-xs" />
                        </td>
                        <td className="text-right py-2 hidden sm:table-cell font-medium">{formatBRL(receita)}</td>
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

        {/* RIGHT: DRE Result */}
        <div>
          {dreResult ? <DREResultPanel dre={dreResult} /> : (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <Calculator className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Selecione uma operação e defina os preços de venda para calcular o DRE.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}