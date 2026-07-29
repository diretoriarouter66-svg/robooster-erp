import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Container as ContainerIcon, Ship, Package, Weight, ChevronDown, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import StatusBadge from "../components/shared/StatusBadge";
import CubageResults from "../components/import/CubageResults";
import { produtoFromProduct, maxUnidadesContainer, calcularCubagem, CONTAINERS_PADRAO } from "@/lib/simportEngine";

const fmtData = (d) => d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "";

export default function ContainerPage() {
  const [operations, setOperations] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [mostrarTeorica, setMostrarTeorica] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [ops, prods] = await Promise.all([
          base44.entities.ImportOperation.list("-created_date", 100),
          base44.entities.Product.list("-created_date", 1000),
        ]);
        setOperations(ops || []);
        setProducts(prods || []);
        if (ops?.length) setSelectedId(ops[0].id);
      } catch (err) {
        setErro(err.message || "Erro ao carregar as operações.");
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  if (erro) {
    return (
      <div>
        <PageHeader title="Carga do Container" description="Cubagem dos processos de importação salvos" />
        <div className="bg-destructive/10 text-destructive rounded-xl border border-destructive/20 p-4 text-sm">
          Não foi possível carregar: {erro}
        </div>
      </div>
    );
  }

  const op = operations.find(o => o.id === selectedId) || null;
  const container = op ? (CONTAINERS_PADRAO.find(c => c.nome === op.container_tipo) || CONTAINERS_PADRAO[2]) : null;

  // Resumo da carga: junta os itens da operação com o cadastro de produtos
  const itens = (op?.itens || []).map(it => {
    const p = products.find(x => x.id === it.product_id);
    return { ...it, produto: p || null };
  });
  const totalVolumes = itens.reduce((s, it) => s + (it.qty || 0), 0);
  const pesoConhecido = itens.every(it => it.produto?.weight_kg > 0);
  const pesoTotalKg = itens.reduce((s, it) => s + (it.qty || 0) * (it.produto?.weight_kg || 0), 0);

  // Cubagem: usa a salva na operação; se não houver, recalcula ao vivo
  // com as dimensões atuais dos produtos (mesmo motor do Simulador)
  let cubagem = op?.resultado_cubagem || null;
  let cubagemRecalculada = false;
  if (!cubagem && op && container) {
    const engineItems = itens
      .filter(it => it.produto?.length_cm && it.produto?.width_cm && it.produto?.height_cm)
      .map(it => ({ produto: produtoFromProduct(it.produto), quantidade: it.qty || 0 }));
    if (engineItems.length === itens.length && engineItems.length > 0) {
      cubagem = calcularCubagem(engineItems, container);
      cubagemRecalculada = true;
    }
  }

  const comDimensao = products.filter(p => p.status === "active" && p.length_cm && p.width_cm && p.height_cm);

  return (
    <div>
      <PageHeader title="Carga do Container" description="Selecione um processo de importação salvo para ver as informações da carga" />

      {operations.length === 0 ? (
        <EmptyState icon={Ship} title="Nenhum processo de importação" description="Crie uma operação no Simulador de Importação — a carga dela aparecerá aqui." />
      ) : (
        <>
          <div className="max-w-xl mb-5">
            <Label>Processo de importação</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder="Selecione o processo" /></SelectTrigger>
              <SelectContent>
                {operations.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome}{o.data ? ` — ${fmtData(o.data)}` : ""}{o.container_tipo ? ` · ${o.container_tipo}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {op && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <div className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><ContainerIcon className="w-3.5 h-3.5" /> Container</div>
                  <p className="font-heading font-bold">{op.container_tipo || "—"}</p>
                  <div className="mt-1"><StatusBadge status={op.status} /></div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Package className="w-3.5 h-3.5" /> Volumes</div>
                  <p className="font-heading font-bold">{totalVolumes.toLocaleString("pt-BR")} un</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{itens.length} produto(s)</p>
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Weight className="w-3.5 h-3.5" /> Peso estimado</div>
                  <p className="font-heading font-bold">{pesoTotalKg > 0 ? `${(pesoTotalKg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t` : "—"}</p>
                  {!pesoConhecido && <p className="text-[10px] text-warning mt-1">Há produtos sem peso cadastrado</p>}
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Ship className="w-3.5 h-3.5" /> Ocupação</div>
                  <p className="font-heading font-bold">{cubagem ? `${cubagem.ocupacao_perc}%` : "—"}</p>
                  {cubagem && <p className={`text-[10px] mt-1 ${cubagem.cabe ? "text-success" : "text-destructive"}`}>{cubagem.cabe ? "Cabe no container" : "Não cabe"}</p>}
                </div>
              </div>

              {cubagem ? (
                <>
                  {cubagemRecalculada && (
                    <p className="text-[11px] text-muted-foreground mb-2">Cubagem recalculada agora com as dimensões atuais dos produtos (a operação não tinha cubagem salva).</p>
                  )}
                  <CubageResults result={cubagem} />
                </>
              ) : (
                <div className="bg-warning/10 text-warning rounded-xl border border-warning/20 p-4 text-sm">
                  Este processo não tem cubagem salva e há produtos sem dimensões cadastradas.
                  Preencha as dimensões da caixa nos Dados Técnicos do produto, ou abra o processo no
                  Simulador de Importação e recalcule.
                </div>
              )}

              <p className="text-[11px] text-muted-foreground mt-3">
                Para alterar itens, quantidades ou o tipo de container deste processo, edite-o no <span className="font-medium">Simulador de Importação</span> — esta tela mostra a carga; o processo é gerenciado lá.
              </p>
            </>
          )}
        </>
      )}

      {/* Tabela teórica (a antiga tela): quantas unidades de cada produto cabem por container */}
      <div className="mt-8">
        <button onClick={() => setMostrarTeorica(v => !v)} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          {mostrarTeorica ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Capacidade teórica por produto (carga de um único produto)
        </button>
        {mostrarTeorica && (
          comDimensao.length === 0 ? (
            <p className="text-xs text-muted-foreground mt-3">Nenhum produto ativo com dimensões cadastradas.</p>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden mt-3">
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
          )
        )}
      </div>
    </div>
  );
}
