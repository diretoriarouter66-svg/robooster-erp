import React from "react";
import { AlertTriangle, Package } from "lucide-react";

const fmt = (v) => v != null ? v.toLocaleString("pt-BR") : "—";

export default function CubageResults({ result }) {
  if (!result) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-semibold text-sm">Cubagem do Container</h3>
        <span className={`px-2 py-1 rounded text-xs font-medium ${result.cabe ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
          {result.cabe ? "Cabe no container" : "Não cabe"}
        </span>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">{result.container_nome}</span>
          <span className="font-medium">{result.ocupacao_perc}% ocupado</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div className={`h-full rounded-full ${result.cabe ? "bg-primary" : "bg-destructive"}`} style={{ width: `${Math.min(100, result.ocupacao_perc)}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Usado: {fmt(result.comprimento_usado)} mm</span>
          <span>Folga: {fmt(result.folga)} mm</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-1.5">Produto</th>
              <th className="text-right py-1.5">Qtd</th>
              <th className="text-right py-1.5 hidden sm:table-cell">Empilha</th>
              <th className="text-right py-1.5 hidden sm:table-cell">Lado a lado</th>
              <th className="text-right py-1.5 hidden md:table-cell">Un/Fileira</th>
              <th className="text-right py-1.5">Fileiras</th>
              <th className="text-right py-1.5 hidden md:table-cell">Comp. (mm)</th>
            </tr>
          </thead>
          <tbody>
            {result.detalhe.map((d, i) => (
              <tr key={i} className="border-b border-border/30 last:border-0">
                <td className="py-1.5">
                  <div className="flex items-center gap-1">
                    {d.cabe === false ? <AlertTriangle className="w-3 h-3 text-destructive" /> : <Package className="w-3 h-3 text-muted-foreground" />}
                    <span className={d.cabe === false ? "text-destructive" : ""}>{d.produto_nome}</span>
                  </div>
                  {d.motivo && <p className="text-[9px] text-destructive">{d.motivo}</p>}
                </td>
                <td className="text-right py-1.5">{fmt(d.quantidade)}</td>
                <td className="text-right py-1.5 hidden sm:table-cell">{d.empilha || "—"}</td>
                <td className="text-right py-1.5 hidden sm:table-cell">{d.lado_a_lado || "—"}</td>
                <td className="text-right py-1.5 hidden md:table-cell">{d.unidades_por_fileira || "—"}</td>
                <td className="text-right py-1.5">{d.fileiras || "—"}</td>
                <td className="text-right py-1.5 hidden md:table-cell">{fmt(d.comprimento_usado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}