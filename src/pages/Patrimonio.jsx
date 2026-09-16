import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Search, Landmark, Pencil, Trash2, Loader2, Gem, TrendingUp, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import { getCustoVigente, formatBRL } from "@/lib/pricingCalc";

// Patrimônio & Valor da Empresa — o "suprassumo":
// (1) cadastro de ativos físicos com depreciação linear (taxas da Receita);
// (2) avaliação PATRIMONIAL (o que a empresa TEM: caixa + a receber + estoque
//     + na China + bens − a pagar);
// (3) avaliação POR LUCRO (múltiplo 1×–15× do lucro anual — a régua do mercado
//     de compra e venda de empresas).

const CATEGORIAS = [
  { value: "maquinas", label: "Máquinas e equipamentos", taxa: 10 },
  { value: "informatica", label: "Informática", taxa: 20 },
  { value: "moveis", label: "Móveis e utensílios", taxa: 10 },
  { value: "veiculos", label: "Veículos", taxa: 20 },
  { value: "ferramentas", label: "Ferramentas", taxa: 15 },
  { value: "instalacoes", label: "Instalações (ar-cond., elétrica...)", taxa: 10 },
  { value: "outros", label: "Outros", taxa: 10 },
];
const catInfo = (v) => CATEGORIAS.find(c => c.value === v) || CATEGORIAS[CATEGORIAS.length - 1];
const num = (v) => parseFloat(v) || 0;

// Valor contábil: aquisição − depreciação linear até hoje (nunca abaixo de 10%
// do valor de aquisição — valor residual). "Valor de mercado" manda se preenchido.
function valorAtual(item) {
  if (num(item.valor_mercado) > 0) return num(item.valor_mercado) * (item.quantidade || 1);
  const aquisicao = num(item.valor_aquisicao) * (item.quantidade || 1);
  if (!item.data_aquisicao) return aquisicao;
  const anos = Math.max(0, (Date.now() - new Date(item.data_aquisicao + "T12:00:00").getTime()) / (365.25 * 24 * 3600 * 1000));
  const taxa = (num(item.taxa_depreciacao_aa) || catInfo(item.categoria).taxa) / 100;
  return Math.max(aquisicao * 0.1, aquisicao * (1 - taxa * anos));
}

