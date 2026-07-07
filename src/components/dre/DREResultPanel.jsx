import React from "react";
import { formatBRL, formatPct } from "@/lib/importCalc";
import { TrendingUp, Users } from "lucide-react";

function DRELine({ label, value, indent, bold, color }) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${indent ? "pl-4" : ""} ${bold ? "border-t border-border font-semibold" : ""}`}>
      <span className={`text-xs ${bold ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-xs font-medium ${color || ""} ${bold ? "font-bold" : ""}`}>{formatBRL(value)}</span>
    </div>
  );
}

export default function DREResultPanel({ dre }) {
  if (!dre) return null;
  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-heading font-semibold text-sm">DRE Projetado — Lucro Presumido</h3>
        </div>

        <DRELine label="Receita Bruta de Vendas" value={dre.receita_bruta} bold />
        <DRELine label="(-) ICMS sobre Venda" value={dre.icms_venda} indent />
        <div className="pl-8 text-[10px] text-muted-foreground">
          Crédito ICMS importação: {formatBRL(dre.icms_credit)} · Saldo credor inicial: {formatBRL(dre.saldo_credor_inicial)} · ICMS devido: {formatBRL(dre.icms_devido)}
        </div>
        <DRELine label="(-) PIS sobre Venda" value={dre.pis_venda} indent />
        <DRELine label="(-) COFINS sobre Venda" value={dre.cofins_venda} indent />
        <DRELine label="(=) Receita Líquida" value={dre.receita_liquida} bold />
        <DRELine label="(-) CMV (Custo Landed)" value={dre.cmv} indent />
        <DRELine label="(=) Lucro Bruto" value={dre.lucro_bruto} bold color={dre.lucro_bruto >= 0 ? "text-success" : "text-destructive"} />
        <DRELine label={`(-) Despesas Fixas (${dre.meses} meses)`} value={dre.despesas_fixas} indent />
        <DRELine label="(-) Comissão" value={dre.comissao} indent />
        <DRELine label="(=) Resultado Operacional" value={dre.resultado_operacional} bold color={dre.resultado_operacional >= 0 ? "text-success" : "text-destructive"} />

        <div className="pl-4 mt-2 space-y-0.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Tributação Lucro Presumido</div>
          <DRELine label={`Base IRPJ (presunção) → IRPJ 15%`} value={dre.irpj_normal} indent />
          {dre.adicional_irpj > 0 && <DRELine label="(+) Adicional IRPJ" value={dre.adicional_irpj} indent />}
          <DRELine label="IRPJ Total" value={dre.irpj_total} indent />
          <DRELine label="CSLL" value={dre.csll} indent />
        </div>

        <DRELine label="(=) Lucro Líquido" value={dre.lucro_liquido} bold color={dre.lucro_liquido >= 0 ? "text-success" : "text-destructive"} />
        <div className="flex justify-between items-center py-2 bg-primary/5 rounded-lg px-3 mt-2">
          <span className="text-xs font-semibold">Margem Líquida</span>
          <span className={`text-sm font-bold ${dre.lucro_liquido >= 0 ? "text-success" : "text-destructive"}`}>{formatPct(dre.margem_pct)}</span>
        </div>
      </div>

      {dre.socios?.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-heading font-semibold text-sm">Distribuição de Dividendos</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2">Sócio</th>
                <th className="text-right py-2">Particip.</th>
                <th className="text-right py-2">Div. Brutos</th>
                <th className="text-right py-2">IRRF</th>
                <th className="text-right py-2">Div. Líquidos</th>
              </tr>
            </thead>
            <tbody>
              {dre.socios.map((s, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2">
                    {s.nome}
                    <span className="text-[10px] text-muted-foreground ml-1">{s.residente ? "(residente)" : "(não-residente)"}</span>
                  </td>
                  <td className="text-right py-2">{formatPct(s.participacao)}</td>
                  <td className="text-right py-2">{formatBRL(s.dividendos_brutos)}</td>
                  <td className="text-right py-2 text-destructive">{s.irrf > 0 ? formatBRL(s.irrf) : "—"}</td>
                  <td className="text-right py-2 font-medium text-success">{formatBRL(s.dividendos_liquidos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}