import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Save, Users, SlidersHorizontal, Loader2, Landmark, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { SIMPLES_ANEXO_I, simplesFaixa, simplesEfetivaPct, simplesAlertas } from "@/lib/taxEngine";

const DEFAULT_CONFIG = {
  nome: "Padrão",
  regime: "simples",
  rbt12: 0,
  presuncao_irpj: 8,
  presuncao_csll: 12,
  aliq_irpj: 15,
  aliq_csll: 9,
  adicional_irpj_aliq: 10,
  adicional_irpj_limite: 60000,
  pis_venda: 0.65,
  cofins_venda: 3,
  icms_interestadual_importado: 4,
  lc224_limite_anual: 5000000,
  irrf_dividendos: 10,
  irrf_piso_residente: 50000,
  cambio_usd: 5.3,
  despesas_fixas: []
};

export default function ConfigTributaria() {
  const [config, setConfig] = useState(null);
  const [socios, setSocios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [configs, socs] = await Promise.all([
      base44.entities.ConfigTributaria.list("-created_date", 10),
      base44.entities.Socio.list("-created_date", 50)
    ]);
    setConfig(configs[0] || DEFAULT_CONFIG);
    setSocios(socs);
    setLoading(false);
  };

  const f = (field) => (e) => {
    const val = e.target.type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value;
    setConfig(prev => ({ ...prev, [field]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (config.id) await base44.entities.ConfigTributaria.update(config.id, config);
      else await base44.entities.ConfigTributaria.create(config);
    } catch (err) {
      alert(`Não foi possível salvar a configuração: ${err.message}`);
    }
    setSaving(false);
  };

  const addDespesa = () => setConfig(prev => ({ ...prev, despesas_fixas: [...(prev.despesas_fixas || []), { nome: "", valor: 0 }] }));
  const updateDespesa = (i, field, val) => setConfig(prev => ({ ...prev, despesas_fixas: prev.despesas_fixas.map((d, idx) => idx === i ? { ...d, [field]: val } : d) }));
  const removeDespesa = (i) => setConfig(prev => ({ ...prev, despesas_fixas: prev.despesas_fixas.filter((_, idx) => idx !== i) }));
  // Taxas de recebimento por operadora × parcelas (jsonb `taxas_operadoras`)
  const addOperadora = () => setConfig(prev => ({ ...prev, taxas_operadoras: [...(prev.taxas_operadoras || []), { nome: "", debito: "", parcelas: {} }] }));
  const updateOperadora = (i, patch) => setConfig(prev => ({ ...prev, taxas_operadoras: (prev.taxas_operadoras || []).map((o, idx) => idx === i ? { ...o, ...patch } : o) }));
  const removeOperadora = (i) => setConfig(prev => ({ ...prev, taxas_operadoras: (prev.taxas_operadoras || []).filter((_, idx) => idx !== i) }));

  const addSocio = async () => {
    const created = await base44.entities.Socio.create({ nome: "Novo Sócio", percentual_participacao: 0, residente_fiscal_brasil: true });
    setSocios(prev => [...prev, created]);
  };
  const updateSocio = (id, field, val) => {
    setSocios(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));
  };
  const saveSocio = async (id) => {
    const s = socios.find(x => x.id === id);
    if (s) await base44.entities.Socio.update(id, { nome: s.nome, percentual_participacao: s.percentual_participacao, residente_fiscal_brasil: s.residente_fiscal_brasil });
  };
  const removeSocio = async (id) => {
    await base44.entities.Socio.delete(id);
    setSocios(prev => prev.filter(s => s.id !== id));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const regime = config.regime || "simples";
  const faixa = simplesFaixa(config.rbt12 || 0);
  const efetiva = simplesEfetivaPct(config.rbt12 || 0);
  const alertas = simplesAlertas(config.rbt12 || 0);
  const fmtBRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);

  return (
    <div>
      <PageHeader title="Configuração Tributária" description="Regime, parâmetros fiscais e sócios" actions={
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar Configuração
        </Button>
      } />

      <Card className="p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Landmark className="w-4 h-4 text-primary" />
          <h3 className="font-heading font-semibold text-sm">Regime Tributário</h3>
        </div>
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <Label className="mb-2 block">Regime vigente</Label>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button onClick={() => setConfig(p => ({ ...p, regime: "simples" }))}
                className={`px-4 py-2 text-sm font-medium ${regime === "simples" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
                Simples Nacional
              </button>
              <button onClick={() => setConfig(p => ({ ...p, regime: "presumido" }))}
                className={`px-4 py-2 text-sm font-medium ${regime === "presumido" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
                Lucro Presumido
              </button>
            </div>
          </div>
          {regime === "simples" && (<>
            <div className="w-52">
              <Label>RBT12 — receita bruta dos últimos 12 meses (R$)</Label>
              <Input type="number" step="1000" value={config.rbt12 ?? 0} onChange={f("rbt12")} />
              <p className="text-[10px] text-muted-foreground mt-1">Pegue com o contador ou no PGDAS. Define a alíquota efetiva de TODO o sistema.</p>
            </div>
            <div className="bg-muted/40 rounded-lg px-4 py-3 text-sm">
              <div className="flex gap-6">
                <div><p className="text-[10px] text-muted-foreground">Anexo I · Faixa</p><p className="font-bold">{faixa.faixa}ª (até {fmtBRL(faixa.ate)})</p></div>
                <div><p className="text-[10px] text-muted-foreground">Alíq. nominal</p><p className="font-bold">{faixa.aliq.toFixed(2)}%</p></div>
                <div><p className="text-[10px] text-muted-foreground">Alíquota EFETIVA (DAS)</p><p className="font-bold text-primary text-lg">{efetiva.toFixed(2)}%</p></div>
              </div>
              {(config.rbt12 || 0) <= 0 && <p className="text-[11px] text-warning mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> RBT12 zerado — usando a 1ª faixa (4%). Preencha para o cálculo real.</p>}
              {alertas.map((a, i) => <p key={i} className="text-[11px] text-destructive mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {a.msg}</p>)}
            </div>
          </>)}
          {regime === "presumido" && (
            <p className="text-sm text-muted-foreground self-center">Usando os parâmetros do Lucro Presumido abaixo.</p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className={`p-4 ${regime === "simples" ? "opacity-60" : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <h3 className="font-heading font-semibold text-sm">Parâmetros Lucro Presumido{regime === "simples" ? " (inativos — regime Simples)" : ""}</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Presunção IRPJ (%)</Label><Input type="number" step="0.1" value={config.presuncao_irpj ?? 8} onChange={f("presuncao_irpj")} /></div>
            <div><Label>Presunção CSLL (%)</Label><Input type="number" step="0.1" value={config.presuncao_csll ?? 12} onChange={f("presuncao_csll")} /></div>
            <div><Label>Alíquota IRPJ (%)</Label><Input type="number" step="0.1" value={config.aliq_irpj ?? 15} onChange={f("aliq_irpj")} /></div>
            <div><Label>Alíquota CSLL (%)</Label><Input type="number" step="0.1" value={config.aliq_csll ?? 9} onChange={f("aliq_csll")} /></div>
            <div><Label>Adicional IRPJ (%)</Label><Input type="number" step="0.1" value={config.adicional_irpj_aliq ?? 10} onChange={f("adicional_irpj_aliq")} /></div>
            <div><Label>Limite Adicional IRPJ (R$/trim)</Label><Input type="number" step="1000" value={config.adicional_irpj_limite ?? 60000} onChange={f("adicional_irpj_limite")} /></div>
            <div><Label>PIS s/ Venda (%)</Label><Input type="number" step="0.01" value={config.pis_venda ?? 0.65} onChange={f("pis_venda")} /></div>
            <div><Label>COFINS s/ Venda (%)</Label><Input type="number" step="0.01" value={config.cofins_venda ?? 3} onChange={f("cofins_venda")} /></div>
            <div><Label>ICMS Interestadual Importado (%)</Label><Input type="number" step="0.1" value={config.icms_interestadual_importado ?? 4} onChange={f("icms_interestadual_importado")} /></div>
            <div><Label>Limite LC 224 (R$/ano)</Label><Input type="number" step="100000" value={config.lc224_limite_anual ?? 5000000} onChange={f("lc224_limite_anual")} /></div>
            <div><Label>IRRF Dividendos (%)</Label><Input type="number" step="0.1" value={config.irrf_dividendos ?? 10} onChange={f("irrf_dividendos")} /></div>
            <div><Label>Piso IRRF Residente (R$/mês)</Label><Input type="number" step="1000" value={config.irrf_piso_residente ?? 50000} onChange={f("irrf_piso_residente")} /></div>
            <div><Label>Câmbio USD Padrão (R$)</Label><Input type="number" step="0.01" value={config.cambio_usd ?? 5.3} onChange={f("cambio_usd")} /></div>
            <div><Label>Comissão Padrão Vendedor (%)</Label><Input type="number" step="0.1" value={config.comissao_vendedor_padrao ?? 0} onChange={f("comissao_vendedor_padrao")} /></div>
            <div><Label>Índice de Custo Fixo</Label><Input type="number" step="0.01" value={config.indice_custo_fixo ?? 0} onChange={f("indice_custo_fixo")} /></div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-heading font-semibold text-sm">Taxas de recebimento por operadora e nº de parcelas</h3>
              <p className="text-[11px] text-muted-foreground mt-1">Uma linha por operadora (PagBank, PayPal, Mercado Pago…). Para cada uma, a taxa de débito e a taxa de crédito de 1× a 18× — a taxa muda com o nº de parcelas, inclusive no 1×. No pedido de venda, a linha de cartão/PayPal escolhe a operadora e o sistema aplica a taxa da tabela; deixe em branco o nº de parcelas que não trabalhamos.</p>
            </div>
            <Button variant="outline" size="sm" onClick={addOperadora}><Plus className="w-3.5 h-3.5 mr-1" /> Operadora</Button>
          </div>
          {(config.taxas_operadoras || []).length === 0 && <p className="text-xs text-muted-foreground">Nenhuma operadora cadastrada — sem isso o pedido não lança a despesa de taxa.</p>}
          <div className="space-y-3">
            {(config.taxas_operadoras || []).map((op, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Input placeholder="Nome da operadora (ex.: PagBank)" value={op.nome || ""} onChange={e => updateOperadora(i, { nome: e.target.value })} className="max-w-xs" />
                  <Label className="text-xs whitespace-nowrap ml-2">Débito (%)</Label>
                  <Input type="number" step="0.01" min="0" className="w-24" value={op.debito ?? ""} onChange={e => updateOperadora(i, { debito: e.target.value })} />
                  <button type="button" className="ml-auto text-destructive hover:bg-destructive/10 rounded px-2 h-9 text-sm" title="Remover operadora" onClick={() => removeOperadora(i)}>✕</button>
                </div>
                <Label className="text-xs">Crédito — taxa (%) por nº de parcelas</Label>
                <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5 mt-1">
                  {Array.from({ length: 18 }, (_, k) => k + 1).map(n => (
                    <div key={n}>
                      <span className="text-[10px] text-muted-foreground">{n}×</span>
                      <Input type="number" step="0.01" min="0" className="h-8 text-xs px-1.5" value={(op.parcelas || {})[String(n)] ?? ""} onChange={e => updateOperadora(i, { parcelas: { ...(op.parcelas || {}), [String(n)]: e.target.value } })} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-semibold text-sm">Despesas Fixas Mensais</h3>
            <Button variant="outline" size="sm" onClick={addDespesa}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar</Button>
          </div>
          <div className="space-y-2">
            {(config.despesas_fixas || []).map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="Descrição" value={d.nome || ""} onChange={e => updateDespesa(i, "nome", e.target.value)} className="flex-1" />
                <Input type="number" step="0.01" placeholder="0,00" value={d.valor || ""} onChange={e => updateDespesa(i, "valor", parseFloat(e.target.value) || 0)} className="w-28" />
                <button onClick={() => removeDespesa(i)} className="p-2 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
              </div>
            ))}
            {(config.despesas_fixas || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma despesa fixa cadastrada.</p>}
            {(config.despesas_fixas || []).length > 0 && (
              <div className="flex justify-between pt-2 border-t border-border text-sm font-medium">
                <span>Total Mensal</span>
                <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((config.despesas_fixas || []).reduce((s, d) => s + (d.valor || 0), 0))}</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-heading font-semibold text-sm">Sócios</h3>
          </div>
          <Button variant="outline" size="sm" onClick={addSocio}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Sócio</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2">Nome</th>
                <th className="text-right py-2 w-28">Participação (%)</th>
                <th className="text-center py-2 w-32">Residente Fiscal</th>
                <th className="text-right py-2 w-20">Ações</th>
              </tr>
            </thead>
            <tbody>
              {socios.map(s => (
                <tr key={s.id} className="border-b border-border/50">
                  <td className="py-2"><Input value={s.nome || ""} onChange={e => updateSocio(s.id, "nome", e.target.value)} onBlur={() => saveSocio(s.id)} className="h-8" /></td>
                  <td className="py-2"><Input type="number" step="0.1" value={s.percentual_participacao ?? ""} onChange={e => updateSocio(s.id, "percentual_participacao", parseFloat(e.target.value) || 0)} onBlur={() => saveSocio(s.id)} className="h-8 text-right" /></td>
                  <td className="py-2 text-center">
                    <button onClick={() => { updateSocio(s.id, "residente_fiscal_brasil", !s.residente_fiscal_brasil); setTimeout(() => saveSocio(s.id), 100); }}
                      className={`px-2 py-1 rounded text-xs font-medium ${s.residente_fiscal_brasil ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {s.residente_fiscal_brasil ? "Sim" : "Não"}
                    </button>
                  </td>
                  <td className="py-2 text-right"><button onClick={() => removeSocio(s.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {socios.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum sócio cadastrado.</p>}
          {socios.length > 0 && (
            <div className="flex justify-between pt-2 text-sm font-medium">
              <span>Total Participação</span>
              <span className={Math.abs(socios.reduce((s, x) => s + (x.percentual_participacao || 0), 0) - 100) < 0.1 ? "text-success" : "text-destructive"}>
                {socios.reduce((s, x) => s + (x.percentual_participacao || 0), 0).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}