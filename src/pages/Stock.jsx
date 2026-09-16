import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Warehouse, Search, AlertTriangle, Plus, History, ArrowDownUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import { registrarMovimento, TIPOS_MOVIMENTO } from "@/lib/stockService";

const fmtData = (d) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

const TipoBadge = ({ tipo }) => {
  const cfg = {
    entrada_importacao: { label: "Entrada Importação", cls: "bg-success/10 text-success" },
    saida_venda: { label: "Saída Venda", cls: "bg-primary/10 text-primary" },
    devolucao_venda: { label: "Devolução Venda", cls: "bg-warning/10 text-warning" },
    ajuste_inventario: { label: "Ajuste Inventário", cls: "bg-muted text-muted-foreground" },
    avaria: { label: "Avaria / Perda", cls: "bg-destructive/10 text-destructive" },
    uso_interno: { label: "Uso Interno", cls: "bg-warning/10 text-warning" },
  }[tipo] || { label: tipo, cls: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>;
};

export default function Stock() {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("saldos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [kardexProduct, setKardexProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tipo: "ajuste_inventario", product_id: "", quantidade: "", motivo: "" });

  useEffect(() => { loadData(); }, []);

  const [reservas, setReservas] = useState({});

  const loadData = async () => {
    const [p, m, orders] = await Promise.all([
      base44.entities.Product.filter({ status: "active" }, "-created_date", 1000),
      base44.entities.StockMovement.list("-created_date", 1000),
      base44.entities.SaleOrder.list("-created_date", 1000),
    ]);
    // Reserva = pedidos ainda NÃO faturados (Pendente/Aprovado) — comprometem o
    // estoque sem baixá-lo. "Aprovado" é justamente o pedido com sinal recebido.
    const res = {};
    (orders || []).filter(o => ["pending", "approved"].includes(o.status)).forEach(o => {
      (o.items || []).forEach(i => {
        if (i.product_id) res[i.product_id] = (res[i.product_id] || 0) + (i.quantity || 0);
      });
    });
    setReservas(res);
    setProducts(p);
    setMovements(m);
    setLoading(false);
  };

  const openNovaMovimentacao = () => {
    setForm({ tipo: "ajuste_inventario", product_id: "", quantidade: "", motivo: "" });
    setDialogOpen(true);
  };

  const handleSalvarMovimento = async () => {
    if (!form.product_id) { alert("Selecione o produto."); return; }
    if (!form.motivo?.trim()) { alert("A justificativa é obrigatória — é ela que protege você em qualquer auditoria."); return; }
    const qtd = parseFloat(form.quantidade);
    if (!qtd) { alert("Informe a quantidade."); return; }

    setSaving(true);
    try {
      await registrarMovimento({
        productId: form.product_id,
        tipo: form.tipo,
        quantidade: Math.abs(qtd),
        quantidadeAssinada: form.tipo === "ajuste_inventario" ? qtd : undefined,
        motivo: form.motivo,
      });
      setDialogOpen(false);
      await loadData();
    } catch (err) {
      alert(err.message);
    }
    setSaving(false);
  };

  const filteredProducts = products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredMovements = movements.filter(m =>
    !search || m.product_name?.toLowerCase().includes(search.toLowerCase()) || m.sku?.toLowerCase().includes(search.toLowerCase()) || m.origem_ref?.toLowerCase().includes(search.toLowerCase())
  );
  const kardexMovements = kardexProduct ? movements.filter(m => m.product_id === kardexProduct.id) : [];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Controle de Estoque"
        description="Saldos e movimentações — o estoque nunca se edita, se movimenta"
        actions={<Button onClick={openNovaMovimentacao}><Plus className="w-4 h-4 mr-1" /> Nova Movimentação</Button>}
      />

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setTab("saldos")} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "saldos" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Saldos</button>
        <button onClick={() => setTab("movimentos")} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "movimentos" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Movimentações ({movements.length})</button>
        <div className="ml-auto max-w-sm relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {tab === "saldos" && (
        products.length === 0 ? (
          <EmptyState icon={Warehouse} title="Nenhum produto" description="Cadastre produtos primeiro." />
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produto</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Atual</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Reservado</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Disponível</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Mínimo</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Situação</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Kardex</th>
                </tr></thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const reservado = reservas[p.id] || 0;
                    const disponivel = (p.stock_quantity || 0) - reservado;
                    const isLow = disponivel <= (p.min_stock || 0) && p.min_stock > 0;
                    const semNada = disponivel <= 0;
                    return (
                      <tr key={p.id} className={`border-b border-border last:border-0 hover:bg-muted/20 ${isLow || semNada ? "bg-destructive/5" : ""}`}>
                        <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3 text-right">{p.stock_quantity || 0}</td>
                        <td className={`px-4 py-3 text-right ${reservado > 0 ? "text-warning font-semibold" : "text-muted-foreground"}`}>{reservado}</td>
                        <td className={`px-4 py-3 text-right font-bold ${isLow || semNada ? "text-destructive" : ""}`}>{disponivel}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">{p.min_stock || 0}</td>
                        <td className="px-4 py-3 text-center">
                          {isLow || semNada ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-destructive/10 text-destructive">
                              <AlertTriangle className="w-3 h-3" /> Repor{(p.lead_time_dias || 0) > 0 ? ` já (chega em ~${p.lead_time_dias}d)` : ""}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-success/10 text-success">OK</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setKardexProduct(p)} className="p-1.5 hover:bg-muted rounded-lg" title="Ver extrato de movimentações">
                            <History className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {tab === "movimentos" && (
        movements.length === 0 ? (
          <EmptyState icon={ArrowDownUp} title="Nenhuma movimentação registrada" description="Toda entrada, saída e ajuste aparecerá aqui, com rastro completo." />
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produto</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qtd</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Saldo</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Origem / Motivo</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Por</th>
                </tr></thead>
                <tbody>
                  {filteredMovements.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtData(m.created_date)}</td>
                      <td className="px-4 py-3"><span className="font-medium">{m.product_name}</span> <span className="font-mono text-[10px] text-muted-foreground">{m.sku}</span></td>
                      <td className="px-4 py-3 text-center"><TipoBadge tipo={m.tipo} /></td>
                      <td className={`px-4 py-3 text-right font-bold ${m.quantidade > 0 ? "text-success" : "text-destructive"}`}>{m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}</td>
                      <td className="px-4 py-3 text-right hidden md:table-cell text-muted-foreground">{m.saldo_anterior} → <span className="font-medium text-foreground">{m.saldo_novo}</span></td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground max-w-[240px] truncate" title={`${m.origem_ref || ""} ${m.motivo || ""}`}>{[m.origem_ref, m.motivo].filter(Boolean).join(" — ") || "—"}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{m.created_by || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Dialog: Nova Movimentação Manual */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Movimentação Manual</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPOS_MOVIMENTO).filter(([, def]) => def.manual).map(([key, def]) => (
                    <SelectItem key={key} value={key}>{def.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Produto</Label>
              <Select value={form.product_id || ""} onValueChange={v => setForm({ ...form, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} (saldo: {p.stock_quantity || 0})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{form.tipo === "ajuste_inventario" ? "Quantidade do ajuste (use negativo para reduzir, ex: -2)" : "Quantidade"}</Label>
              <Input type="number" step="1" value={form.quantidade} onChange={e => setForm({ ...form, quantidade: e.target.value })} placeholder={form.tipo === "ajuste_inventario" ? "+3 ou -2" : "1"} />
              {form.tipo !== "ajuste_inventario" && <p className="text-[10px] text-muted-foreground mt-1">Este tipo sempre reduz o estoque.</p>}
            </div>
            <div>
              <Label>Justificativa (obrigatória)</Label>
              <textarea
                className="w-full min-h-[60px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none"
                value={form.motivo}
                onChange={e => setForm({ ...form, motivo: e.target.value })}
                placeholder="Ex: Contagem de inventário de julho; caixa danificada no transporte; máquina montada para o showroom..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvarMovimento} disabled={saving}>{saving ? "Registrando..." : "Registrar Movimento"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Kardex do Produto */}
      <Dialog open={!!kardexProduct} onOpenChange={(o) => !o && setKardexProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Kardex — {kardexProduct?.name}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">Saldo atual: <span className="font-bold text-foreground">{kardexProduct?.stock_quantity || 0}</span> · Extrato completo de movimentações, do mais recente ao mais antigo.</p>
          {kardexMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma movimentação registrada para este produto ainda.</p>
          ) : (
            <table className="w-full text-sm mt-2">
              <thead><tr className="border-b border-border">
                <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs">Data</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground text-xs">Tipo</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground text-xs">Qtd</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground text-xs">Saldo</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs">Origem / Motivo</th>
              </tr></thead>
              <tbody>
                {kardexMovements.map(m => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-2 text-xs whitespace-nowrap">{fmtData(m.created_date)}</td>
                    <td className="px-2 py-2 text-center"><TipoBadge tipo={m.tipo} /></td>
                    <td className={`px-2 py-2 text-right font-bold ${m.quantidade > 0 ? "text-success" : "text-destructive"}`}>{m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}</td>
                    <td className="px-2 py-2 text-right">{m.saldo_anterior} → <span className="font-medium">{m.saldo_novo}</span></td>
                    <td className="px-2 py-2 text-xs text-muted-foreground max-w-[200px] truncate" title={`${m.origem_ref || ""} ${m.motivo || ""}`}>{[m.origem_ref, m.motivo].filter(Boolean).join(" — ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
