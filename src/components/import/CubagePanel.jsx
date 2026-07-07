import React from "react";
import { formatNumber, formatPct } from "@/lib/importCalc";
import { Box, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function CubagePanel({ cubage }) {
  if (!cubage || !cubage.detalhes?.length) return null;
  const cabe = cubage.cabe;
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Box className="w-4 h-4 text-primary" />
        <h3 className="font-heading font-semibold text-sm">Cubagem — {cubage.container_label}</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Volume Total</p>
          <p className="font-semibold text-sm">{formatNumber(cubage.total_volume_m3, 3)} m³</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Capacidade</p>
          <p className="font-semibold text-sm">{cubage.container_volume_m3 === Infinity ? "∞" : `${formatNumber(cubage.container_volume_m3, 1)} m³`}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Peso Total</p>
          <p className="font-semibold text-sm">{formatNumber(cubage.total_weight_kg, 1)} kg</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Ocupação</p>
          <p className={`font-semibold text-sm ${cubage.ocupacao_pct > 90 ? "text-warning" : "text-success"}`}>{formatPct(cubage.ocupacao_pct)}</p>
        </div>
      </div>
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${cabe ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
        {cabe ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
        {cabe ? "O mix cabe no container" : "O mix NÃO cabe no container — reduza quantidades"}
      </div>
      {cubage.ocupacao_pct > 0 && (
        <div className="mt-3 w-full bg-muted rounded-full h-2 overflow-hidden">
          <div className={`h-full rounded-full ${cabe ? "bg-success" : "bg-destructive"}`} style={{ width: `${Math.min(cubage.ocupacao_pct, 100)}%` }} />
        </div>
      )}
      <table className="w-full text-xs mt-3">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left py-1.5">Produto</th>
            <th className="text-right py-1.5">Qtd</th>
            <th className="text-right py-1.5 hidden sm:table-cell">Vol. Un.</th>
            <th className="text-right py-1.5">Vol. Total</th>
            <th className="text-right py-1.5 hidden sm:table-cell">Peso Total</th>
          </tr>
        </thead>
        <tbody>
          {cubage.detalhes.map((d, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-1.5 truncate max-w-[160px]">{d.product_name}</td>
              <td className="text-right py-1.5">{d.qty}</td>
              <td className="text-right py-1.5 hidden sm:table-cell">{formatNumber(d.unit_volume_m3, 4)}</td>
              <td className="text-right py-1.5">{formatNumber(d.total_volume_m3, 3)} m³</td>
              <td className="text-right py-1.5 hidden sm:table-cell">{formatNumber(d.total_weight_kg, 1)} kg</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}