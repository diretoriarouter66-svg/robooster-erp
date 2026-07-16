import React, { useState } from "react";
import { ChevronDown, ChevronRight, TrendingDown } from "lucide-react";

const fmtBRL = (v) => v != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";
const fmtUSD = (v) => v != null ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v) : "—";

function ProductBreakdown({ r }) {
  const [open, setOpen] = useState(false);
  const rows = [
    { label: "FOB Total", usd: r.fob_total_usd, brl: r.fob_total_brl },
    { label: "Frete Rateado", brl: r.frete_rateado_brl },
    { label: "Seguro Rateado", brl: r.seguro_rateado_brl },
    { label: "Valor Aduaneiro (VA)", brl: r.va },
    { label: `II${r.ex_tarifario_vigente ? " (Ex-Tarifário vigente)" : ""}`, brl: r.ii, highlight: r.ex_tarifario_vigente },
    { label: "IPI", brl: r.ipi },
    { label: "PIS Importação", brl: r.pis_imp },
    { label: "COFINS Importação", brl: r.cofins_imp },
    { label: `ICMS${r.aliq_icms_efetiva < 0.09 ? " (Benefício 5.2.91)" : ""}`, brl: r.icms_imp },
    { label: "Despesas Aduaneiras", brl: r.despesas_brl },
    { label: "Custo Formação Preço", brl: r.custo_formacao_preco, bold: true },
    { label: "Desembolso Caixa", brl: r.desembolso_caixa, bold: true },
    { label: "Crédito ICMS", brl: r.credito_icms, credit: true },
    { label: "Crédito IPI", brl: r.credito_ipi, credit: true },
  ];

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{r.produto?.nome || r.produto_nome || "Produto"}</p>
          <p className="text-[10px] text-muted-foreground">{r.quantidade} un · Custo un: {fmtBRL(r.custo_unitario_formacao)}</p>
        </div>
        <span className="text-xs font-medium">{fmtBRL(r.custo_formacao_preco)}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 bg-muted/10">
          <table className="w-full text-xs">
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border/30 last:border-0">
                  <td className={`py-1.5 ${row.bold ? "font-semibold" : "text-muted-foreground"}`}>
                    {row.highlight && <span className="text-primary mr-1">●</span>}{row.label}
                  </td>
                  {row.usd != null && <td className="py-1.5 text-right text-muted-foreground">{fmtUSD(row.usd)}</td>}
                  <td className={`py-1.5 text-right ${row.bold ? "font-semibold" : row.credit ? "text-success" : ""}`}>{fmtBRL(row.brl)}</td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="py-1.5 font-bold">Custo Unitário Landed</td>
                <td className="py-1.5 text-right font-bold text-primary">{fmtBRL(r.custo_unitario_formacao)}</td>
              </tr>
            </tbody>
          </table>
          {r.economia_ex_tarifario && (
            <div className="mt-2 px-3 py-2 bg-success/5 border border-success/20 rounded-lg flex items-center gap-2">
              <TrendingDown className="w-3.5 h-3.5 text-success" />
              <div className="text-xs">
                <span className="font-medium text-success">Economia Ex-Tarifário: {fmtBRL(r.economia_ex_tarifario.economia_total)}</span>
                <span className="text-muted-foreground ml-2">(II: {fmtBRL(r.economia_ex_tarifario.economia_ii)} + ICMS: {fmtBRL(r.economia_ex_tarifario.economia_icms)})</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ImportResults({ result }) {
  if (!result || !result.totais || !result.resultados) return null;
  const t = result.totais;

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <h3 className="font-heading font-semibold text-sm mb-3">Custo de Importação</h3>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-muted/30 rounded-lg p-2 min-w-0"><p className="text-[10px] text-muted-foreground">FOB Total</p><p className="text-sm font-bold leading-tight break-words">{fmtBRL(t.fob_total_brl)}</p></div>
        <div className="bg-muted/30 rounded-lg p-2 min-w-0"><p className="text-[10px] text-muted-foreground">Valor Aduaneiro</p><p className="text-sm font-bold leading-tight break-words">{fmtBRL(t.va)}</p></div>
        <div className="bg-muted/30 rounded-lg p-2 min-w-0"><p className="text-[10px] text-muted-foreground">Custo Formação</p><p className="text-sm font-bold text-primary leading-tight break-words">{fmtBRL(t.custo_formacao_preco)}</p></div>
        <div className="bg-muted/30 rounded-lg p-2 min-w-0"><p className="text-[10px] text-muted-foreground">Desembolso Caixa</p><p className="text-sm font-bold leading-tight break-words">{fmtBRL(t.desembolso_caixa)}</p></div>
      </div>

      <div className="grid grid-cols-3 gap-x-2 gap-y-2 mb-3 text-xs">
        <div className="text-center"><p className="text-muted-foreground">II</p><p className="font-medium">{fmtBRL(t.ii)}</p></div>
        <div className="text-center"><p className="text-muted-foreground">IPI</p><p className="font-medium">{fmtBRL(t.ipi)}</p></div>
        <div className="text-center"><p className="text-muted-foreground">PIS Imp</p><p className="font-medium">{fmtBRL(t.pis_imp)}</p></div>
        <div className="text-center"><p className="text-muted-foreground">COFINS Imp</p><p className="font-medium">{fmtBRL(t.cofins_imp)}</p></div>
        <div className="text-center"><p className="text-muted-foreground">ICMS Imp</p><p className="font-medium">{fmtBRL(t.icms_imp)}</p></div>
        <div className="text-center"><p className="text-muted-foreground">Despesas</p><p className="font-medium">{fmtBRL(t.despesas_brl)}</p></div>
      </div>

      <div className="flex gap-4 mb-3 text-xs">
        <div className="flex items-center gap-1"><span className="text-muted-foreground">Crédito ICMS:</span><span className="font-medium text-success">{fmtBRL(t.credito_icms)}</span></div>
        <div className="flex items-center gap-1"><span className="text-muted-foreground">Crédito IPI:</span><span className="font-medium text-success">{fmtBRL(t.credito_ipi)}</span></div>
      </div>

      {result.economia_ex_tarifario_total > 0 && (
        <div className="mb-3 px-3 py-2 bg-success/5 border border-success/20 rounded-lg flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-success" />
          <span className="text-sm font-medium text-success">Economia total Ex-Tarifário: {fmtBRL(result.economia_ex_tarifario_total)}</span>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground mb-1">Detalhe por Produto</p>
        {result.resultados.map((r, i) => <ProductBreakdown key={i} r={r} />)}
      </div>
    </div>
  );
}