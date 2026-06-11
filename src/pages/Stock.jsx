import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Warehouse, Search, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";

export default function Stock() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const data = await base44.entities.Product.filter({ status: "active" }, "-created_date", 200);
    setProducts(data);
    setLoading(false);
  };

  const filtered = products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader title="Controle de Estoque" description="Visão geral do estoque de produtos" />

      {products.length === 0 ? (
        <EmptyState icon={Warehouse} title="Nenhum produto no estoque" description="Cadastre produtos primeiro." />
      ) : (
        <>
          <div className="mb-4 max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produto</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Unidade</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Estoque Atual</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Estoque Mín.</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Situação</th>
                </tr></thead>
                <tbody>
                  {filtered.map((p) => {
                    const isLow = p.stock_quantity <= (p.min_stock || 0) && p.min_stock > 0;
                    return (
                      <tr key={p.id} className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${isLow ? "bg-destructive/5" : ""}`}>
                        <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3 text-center text-xs">{p.unit || "UN"}</td>
                        <td className={`px-4 py-3 text-right font-bold ${isLow ? "text-destructive" : ""}`}>{p.stock_quantity || 0}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{p.min_stock || 0}</td>
                        <td className="px-4 py-3 text-center">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-destructive/10 text-destructive">
                              <AlertTriangle className="w-3 h-3" /> Baixo
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-success/10 text-success">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}