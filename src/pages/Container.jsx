import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Container as ContainerIcon } from "lucide-react";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import { produtoFromProduct, maxUnidadesContainer, CONTAINERS_PADRAO } from "@/lib/simportEngine";

export default function ContainerPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Product.filter({ status: "active" }, "-created_date", 1000).then(p => {
      setProducts(p || []);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  const comDimensao = products.filter(p => p.length_cm && p.width_cm && p.height_cm);
  const semDimensao = products.filter(p => !p.length_cm || !p.width_cm || !p.height_cm);

  return (
    <div>
      <PageHeader title="Capacidade de Container" description="Quantas unidades de cada produto cabem em cada container (carga de um único produto)" />

      {comDimensao.length === 0 ? (
        <EmptyState icon={ContainerIcon} title="Nenhum produto com dimensões" description="Preencha as dimensões da caixa nos Dados Técnicos de Importação do produto." />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produto</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Caixa (C×L×A cm)</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Peso (kg)</th>
                {CONTAINERS_PADRAO.map(c => (
                  <th key={c.nome} className="text-right px-4 py-3 font-medium text-muted-foreground">{c.nome}</th>
                ))}
              </tr></thead>
              <tbody>
                {comDimensao.map(p => {
                  const prod = produtoFromProduct(p);
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3"><span className="font-medium">{p.name}</span> <span className="font-mono text-[10px] text-muted-foreground">{p.sku}</span></td>
                      <td className="px-4 py-3 text-center text-xs hidden md:table-cell">{p.length_cm} × {p.width_cm} × {p.height_cm}</td>
                      <td className="px-4 py-3 text-center text-xs hidden sm:table-cell">{p.weight_kg || "—"}</td>
                      {CONTAINERS_PADRAO.map(c => {
                        const max = maxUnidadesContainer(prod, c);
                        const pesoTotal = (p.weight_kg || 0) * max;
                        return (
                          <td key={c.nome} className="px-4 py-3 text-right">
                            <span className="font-bold text-primary">{max}</span>
                            {p.weight_kg > 0 && <span className="block text-[10px] text-muted-foreground">{(pesoTotal / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {semDimensao.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3">Sem dimensões cadastradas (não exibidos): {semDimensao.map(p => p.name).join(", ")}.</p>
      )}

      <div className="bg-card rounded-xl border border-border p-4 mt-4 text-xs text-muted-foreground">
        <p><strong className="text-foreground">Como o cálculo funciona:</strong> mesmo algoritmo de fileiras do Simulador — empilhamento pela altura (se a caixa for empilhável), caixas lado a lado pela largura (girando quando "pode deitar" render mais) e fileiras pelo comprimento do container. Atenção ao peso total: a capacidade máxima de peso de um container é de aproximadamente 26–28 t; o número em toneladas mostrado abaixo da quantidade ajuda a identificar quando o limite é o peso, não o espaço.</p>
      </div>
    </div>
  );
}
