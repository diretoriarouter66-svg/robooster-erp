import React from "react";
import { AlertTriangle, Users, Lightbulb } from "lucide-react";

const fmtBRL = (v) => v != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";

export default function DREDistribution({ dre }) {
  if (!dre) return null;
  const { distribuicao, sugestoes_irrf, alerta_despesas_fixas, alerta_distribuicao_anual, despesas_fixas_total, despesas_fixas_mensais, meses_venda, lucro_distribuivel, lucro_distribuivel_ajustado } = dre;

  return (
    <div className="space-y-4">
      {/* Despesas Fixas */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="font-heading font-semibold text-sm mb-2">Despesas Fixas</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Despesas Mensais</span><span className="font-medium">{fmtBRL(despesas_fixas_mensais)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">× {meses_venda} meses</span><span className="font-medium">{fmtBRL(despesas_fixas_total)}</span></div>
          <div className="flex justify-between border-t border-border pt-1"><span className="text-muted-foreground">Lucro Distribuível (base)</span><span className="font-medium">{fmtBRL(lucro_distribuivel)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">− Despesas Fixas</span><span className="font-medium text-destructive">−{fmtBRL(despesas_fixas_total)}</span></div>
          <div className="flex justify-between border-t border-border pt-1"><span className="font-semibold">Lucro Distribuível Ajustado</span><span className={`font-bold ${lucro_distribuivel_ajustado >= 0 ? "text-success" : "text-destructive"}`}>{fmtBRL(lucro_distribuivel_ajustado)}</span></div>
        </div>
      </div>

      {alerta_despesas_fixas && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">As despesas fixas do período ({fmtBRL(despesas_fixas_total)}) superam o lucro distribuível ({fmtBRL(lucro_distribuivel)}). A operação gera prejuízo.</p>
        </div>
      )}

      {/* Sugestão IRRF */}
      {sugestoes_irrf?.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-primary" />
            <h4 className="text-xs font-semibold text-primary">Sugestão de Distribuição (IRRF = R$ 0,00)</h4>
          </div>
          {sugestoes_irrf.map((s, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              <span className="font-medium">{s.nome}</span>: distribuir em ≥ <strong>{s.meses_minimos}</strong> meses (≤ {fmtBRL(s.parcela_mensal_otima)}/mês) → IRRF = R$ 0,00
            </p>
          ))}
        </div>
      )}

      {/* Distribuição por Sócio */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-heading font-semibold text-sm">Distribuição por Sócio</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2">Sócio</th>
                <th className="text-right py-2">Particip.</th>
                <th className="text-right py-2">Bruto</th>
                <th className="text-right py-2">IRRF</th>
                <th className="text-right py-2">Líquido</th>
                <th className="text-center py-2 hidden sm:table-cell">Residente</th>
              </tr>
            </thead>
            <tbody>
              {distribuicao?.map((d, i) => {
                const anualProjetado = d.distribuicao_bruta / meses_venda * 12;
                const alertaAnual = anualProjetado > 600000;
                return (
                  <tr key={i} className="border-b border-border/30 last:border-0">
                    <td className="py-2 font-medium">{d.nome}</td>
                    <td className="text-right py-2 text-muted-foreground">{d.participacao}%</td>
                    <td className="text-right py-2">{fmtBRL(d.distribuicao_bruta)}</td>
                    <td className="text-right py-2 text-destructive">{fmtBRL(d.irrf)}</td>
                    <td className="text-right py-2 font-medium text-success">{fmtBRL(d.distribuicao_liquida)}</td>
                    <td className="text-center py-2 hidden sm:table-cell">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] ${d.residente ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{d.residente ? "Sim" : "Não"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between border-t border-border mt-2 pt-2 text-sm">
          <span className="font-semibold">Total IRRF</span>
          <span className="font-bold text-destructive">{fmtBRL(dre.total_irrf)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="font-semibold">Líquido Final</span>
          <span className="font-bold text-success">{fmtBRL(dre.liquido_final)}</span>
        </div>
      </div>

      {/* Alertas distribuição anual */}
      {alerta_distribuicao_anual?.length > 0 && (
        <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-xs text-warning">
            <p className="font-medium mb-1">Alerta IRPFM — consultar contador:</p>
            {alerta_distribuicao_anual.map((d, i) => {
              const anual = d.distribuicao_bruta / meses_venda * 12;
              return <p key={i}>{d.nome}: distribuição anual projetada de {fmtBRL(anual)} excede R$ 600.000.</p>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}