import React, { useState } from "react";
import { formatBRL, formatUSD } from "@/lib/importCalc";
import { DollarSign, ChevronDown, ChevronRight } from "lucide-react";

export default function LandedCostPanel({ result }) {
  const [expanded, setExpanded] = useState(null);
  if (!result || !result.itens?.length) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="w-4 h-4 text-primary" />
        <h3 className="font-heading font-semibold text-sm">Custo de Importação</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div><p className="text-[10px] uppercase text-muted-foreground">FOB Total</p><p className="font-semibold text-sm">{formatUSD(result.total_fob_usd)}</p></div>
        <div><p className="text-[10px] uppercase text-muted-foreground">Frete+Seguro</p><p className="font-semibold text-sm">{formatBRL(result.total_frete_brl + result.total_seguro_brl)}</p></div>
        <div><p className="text-[10px] uppercase text-muted-foreground">Impostos</p><p className="font-semibold text-sm">{formatBRL(result.total_ii + result.total_ipi + result.total_pis + result.total_cofins + result.total_icms - result.total_ipi_credit)}</p></div>
        <div><p className="text-[10px] uppercase text-muted-foreground">Custo Total Landed</p><p className="font-semibold text-sm text-primary">{formatBRL(result.total_landed)}</p></div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-2">Produto</th>
              <th className="text-right py-2">Qtd</th>
              <th className="text-right py-2 hidden sm:table-cell">FOB Un.</th>
              <th className="text-right py-2">Custo Un. Landed</th>
              <th className="text-right py-2">Custo Total</th>
              <th className="text-center py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {result.itens.map((item, i) => (
              <React.Fragment key={i}>
                <tr className="border-b border-border/50 hover:bg-muted/20">
                  <td className="py-2 truncate max-w-[140px]">{item.product_name}</td>
                  <td className="text-right py-2">{item.qty}</td>
                  <td className="text-right py-2 hidden sm:table-cell">{formatUSD(item.fob_unit_usd)}</td>
                  <td className="text-right py-2 font-medium text-primary">{formatBRL(item.unit_landed_cost)}</td>
                  <td className="text-right py-2 font-medium">{formatBRL(item.total_cost)}</td>
                  <td className="text-center py-2">
                    <button onClick={() => setExpanded(expanded === i ? null : i)} className="p-0.5 hover:bg-muted rounded">
                      {expanded === i ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                </tr>
                {expanded === i && (
                  <tr className="bg-muted/10">
                    <td colSpan={6} className="py-2 px-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
                        <div className="flex justify-between"><span className="text-muted-foreground">FOB BRL:</span><span>{formatBRL(item.fob_total_brl)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Frete:</span><span>{formatBRL(item.frete_brl)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Seguro:</span><span>{formatBRL(item.seguro_brl)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Desp. Locais:</span><span>{formatBRL(item.despesas_locais_brl)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Valor Aduaneiro:</span><span>{formatBRL(item.valor_aduaneiro)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">II ({item.ii_rate}%):</span><span>{formatBRL(item.ii)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">IPI ({item.ipi_rate}%):</span><span>{formatBRL(item.ipi)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">PIS ({item.pis_rate}%):</span><span>{formatBRL(item.pis)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">COFINS ({item.cofins_rate}%):</span><span>{formatBRL(item.cofins)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">ICMS ({item.icms_rate}%):</span><span>{formatBRL(item.icms)}</span></div>
                        {item.ipi_credit > 0 && <div className="flex justify-between text-success"><span className="text-muted-foreground">Crédito IPI:</span><span>-{formatBRL(item.ipi_credit)}</span></div>}
                        {item.beneficio_5291 && <div className="text-primary">Benefício 5291</div>}
                        {item.ex_tarifario && <div className="text-primary">Ex-Tarifário</div>}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}