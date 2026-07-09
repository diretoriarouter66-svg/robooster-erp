import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Target } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/shared/PageHeader";
import { configParaMotor, DESPESAS_FIXAS_PADRAO } from "@/lib/simportEngine";

const formatBRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export default function Breakeven() {
  const [operations, setOperations] = useState([]);
  const [config, setConfig] = useState(null);
  const [vendaDiretaPrices, setVendaDiretaPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [operacaoId, setOperacaoId] = useState("");
  const [vendasMes, setVendasMes] = useState({});
  const [taxaMarketplace, setTaxaMarketplace] = useState(16);
  const [precoMarketplace, setPrecoMarketplace] = useState(0);

  useEffect(() => {
    Promise.all([
      base44.entities.ImportOperation.list("-created_date", 100),
      base44.entities.ConfigTributaria.list("-created_date", 5),
      base44.entities.SalesChannel.list("-created_date", 50),
      base44.entities.ProductPricing.list("-created_date", 500),
    ]).then(([ops, configs, chans, prices]) => {
      setOperations((ops || []).filter(o => o.resultado_importacao?.resultados));
      setConfig(configs?.[0] || {});
      const vd = (chans || []).find(c => c.type === "venda_direta") || (chans || []).find(c => (c.commission_percent || 0) === 0 && (c.fixed_fee || 0) === 0);
      const map = {};
      (prices || []).forEach(p => { if (vd && p.channel_id === vd.id && p.price > 0) map[p.product_id] = p.price; });
      setVendaDiretaPrices(map);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  const despesas = (config?.despesas_fixas?.length ? config.despesas_fixas : DESPESAS_FIXAS_PADRAO);
  const fixasMes = despesas.reduce((s, d) => s + (d.valor || 0), 0);
  const motorConfig = configParaMotor(config);

  const op = operacaoId ? operations.find(o => o.id === operacaoId) : null;
  const resultados = op?.resultado_importacao?.resultados || [];

  const produtosBreakeven = resultados.map(r => {
    const preco = vendaDiretaPrices[r.produto.id] || 0;
    const custoUnit = r.custo_unitario_formacao || 0;
    const aliqIcms = r.produto.beneficio_5291 ? 0.088 : ((r.produto.aliq_icms || 18) / 100);
    const impostosPorUnidade = preco * (motorConfig.pis_venda + motorConfig.cofins_venda + aliqIcms + motorConfig.presuncao_irpj * motorConfig.aliq_irpj + motorConfig.presuncao_csll * motorConfig.aliq_csll);
    const lucroUnit = preco - custoUnit - impostosPorUnidade;
    const breakevenUn = lucroUnit > 0 ? fixasMes / lucroUnit : null;
    return { produto: r.produto, preco, custoUnit, impostosPorUnidade, lucroUnit, breakevenUn, quantidade: r.quantidade };
  }).filter(p => p.preco > 0 || p.custoUnit > 0);

  const totalLucroMix = produtosBreakeven.reduce((s, p) => s + Math.max(0, p.lucroUnit) * p.quantidade, 0);
  const breakevenMixTotal = totalLucroMix > 0 ? fixasMes / totalLucroMix : null;

  const totalLucroVendido = produtosBreakeven.reduce((s, p) => {
    const qtdV = parseInt(vendasMes[p.produto.id] || 0);
    return s + Math.max(0, p.lucroUnit) * qtdV;
  }, 0);
  const progressoBreakeven = fixasMes > 0 ? Math.min(100, (totalLucroVendido / fixasMes) * 100) : 0;
  const liquidoMarketplace = precoMarketplace * (1 - taxaMarketplace / 100);

  return (
    <div>
      <PageHeader title="Break-even" description="Ponto de equilíbrio por produto e progresso de cobertura das despesas fixas do mês" />

      <div className="bg-card rounded-xl border border-border p-4 mb-4">
        <div className="flex items-center gap-2 mb-3"><Target className="w-4 h-4 text-primary" /><h3 className="font-heading font-semibold text-sm">Selecionar Operação</h3></div>
        {operations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Salve uma operação calculada no Simulador primeiro.</p>
        ) : (
          <Select value={operacaoId} onValueChange={v => { setOperacaoId(v); setVendasMes({}); }}>
            <SelectTrigger className="max-w-md"><SelectValue placeholder="Selecione uma operação..." /></SelectTrigger>
            <SelectContent>{operations.map(o => <SelectItem key={o.id} value={o.id}>{o.nome} {o.data ? `(${o.data})` : ""}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <p className="text-[10px] text-muted-foreground mt-2">Os preços usados são os do canal Venda Direta (Precificação). Custos vêm do resultado salvo da operação.</p>
      </div>

      {produtosBreakeven.length > 0 && (
        <>
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-4">
            <p className="text-sm font-medium text-primary">Para cobrir <strong>{formatBRL(fixasMes)}/mês</strong> de despesas fixas, você precisa vender por mês:</p>
            <ul className="mt-2 space-y-1">
              {produtosBreakeven.filter(p => p.breakevenUn != null && p.lucroUnit > 0).map(p => (
                <li key={p.produto.id} className="text-sm">→ <strong>{Math.ceil(p.breakevenUn)}× {p.produto.nome}</strong> (lucro unit. líquido: {formatBRL(p.lucroUnit)})</li>
              ))}
              {breakevenMixTotal != null && produtosBreakeven.length > 1 && (
                <li className="text-sm text-muted-foreground italic">→ ou <strong>{breakevenMixTotal.toFixed(2)}× o mix completo</strong> ({produtosBreakeven.map(p => `${Math.ceil(p.quantidade * breakevenMixTotal)} ${p.produto.nome}`).join(" + ")})</li>
              )}
            </ul>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-border"><h3 className="font-heading font-semibold text-sm">Detalhamento por Produto</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <th className="text-left px-4 py-2">Produto</th>
                  <th className="text-right px-4 py-2">Preço (V. Direta)</th>
                  <th className="text-right px-4 py-2">Custo Unit.</th>
                  <th className="text-right px-4 py-2">Impostos Unit.</th>
                  <th className="text-right px-4 py-2">Lucro Unit. Líq.</th>
                  <th className="text-right px-4 py-2">Break-even/mês</th>
                </tr></thead>
                <tbody>
                  {produtosBreakeven.map(p => (
                    <tr key={p.produto.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-medium">{p.produto.nome}</td>
                      <td className="text-right px-4 py-2">{p.preco > 0 ? formatBRL(p.preco) : <span className="text-destructive text-xs">sem preço</span>}</td>
                      <td className="text-right px-4 py-2">{formatBRL(p.custoUnit)}</td>
                      <td className="text-right px-4 py-2 text-destructive">{formatBRL(p.impostosPorUnidade)}</td>
                      <td className={`text-right px-4 py-2 font-semibold ${p.lucroUnit > 0 ? "text-success" : "text-destructive"}`}>{formatBRL(p.lucroUnit)}</td>
                      <td className="text-right px-4 py-2 font-semibold">{p.breakevenUn != null ? `${Math.ceil(p.breakevenUn)} un` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-4 mb-4">
            <h3 className="font-heading font-semibold text-sm mb-1">Progresso do Mês</h3>
            <p className="text-xs text-muted-foreground mb-3">Informe quantas unidades já foram vendidas este mês:</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {produtosBreakeven.map(p => (
                <div key={p.produto.id}>
                  <Label className="text-xs text-muted-foreground truncate block" title={p.produto.nome}>{p.produto.nome}</Label>
                  <Input type="number" min="0" value={vendasMes[p.produto.id] || ""} onChange={e => setVendasMes(prev => ({ ...prev, [p.produto.id]: parseInt(e.target.value) || 0 }))} placeholder="0" />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">Cobertura das despesas fixas</span>
              <span className="font-semibold">{formatBRL(totalLucroVendido)} / {formatBRL(fixasMes)}</span>
            </div>
            <div className="w-full h-4 bg-muted rounded-full overflow-hidden">
              <div className={`h-full transition-all ${progressoBreakeven >= 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${progressoBreakeven}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{progressoBreakeven.toFixed(1)}% das despesas fixas cobertas{progressoBreakeven >= 100 ? " — daqui em diante é lucro" : ""}</p>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-sm space-y-1">
          <p><strong>Custo de 1 mês parado:</strong> {formatBRL(fixasMes)}</p>
          {produtosBreakeven.length > 0 && produtosBreakeven[0].preco > 0 && (
            <p><strong>Custo de 1 ponto de desconto:</strong> {formatBRL(produtosBreakeven[0].preco * 0.01)}/un no {produtosBreakeven[0].produto.nome}</p>
          )}
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-heading font-semibold text-sm mb-3">Conversor Marketplace → Líquido</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><Label className="text-xs text-muted-foreground">Preço no marketplace (R$)</Label><Input type="number" value={precoMarketplace || ""} onChange={e => setPrecoMarketplace(parseFloat(e.target.value) || 0)} /></div>
            <div><Label className="text-xs text-muted-foreground">Taxa (%)</Label><Input type="number" step="0.1" value={taxaMarketplace} onChange={e => setTaxaMarketplace(parseFloat(e.target.value) || 0)} /></div>
          </div>
          <div className="bg-primary/5 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Líquido recebido</span>
            <span className="font-bold text-primary text-lg">{formatBRL(liquidoMarketplace)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
