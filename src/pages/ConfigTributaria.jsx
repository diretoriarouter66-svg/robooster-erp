import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Save, Users, SlidersHorizontal, Loader2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

const DEFAULT_CONFIG = {
  nome: "Padrão",
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

  return (
    <div>
      <PageHeader title="Configuração Tributária" description="Parâmetros do Lucro Presumido e sócios" actions={
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar Configuração
        </Button>
      } />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <h3 className="font-heading font-semibold text-sm">Parâmetros Lucro Presumido</h3>
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