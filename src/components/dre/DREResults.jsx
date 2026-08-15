import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

const fmtBRL = (v) => v != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";
const fmtPct = (v) => v != null ? `${v.toFixed(2)}%` : "—";

function Row({ label, value, bold, negative, positive, indent, total }) {
  return (
    <div className={`flex justify-between text-sm py-1 ${total ? "border-t border-border mt-1 pt-1" : ""} ${indent ? "pl-4" : ""}`}>
      <span className={`${bold ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`${bold ? "font-bold" : "font-medium"} ${negative ? "text-destructive" : positive ? "text-success" : ""}`}>{fmtBRL(value)}</span>
    </div>
  );
}

export default function DREResults({ dre }) {
  if (!dre) return null;
  const margemBrutaPct = dre.receita > 0 ? (dre.lucro_bruto / dre.receita) * 100 : 0;
  const margemLiquidaPct = dre.receita > 0 ? (dre.liquido_final / dre.receita) * 100 : 0;

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <h3 className="font-heading font-semibold text-sm mb-3">DRE — Lucro Presumido</h3>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-muted/30 rounded-lg p-2">
          <div className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-success" /><p className="text-[10px] text-muted-foreground">Margem Bruta</p></div>
          <p className={`text-sm font-bold ${margemBrutaPct >= 0 ? "text-success" : "text-destructive"}`}>{fmtPct(margemBrutaPct)}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-2">
          <div className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-primary" /><p className="text-[10px] text-muted-foreground">Margem Líquida</p></div>
          <p className={`text-sm font-bold ${margemLiquidaPct >= 0 ? "text-success" : "text-destructive"}`}>{fmtPct(margemLiquidaPct)}</p>
        </div>
      </div>

      <Row label="Receita Bruta" value={dre.receita} bold />
      <Row label="(−) CMV (Custo Formação)" value={dre.cmv} negative />
      <Row label="(=) Lucro Bruto" value={dre.lucro_bruto} bold total />

      {dre.regime === "simples" ? (
        <Row label={`(−) DAS Simples Nacional (alíq. efetiva ${(dre.aliquota_efetiva_simples || 0).toFixed(2)}%)`} value={dre.das} negative indent />
      ) : (<>
        <Row label="(−) PIS s/ Venda" value={dre.pis_venda} negative indent />
        <Row label="(−) COFINS s/ Venda" value={dre.cofins_venda} negative indent />
        <Row label="(−) ICMS débito" value={dre.icms_debito} negative indent />
        {dre.icms_credito_utilizado > 0 && (
          <Row label="(+) ICMS crédito utilizado" value={dre.icms_credito_utilizado} positive indent />
        )}
        <Row label="ICMS a pagar" value={dre.icms_a_pagar} negative indent />
        {dre.saldo_credor_icms_remanescente > 0 && (
          <Row label="  Crédito ICMS remanescente" value={dre.saldo_credor_icms_remanescente} positive indent />
        )}
        <Row label="(−) IRPJ" value={dre.irpj + dre.adicional_irpj} negative indent />
        <Row label="(−) CSLL" value={dre.csll} negative indent />
      </>)}
      <Row label="(=) Total Impostos" value={dre.total_impostos} negative bold total />

      <Row label="(=) Lucro Operacional" value={dre.lucro_operacional} bold total />
      <Row label="(−) Comissões" value={dre.comissoes} negative indent />
      <Row label="(−) Despesas Fixas" value={dre.despesas_fixas_total} negative indent />
      <Row label="(=) Lucro Distribuível" value={dre.lucro_distribuivel_ajustado} bold total />
      <Row label="(−) IRRF s/ Dividendos" value={dre.total_irrf} negative indent />
      <Row label="(=) Líquido Final" value={dre.liquido_final} bold positive total />

      {dre.detalhe_icms_por_faixa && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-1">ICMS por Faixa Geográfica</p>
          <div className="space-y-1">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">SP Interno ({(dre.detalhe_icms_por_faixa.sp.pct * 100).toFixed(0)}%)</span><span>{fmtBRL(dre.detalhe_icms_por_faixa.sp.debito)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Sul/Sudeste ({(dre.detalhe_icms_por_faixa.sul_sudeste.pct * 100).toFixed(0)}%)</span><span>{fmtBRL(dre.detalhe_icms_por_faixa.sul_sudeste.debito)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Norte/NE/CO/ES ({(dre.detalhe_icms_por_faixa.norte_ne_co_es.pct * 100).toFixed(0)}%)</span><span>{fmtBRL(dre.detalhe_icms_por_faixa.norte_ne_co_es.debito)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}