export default function Patrimonio() {
  const [tab, setTab] = useState("valor");
  const [itens, setItens] = useState([]);
  const [entries, setEntries] = useState([]);
  const [products, setProducts] = useState([]);
  const [operacoes, setOperacoes] = useState([]);
  const [vc, setVc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contasCaixa, setContasCaixa] = useState([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [salvandoVc, setSalvandoVc] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [pat, ent, prods, ops, vcs] = await Promise.all([
      base44.entities.Patrimonio.list("-created_date", 500),
      base44.entities.FinancialEntry.list("-created_date", 2000),
      base44.entities.Product.list("-created_date", 1000),
      base44.entities.ImportOperation.list("-created_date", 100).catch(() => []),
      base44.entities.ValuationConfig.list("-updated_date", 5).catch(() => []),
    ]);
    // Contas de caixa do Financeiro: é de onde sai o "Caixa e bancos" automático (Mauricio 03/09:
    // "o valor recebido está faltando nesta tela")
    const cas = await base44.entities.CashAccount.list("nome", 50).catch(() => []);
    setContasCaixa(cas || []);
    setItens(pat || []);
    setEntries(ent || []);
    setProducts(prods || []);
    setOperacoes(ops || []);
    setVc((vcs || [])[0] || { id: "robooster", caixa_bancos: 0, ajuste_china: 0, multiplo: 3 });
    setLoading(false);
  };

  // ==== Números automáticos vindos do próprio ERP ====
  const auto = useMemo(() => {
    const emAberto = (e) => e.status === "pending" || e.status === "overdue";
    const aReceber = entries.filter(e => e.type === "receivable" && emAberto(e)).reduce((s, e) => s + num(e.amount), 0);
    const aPagar = entries.filter(e => e.type === "payable" && emAberto(e)).reduce((s, e) => s + num(e.amount), 0);
    const estoque = products.reduce((s, p) => s + (p.stock_quantity || 0) * getCustoVigente(p), 0);
    // Dinheiro na China: remessas PAGAS de operações que ainda não viraram
    // estoque (status simulação) — pagou o fornecedor, a mercadoria ainda não entrou.
    const opsSimulacao = operacoes.filter(o => !["realizada", "concluida"].includes(o.status));
    const naChina = opsSimulacao.reduce((s, o) =>
      s + (o.remessas || []).reduce((t, r) => t + (num(r.valor_usd) * num(r.cotacao) + num(r.taxas_brl)), 0), 0);
    const patrimonioFisico = itens.filter(i => i.ativo !== false).reduce((s, i) => s + valorAtual(i), 0);

    // Lucro médio mensal sugerido: últimos 6 meses de contas PAGAS (recebido − pago)
    // Média dos ÚLTIMOS 6 MESES FECHADOS — o mês corrente parcial diluiria a média
    const mesAtualYm = new Date().toISOString().slice(0, 7);
    const limite = new Date();
    limite.setMonth(limite.getMonth() - 6);
    const limiteYm = limite.toISOString().slice(0, 7);
    const meses = {};
    entries.filter(e => e.status === "paid" && (e.payment_date || e.due_date)).forEach(e => {
      const d = (e.payment_date || e.due_date).slice(0, 7);
      if (d >= mesAtualYm || d < limiteYm) return;
      meses[d] ??= 0;
      meses[d] += e.type === "receivable" ? num(e.amount) : -num(e.amount);
    });
    const vals = Object.values(meses);
    const lucroSugerido = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

    // Caixa e bancos pelo Financeiro: saldo inicial + recebidos − pagos, por conta (mesma conta do
    // "Saldos por conta"). Só lançamentos PAGOS com conta apontada.
    const contas = contasCaixa.filter(c => c.ativo !== false).map(c => {
      const pagos = entries.filter(e => e.account_id === c.id && e.status === "paid");
      const entrou = pagos.filter(e => e.type === "receivable").reduce((s, e) => s + num(e.amount), 0);
      const saiu = pagos.filter(e => e.type === "payable").reduce((s, e) => s + num(e.amount), 0);
      return { nome: c.nome, saldo: num(c.saldo_inicial) + entrou - saiu };
    });
    const caixaContas = contas.reduce((s, c) => s + c.saldo, 0);
    const pagosSemConta = entries.filter(e => !e.account_id && e.status === "paid").length;

    return { aReceber, aPagar, estoque, naChina, patrimonioFisico, lucroSugerido, mesesComDados: vals.length, caixaContas, contas, pagosSemConta };
  }, [entries, products, operacoes, itens, contasCaixa]);

  // Caixa: o que você digitar manda; vazio ou zero = saldo das contas do Financeiro
  const caixaManual = num(vc?.caixa_bancos);
  const caixa = caixaManual > 0 ? caixaManual : auto.caixaContas;
  const ajusteChina = num(vc?.ajuste_china);
  const lucroMensal = vc?.lucro_mensal != null && vc.lucro_mensal !== "" ? num(vc.lucro_mensal) : Math.max(0, Math.round(auto.lucroSugerido));
  const multiplo = Math.min(15, Math.max(1, num(vc?.multiplo) || 3));
  const lucroAnual = lucroMensal * 12;
  const valorPorLucro = lucroAnual * multiplo;
  const valorPatrimonial = caixa + auto.aReceber + auto.estoque + auto.naChina + ajusteChina + auto.patrimonioFisico - auto.aPagar;

  const salvarVc = async (patch) => {
    const novo = { ...vc, ...patch };
    setVc(novo);
    setSalvandoVc(true);
    try {
      const { id, ...dados } = novo;
      await base44.entities.ValuationConfig.update(vc.id || "robooster", dados)
        .catch(() => base44.entities.ValuationConfig.create({ id: "robooster", ...dados }));
    } catch (err) {
      alert(`Não foi possível salvar o valor — ele voltará ao anterior no próximo F5. (${err.message})`);
    }
    setSalvandoVc(false);
  };

  // ==== CRUD do patrimônio ====
  const openNew = () => {
    setEditing(null);
    setForm({ categoria: "maquinas", quantidade: 1, taxa_depreciacao_aa: 10, ativo: true });
    setDialogOpen(true);
  };
  const openEdit = (i) => { setEditing(i); setForm({ ...i }); setDialogOpen(true); };
  const f = (campo) => (e) => {
    const val = e.target.type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value;
    setForm(prev => ({ ...prev, [campo]: val }));
  };
  const handleSave = async () => {
    if (!form.nome?.trim()) { alert("Dê um nome ao bem."); return; }
    try {
      if (editing) await base44.entities.Patrimonio.update(editing.id, form);
      else await base44.entities.Patrimonio.create(form);
      setDialogOpen(false);
      loadData();
    } catch (err) { alert(`Não foi possível salvar: ${err.message}`); }
  };
  const handleDelete = async (i) => {
    if (!confirm(`Excluir "${i.nome}" do patrimônio?`)) return;
    await base44.entities.Patrimonio.delete(i.id);
    loadData();
  };

  const filtrados = itens.filter(i => !search || i.nome?.toLowerCase().includes(search.toLowerCase()) || i.localizacao?.toLowerCase().includes(search.toLowerCase()));
  const porCategoria = useMemo(() => {
    const m = {};
    itens.filter(i => i.ativo !== false).forEach(i => {
      const c = catInfo(i.categoria).label;
      m[c] = (m[c] || 0) + valorAtual(i);
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [itens]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div>
      <PageHeader title="Patrimônio & Valor da Empresa" description="O que a empresa TEM e quanto ela VALE — patrimônio real e avaliação por lucro" />

      <div className="flex gap-2 mb-4">
        {[["valor", "💎 Valor da Empresa"], ["bens", `🏭 Cadastro do Patrimônio (${itens.length})`]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>{l}</button>
        ))}
      </div>

      {tab === "valor" ? (
        <div className="space-y-4">
          {/* ===== AVALIAÇÃO PATRIMONIAL ===== */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-heading font-semibold text-sm mb-1 flex items-center gap-2"><Landmark className="w-4 h-4 text-primary" /> Avaliação patrimonial — o que a empresa TEM hoje</h3>
            <p className="text-[11px] text-muted-foreground mb-3">Método "asset-based": soma tudo que existe e desconta o que deve. É o piso do valor da empresa.</p>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
              <div className="rounded-lg border border-border p-3">
                <Label className="text-xs text-muted-foreground">💵 Caixa e bancos</Label>
                <p className="font-semibold text-success mt-1">{formatBRL(caixa)}</p>
                <p className="text-[9px] text-muted-foreground mt-1">{caixaManual > 0 ? "Valor informado à mão (apague para voltar ao Financeiro)" : `Pelo Financeiro: ${auto.contas.map(c => `${c.nome} ${formatBRL(c.saldo)}`).join(" · ") || "sem contas"}`}{auto.pagosSemConta > 0 ? ` · ${auto.pagosSemConta} pago(s) sem conta ficam de fora` : ""}</p>
                <Input type="number" step="0.01" className="mt-1 h-8 text-xs" value={vc?.caixa_bancos || ""} onChange={e => setVc(prev => ({ ...prev, caixa_bancos: e.target.value }))} onBlur={e => salvarVc({ caixa_bancos: parseFloat(e.target.value) || 0 })} placeholder="Sobrescrever com o saldo real (conta + aplicações)" />
              </div>
              <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">📥 Contas a receber</p><p className="font-semibold text-success mt-1">{formatBRL(auto.aReceber)}</p><p className="text-[9px] text-muted-foreground mt-1">Em aberto no Financeiro</p></div>
              <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">📦 Estoque (a custo)</p><p className="font-semibold mt-1">{formatBRL(auto.estoque)}</p><p className="text-[9px] text-muted-foreground mt-1">Custo vigente × quantidade</p></div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Ship className="w-3 h-3" /> Na China / trânsito</p>
                <p className="font-semibold mt-1">{formatBRL(auto.naChina + ajusteChina)}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap">ajuste ±</span>
                  <Input type="number" step="0.01" className="h-6 text-[10px]" value={vc?.ajuste_china ?? ""} onChange={e => setVc(prev => ({ ...prev, ajuste_china: e.target.value }))} onBlur={e => salvarVc({ ajuste_china: parseFloat(e.target.value) || 0 })} placeholder="0" />
                </div>
              </div>
              <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">🏭 Patrimônio físico</p><p className="font-semibold mt-1">{formatBRL(auto.patrimonioFisico)}</p><p className="text-[9px] text-muted-foreground mt-1">{itens.filter(i => i.ativo !== false).length} bens, já depreciados</p></div>
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3"><p className="text-xs text-muted-foreground">📤 Contas a pagar</p><p className="font-semibold text-destructive mt-1">−{formatBRL(auto.aPagar)}</p><p className="text-[9px] text-muted-foreground mt-1">Em aberto no Financeiro</p></div>
            </div>
            <div className="mt-3 rounded-xl bg-sidebar text-sidebar-foreground p-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-sidebar-foreground/60">Valor patrimonial (líquido)</p>
                <p className="text-[10px] text-sidebar-foreground/50">caixa + a receber + estoque + China + bens − a pagar</p>
              </div>
              <p className="text-3xl font-heading font-bold">{formatBRL(valorPatrimonial)}</p>
            </div>
          </div>

          {/* ===== AVALIAÇÃO POR LUCRO ===== */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-heading font-semibold text-sm mb-1 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Avaliação por lucro — quanto o mercado pagaria</h3>
            <p className="text-[11px] text-muted-foreground mb-3">Método do múltiplo: empresas são compradas por um múltiplo do lucro ANUAL. Pequenas operações saem por 2–3×; com contratos recorrentes e marca, 4–6×; negócios escaláveis chegam a 10×+.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <Label className="text-xs">Lucro médio mensal (R$)</Label>
                <Input type="number" step="0.01" className="font-semibold" value={vc?.lucro_mensal ?? ""} onChange={e => setVc(prev => ({ ...prev, lucro_mensal: e.target.value }))} onBlur={e => salvarVc({ lucro_mensal: e.target.value === "" ? null : parseFloat(e.target.value) || 0 })} placeholder={String(Math.max(0, Math.round(auto.lucroSugerido)))} />
                <p className="text-[9px] text-muted-foreground mt-1">{auto.mesesComDados > 0 ? `Sugestão do ERP: ${formatBRL(Math.max(0, auto.lucroSugerido))}/mês (média de ${auto.mesesComDados} meses de contas pagas)` : "Sem histórico suficiente — informe manualmente"}. Vazio = usa a sugestão.</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Lucro anualizado</p><p className="font-semibold text-lg mt-1">{formatBRL(lucroAnual)}</p></div>
              <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Múltiplo escolhido</p><p className="font-semibold text-lg mt-1">{multiplo.toFixed(1)}× o lucro anual</p></div>
            </div>
            <div className="px-2">
              <input type="range" min="1" max="15" step="0.5" value={multiplo}
                onChange={e => setVc(prev => ({ ...prev, multiplo: parseFloat(e.target.value) }))}
                onMouseUp={e => salvarVc({ multiplo: parseFloat(e.target.value) })}
                onTouchEnd={e => salvarVc({ multiplo: parseFloat(e.target.value) })}
                onBlur={e => salvarVc({ multiplo: parseFloat(e.target.value) })}
                onKeyUp={e => ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key) && salvarVc({ multiplo: parseFloat(e.target.value) })}
                className="w-full accent-primary" />
              <div className="flex justify-between text-[9px] text-muted-foreground -mt-1">
                <span>1× liquidação</span><span>2–3× operação simples</span><span>4–6× marca + recorrência</span><span>8–10× escala</span><span>15×</span>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider opacity-80">Valor pelo lucro ({multiplo.toFixed(1)}×)</p>
                <p className="text-[10px] opacity-70">{formatBRL(lucroAnual)}/ano × {multiplo.toFixed(1)}</p>
              </div>
              <p className="text-3xl font-heading font-bold">{formatBRL(valorPorLucro)}</p>
            </div>
          </div>

          {/* ===== LEITURA FINAL ===== */}
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
            <h3 className="font-heading font-semibold text-sm flex items-center gap-2"><Gem className="w-4 h-4 text-primary" /> Leitura final</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2 text-sm">
              <div><p className="text-xs text-muted-foreground">Piso (patrimônio líquido)</p><p className="font-bold text-lg">{formatBRL(valorPatrimonial)}</p></div>
              <div><p className="text-xs text-muted-foreground">Pelo lucro ({multiplo.toFixed(1)}×)</p><p className="font-bold text-lg">{formatBRL(valorPorLucro)}</p></div>
              <div><p className="text-xs text-muted-foreground">Faixa de negociação</p><p className="font-bold text-lg text-primary">{formatBRL(Math.min(valorPatrimonial, valorPorLucro))} – {formatBRL(Math.max(valorPatrimonial, valorPorLucro))}</p></div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Como o mercado lê: se o múltiplo do lucro fica ABAIXO do patrimônio, o comprador paga pelo patrimônio (e o lucro é o bônus). Se fica ACIMA, a diferença é o <em>goodwill</em> — marca, carteira de clientes e operação rodando. Numa venda real, o estoque e o caixa costumam ser negociados à parte do ponto.</p>
            {salvandoVc && <p className="text-[10px] text-muted-foreground mt-1">salvando…</p>}
          </div>
        </div>
      ) : (
        <>
          {/* ===== CADASTRO DO PATRIMÔNIO ===== */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative max-w-xs flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar bem ou local..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {porCategoria.slice(0, 3).map(([c, v]) => <span key={c} className="text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground">{c}: {formatBRL(v)}</span>)}
              <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold">Total: {formatBRL(auto.patrimonioFisico)}</span>
              <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo bem</Button>
            </div>
          </div>

          {filtrados.length === 0 ? (
            <EmptyState icon={Landmark} title="Nenhum bem cadastrado" description="Cadastre o patrimônio: máquinas, CNC, empilhadeira, computadores, móveis, ar-condicionado..." actionLabel="Novo bem" onAction={openNew} />
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Bem</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Categoria</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Qtd</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Aquisição</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor atual</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Local</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr></thead>
                  <tbody>
                    {filtrados.map(i => (
                      <tr key={i.id} className={`border-b border-border last:border-0 hover:bg-muted/20 ${i.ativo === false ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3"><span className="font-medium">{i.nome}</span>{i.numero_serie && <span className="block text-[10px] text-muted-foreground font-mono">{i.numero_serie}</span>}</td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs">{catInfo(i.categoria).label}</td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">{i.quantidade || 1}</td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell text-muted-foreground">{formatBRL(num(i.valor_aquisicao) * (i.quantidade || 1))}{i.data_aquisicao && <span className="block text-[9px]">{i.data_aquisicao.split("-").reverse().join("/")}</span>}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatBRL(valorAtual(i))}{num(i.valor_mercado) > 0 && <span className="block text-[9px] text-primary">valor de mercado</span>}</td>
                        <td className="px-4 py-3 hidden lg:table-cell text-xs">{i.localizacao || "—"}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={() => openEdit(i)} className="p-1.5 hover:bg-muted rounded-lg"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                          <button onClick={() => handleDelete(i)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-4 h-4 text-destructive" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="bg-muted/30 font-semibold">
                    <td className="px-4 py-3" colSpan={4}>TOTAL (bens ativos, valor atual)</td>
                    <td className="px-4 py-3 text-right">{formatBRL(auto.patrimonioFisico)}</td>
                    <td colSpan={2}></td>
                  </tr></tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing ? "Editar bem" : "Novo bem do patrimônio"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="col-span-2"><Label>Nome do bem *</Label><Input value={form.nome || ""} onChange={f("nome")} placeholder="Ex: CNC Router 1325, Empilhadeira, Ar-condicionado 24k" /></div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.categoria || "maquinas"} onValueChange={v => setForm(prev => ({ ...prev, categoria: v, taxa_depreciacao_aa: catInfo(v).taxa }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Quantidade</Label><Input type="number" min="1" value={form.quantidade ?? 1} onChange={f("quantidade")} /></div>
            <div><Label>Valor de aquisição (un., R$)</Label><Input type="number" step="0.01" value={form.valor_aquisicao ?? ""} onChange={f("valor_aquisicao")} /></div>
            <div><Label>Data de aquisição</Label><Input type="date" value={form.data_aquisicao || ""} onChange={f("data_aquisicao")} /></div>
            <div>
              <Label>Depreciação (% ao ano)</Label>
              <Input type="number" step="0.5" value={form.taxa_depreciacao_aa ?? ""} onChange={f("taxa_depreciacao_aa")} />
              <p className="text-[10px] text-muted-foreground mt-0.5">Preenchida pela categoria (tabela da Receita) — pode ajustar.</p>
            </div>
            <div>
              <Label>Valor de mercado (un., R$)</Label>
              <Input type="number" step="0.01" value={form.valor_mercado ?? ""} onChange={f("valor_mercado")} placeholder="opcional" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Se preenchido, vale no lugar da depreciação.</p>
            </div>
            <div><Label>Nº de série / patrimônio</Label><Input value={form.numero_serie || ""} onChange={f("numero_serie")} /></div>
            <div><Label>Localização</Label><Input value={form.localizacao || ""} onChange={f("localizacao")} placeholder="Ex: Galpão, Escritório" /></div>
            <div className="col-span-2"><Label>Observações</Label><Input value={form.observacoes || ""} onChange={f("observacoes")} /></div>
            {editing && (
              <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.ativo === false} onChange={e => setForm(prev => ({ ...prev, ativo: !e.target.checked }))} />
                Baixado (vendido/descartado) — sai da soma do patrimônio
              </label>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
