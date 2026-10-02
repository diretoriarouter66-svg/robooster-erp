import React, { useState, useEffect, useMemo } from "react";
import { base44, supabase } from "@/api/base44Client";
import { ListChecks, TrendingUp, TrendingDown, ArrowLeftRight, HelpCircle, Check, Pencil, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PageHeader from "../components/shared/PageHeader";
import StatCard from "../components/shared/StatCard";
import EmptyState from "../components/shared/EmptyState";

// 02/10/2026 — CONCILIAÇÃO DO CAIXA. Tudo que vem dos extratos de fora (banco, fatura do cartão, PayPal e, em breve,
// Mercado Pago) cai em extrato_movimentos. Aqui o dono vê o mês de cada conta por categoria, confirma ou corrige a
// categoria de cada lançamento e ensina a regra ("lembrar para os próximos").
const brl = (v) => (parseFloat(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v) => parseFloat(v) || 0;
const dia = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");
const mesDe = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
// Na fatura do cartão o que importa é a fatura (vencimento), não o mês de cada compra.
const periodoDe = (m) => (m.fonte === "cartao" ? m.referencia || "fatura" : mesDe(m.data));
const rotuloPeriodo = (p) => (/^\d{4}-\d{2}$/.test(p) ? `${p.slice(5)}/${p.slice(0, 4)}` : p.replace(/^fatura (\d{4})-(\d{2})-(\d{2})$/, "fatura que vence em $3/$2/$1"));
const TIPO = { entrada: "Entrada", venda: "Entrada", saida: "Saída", taxa: "Saída", estorno: "Estorno", transferencia: "Transferência", saque: "Transferência", outro: "Outro" };
const ehTransferencia = (m) => ["transferencia", "saque"].includes(m.tipo);
// Trecho que identifica quem é a outra parte: o CNPJ/CPF do fim do histórico; sem documento, o histórico sem números.
const chaveDe = (m) => m.referencia && /\d{2,3}\.\d{3}\.\d{3}/.test(m.referencia) ? m.referencia : String(m.descricao || "").replace(/\d{2}\/\d{2}/g, "").replace(/\s+/g, " ").trim().slice(0, 40);

export default function Conciliacao() {
  const [movs, setMovs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conta, setConta] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [edit, setEdit] = useState(null); // { id, categoria, lembrar }
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = async () => {
    const m = await base44.entities.ExtratoMovimento.list("-data", 5000);
    setMovs(m || []);
    return m || [];
  };
  useEffect(() => {
    (async () => {
      try {
        const m = await carregar();
        const banco = m.find((x) => x.fonte === "banco") || m[0];
        if (banco) { setConta(banco.conta); setPeriodo(periodoDe(banco)); }
      } finally { setLoading(false); }
    })();
  }, []);

  const contas = useMemo(() => Array.from(new Set(movs.map((m) => m.conta))).sort(), [movs]);
  const periodos = useMemo(() => Array.from(new Set(movs.filter((m) => m.conta === conta).map(periodoDe))).sort().reverse(), [movs, conta]);
  useEffect(() => { if (conta && periodos.length && !periodos.includes(periodo)) setPeriodo(periodos[0]); }, [conta, periodos]); // eslint-disable-line react-hooks/exhaustive-deps
  const categorias = useMemo(() => Array.from(new Set(movs.map((m) => m.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [movs]);

  const doPeriodo = useMemo(() => movs.filter((m) => m.conta === conta && periodoDe(m) === periodo), [movs, conta, periodo]);
  const ehCartao = doPeriodo.some((m) => m.fonte === "cartao");
  const entradas = doPeriodo.filter((m) => !ehTransferencia(m) && num(m.valor) > 0);
  const saidas = doPeriodo.filter((m) => !ehTransferencia(m) && num(m.valor) < 0);
  const transf = doPeriodo.filter(ehTransferencia);
  const soma = (l) => l.reduce((t, m) => t + num(m.valor), 0);
  const semCategoria = doPeriodo.filter((m) => !m.categoria);
  const aConfirmar = doPeriodo.filter((m) => m.categoria && !m.categoria_confirmada);

  const porCategoria = (l) => {
    const g = new Map();
    for (const m of l) { const k = m.categoria || "Sem categoria"; const a = g.get(k) || { cat: k, n: 0, total: 0, pend: 0 }; a.n += 1; a.total += num(m.valor); if (!m.categoria_confirmada) a.pend += 1; g.set(k, a); }
    return Array.from(g.values()).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  };

  const linhas = doPeriodo.filter((m) => {
    if (filtro === "sem" && m.categoria) return false;
    if (filtro === "confirmar" && (!m.categoria || m.categoria_confirmada)) return false;
    if (filtro === "entradas" && !(num(m.valor) > 0 && !ehTransferencia(m))) return false;
    if (filtro === "saidas" && !(num(m.valor) < 0 && !ehTransferencia(m))) return false;
    if (filtro === "transf" && !ehTransferencia(m)) return false;
    if (busca && !`${m.descricao} ${m.categoria || ""} ${m.contraparte || ""}`.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  }).sort((a, b) => String(a.data).localeCompare(String(b.data)));

  const confirmar = async (m) => {
    setSalvando(true); setErro("");
    try { await base44.entities.ExtratoMovimento.update(m.id, { categoria_confirmada: true }); await carregar(); }
    catch (e) { setErro("Não foi possível gravar: " + (e.message || "erro")); }
    setSalvando(false);
  };
  const salvarEdicao = async (m) => {
    const cat = (edit.categoria || "").trim();
    if (!cat) { setErro("Escreva a categoria."); return; }
    setSalvando(true); setErro("");
    try {
      await base44.entities.ExtratoMovimento.update(m.id, { categoria: cat, categoria_confirmada: true });
      if (edit.lembrar) {
        const chave = chaveDe(m);
        // direto na tabela: extrato_regras tem id numérico próprio (não segue o molde das entidades do ERP)
        const { error } = await supabase.from("extrato_regras").insert({ fonte: m.fonte, contem: chave, tipo: m.tipo, categoria: cat, confirmada: true, observacao: "ensinada pela tela de conciliação" });
        if (error) throw new Error(error.message);
        // aplica já aos outros lançamentos da mesma origem que ainda não foram confirmados
        const iguais = movs.filter((x) => x.id !== m.id && x.fonte === m.fonte && !x.categoria_confirmada && `${x.descricao} ${x.referencia || ""}`.toUpperCase().includes(chave.toUpperCase()));
        for (const x of iguais) await base44.entities.ExtratoMovimento.update(x.id, { categoria: cat, categoria_confirmada: true });
      }
      setEdit(null); await carregar();
    } catch (e) { setErro("Não foi possível gravar: " + (e.message || "erro")); }
    setSalvando(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  const Quadro = ({ titulo, lista, cor }) => (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-heading font-semibold text-sm">{titulo}</h3>
        <span className={`font-semibold ${cor}`}>{brl(soma(lista))}</span>
      </div>
      {lista.length === 0 ? <p className="text-xs text-muted-foreground">Nada neste período.</p> : (
        <table className="w-full text-sm">
          <tbody>
            {porCategoria(lista).map((c) => (
              <tr key={c.cat} className="border-t border-border/60">
                <td className="py-1.5 pr-2">{c.cat}{c.pend > 0 && c.cat !== "Sem categoria" && <span className="ml-2 text-[10px] text-warning">a confirmar</span>}</td>
                <td className="py-1.5 px-2 text-right text-xs text-muted-foreground whitespace-nowrap">{c.n}×</td>
                <td className="py-1.5 text-right whitespace-nowrap font-medium">{brl(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title="Conciliação" description="O que entrou e saiu de cada conta, pelos extratos, com a categoria de cada lançamento" />

      {movs.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nenhum extrato lido ainda" description="Os movimentos aparecem aqui depois que um extrato de banco, cartão, PayPal ou Mercado Pago é lido." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Select value={conta} onValueChange={setConta}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Conta" /></SelectTrigger>
              <SelectContent>{contas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>{periodos.map((p) => <SelectItem key={p} value={p}>{rotuloPeriodo(p)}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard icon={TrendingUp} label={`${ehCartao ? "Estornos e créditos" : "Entradas"} (${entradas.length})`} value={brl(soma(entradas))} color="success" />
            <StatCard icon={TrendingDown} label={`${ehCartao ? "Compras e encargos" : "Saídas"} (${saidas.length})`} value={brl(soma(saidas))} color="destructive" />
            {ehCartao
              ? <StatCard icon={ArrowLeftRight} label="Total da fatura" value={brl(-soma(doPeriodo))} subtitle="compras e encargos menos estornos: é o valor que sai do banco no vencimento" />
              : <StatCard icon={ArrowLeftRight} label={`Transferências entre contas (${transf.length})`} value={brl(soma(transf))} subtitle="aplicação, resgate, fatura do cartão, saques: não são receita nem despesa" />}
            <StatCard icon={HelpCircle} label="Para você olhar" value={semCategoria.length + aConfirmar.length} color={semCategoria.length ? "destructive" : aConfirmar.length ? "warning" : "success"} subtitle={`${semCategoria.length} sem categoria · ${aConfirmar.length} com categoria sugerida`} />
          </div>

          <div className={`grid grid-cols-1 ${ehCartao ? "lg:grid-cols-2" : "lg:grid-cols-3"} gap-3 mb-6`}>
            <Quadro titulo={ehCartao ? "Estornos e créditos por categoria" : "Entradas por categoria"} lista={entradas} cor="text-success" />
            <Quadro titulo={ehCartao ? "Compras e encargos por categoria" : "Saídas por categoria"} lista={saidas} cor="text-destructive" />
            {!ehCartao && <Quadro titulo="Transferências entre contas" lista={transf} cor="" />}
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-3">
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os lançamentos</SelectItem>
                <SelectItem value="sem">Sem categoria</SelectItem>
                <SelectItem value="confirmar">Categoria sugerida, a confirmar</SelectItem>
                <SelectItem value="entradas">Entradas</SelectItem>
                <SelectItem value="saidas">Saídas</SelectItem>
                <SelectItem value="transf">Transferências</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar no histórico..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
            </div>
            <span className="text-xs text-muted-foreground">{linhas.length} lançamento{linhas.length === 1 ? "" : "s"} · {brl(soma(linhas))}</span>
          </div>
          {erro && <p className="text-destructive text-sm mb-2">{erro}</p>}

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Histórico</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categoria</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
                </tr></thead>
                <tbody>
                  {linhas.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum lançamento nesta visão.</td></tr>}
                  {linhas.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0 align-top hover:bg-muted/20">
                      <td className="px-4 py-2.5 whitespace-nowrap">{dia(m.data)}</td>
                      <td className="px-4 py-2.5 text-xs max-w-md">{m.descricao}{m.contraparte && m.fonte !== "banco" ? <span className="text-muted-foreground"> · {m.contraparte}</span> : null}</td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap">{TIPO[m.tipo] || m.tipo}</td>
                      <td className="px-4 py-2.5 text-xs">
                        {edit?.id === m.id ? (
                          <div className="space-y-1.5 min-w-[260px]">
                            <Input list="categorias-extrato" autoFocus value={edit.categoria} onChange={(e) => setEdit({ ...edit, categoria: e.target.value })} placeholder="Categoria" className="h-8 text-xs" />
                            <label className="flex items-start gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                              <input type="checkbox" checked={edit.lembrar} onChange={(e) => setEdit({ ...edit, lembrar: e.target.checked })} className="mt-0.5" />
                              <span>Lembrar para os próximos lançamentos com “{chaveDe(m)}”</span>
                            </label>
                            <div className="flex gap-1.5">
                              <Button size="sm" className="h-7 text-xs" onClick={() => salvarEdicao(m)} disabled={salvando}>Gravar</Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEdit(null); setErro(""); }} disabled={salvando}>Voltar</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {m.categoria
                              ? <span className={`inline-flex px-2 py-0.5 rounded-full ${m.categoria_confirmada ? "bg-muted text-foreground" : "bg-warning/10 text-warning"}`} title={m.categoria_confirmada ? "Categoria confirmada" : "Categoria sugerida pelo sistema"}>{m.categoria}</span>
                              : <span className="inline-flex px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">sem categoria</span>}
                            {m.categoria && !m.categoria_confirmada && <button onClick={() => confirmar(m)} disabled={salvando} className="p-1 hover:bg-success/10 rounded" title="Está certa: confirmar"><Check className="w-3.5 h-3.5 text-success" /></button>}
                            <button onClick={() => { setErro(""); setEdit({ id: m.id, categoria: m.categoria || "", lembrar: true }); }} className="p-1 hover:bg-muted rounded" title="Mudar a categoria"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right whitespace-nowrap font-medium ${ehTransferencia(m) ? "text-muted-foreground" : num(m.valor) >= 0 ? "text-success" : "text-destructive"}`}>{brl(m.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <datalist id="categorias-extrato">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
        </>
      )}
    </div>
  );
}
