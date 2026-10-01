import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Upload, Loader2, Check, AlertTriangle, Plus, Trash2, Lock } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { lerXmlDI, itensDaDI } from "@/lib/diXml";
import { calcularFechamento, cambioMedioRemessas, sugerirCasamento, TIPOS_DESPESA } from "@/lib/fechamentoEngine";
import { atualizarCustoEntradaImportacao } from "@/lib/stockService";

/**
 * Fechamento da operação de importação com VALORES REAIS (01/10/2026, pedido do Mauricio:
 * "na hora do cálculo final vamos ter discrepância... automático 100% será muito difícil").
 *
 * O Simulador estima; esta tela recebe o que de fato aconteceu — XML da DI (impostos por
 * adição/item, frete, seguro, câmbio), ICMS do Draft, despesas reais do despachante e do
 * forwarder, acerto do numerário — rateia as "arestas" com o mesmo critério da planilha de
 * custo (valor FOB real) e regrava o custo de cada produto. Tudo fica guardado em
 * import_operations.fechamento (jsonb) e a operação passa a "fechada".
 */

const fmtBRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtUSD = (v) => "US$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (v) => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
const r2 = (v) => Math.round(n(v) * 100) / 100;

const PASSOS = [
  { id: 1, titulo: "DI" },
  { id: 2, titulo: "Itens" },
  { id: 3, titulo: "Despesas" },
  { id: 4, titulo: "Despachante" },
  { id: 5, titulo: "Resultado" },
];

export default function ImportFechamento() {
  const { opId } = useParams();
  const navigate = useNavigate();
  const [op, setOp] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [passo, setPasso] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");

  // Estado do fechamento (persistido em op.fechamento)
  const [di, setDi] = useState(null);                 // DI normalizada (lerXmlDI)
  const [cambioDi, setCambioDi] = useState("");
  const [itens, setItens] = useState([]);             // itens da operação enriquecidos
  const [despesas, setDespesas] = useState([]);
  const [acerto, setAcerto] = useState({ numerario_depositado_brl: "", debitado_real_brl: "", servicos_brl: "", observacao: "" });
  const [observacoes, setObservacoes] = useState("");

  const produtosPorId = useMemo(() => Object.fromEntries(produtos.map(p => [p.id, p])), [produtos]);
  const itensDI = useMemo(() => (di ? itensDaDI(di) : []), [di]);
  const cambioMedio = useMemo(() => cambioMedioRemessas(op?.remessas) || n(op?.cambio), [op]);

  useEffect(() => { carregar(); }, [opId]);

  const carregar = async () => {
    setLoading(true);
    try {
      const [o, prods, cfgs] = await Promise.all([
        base44.entities.ImportOperation.get(opId),
        base44.entities.Product.list("-created_date", 1000),
        base44.entities.ConfigTributaria.list("-created_date", 1),
      ]);
      setOp(o); setProdutos(prods || []); setConfig(cfgs?.[0] || null);
      const f = o?.fechamento || {};
      // Itens: começa do mix da operação; estimado = resultado do simulador (por product_id)
      const resultados = o?.resultado_importacao?.resultados || [];
      const estPorProd = Object.fromEntries(resultados.filter(r => r.produto?.id).map(r => [r.produto.id, r]));
      const base = (o?.itens || []).map((it, idx) => {
        const prod = (prods || []).find(p => p.id === it.product_id) || {};
        const est = estPorProd[it.product_id];
        const custoUsd = n(it.custo_usd) > 0 ? n(it.custo_usd) : n(est?.produto?.fob_unitario_usd) || n(prod.cost_fob_usd);
        const salvo = (f.itens || []).find(x => x.chave === `${it.product_id}-${idx}`) || {};
        return {
          chave: `${it.product_id}-${idx}`, product_id: it.product_id, nome: it.product_name || prod.name || "(sem nome)", sku: it.sku || prod.sku || "",
          qty: n(it.qty), custo_usd: custoUsd, declarado_op_usd: n(it.fob_declarado_usd), peso_kg: n(prod.weight_kg),
          nao_declarado: !!it.nao_declarado, nao_embarcou: !!salvo.nao_embarcou, di_chaves: salvo.di_chaves || [], icms_brl: salvo.icms_brl ?? "",
          estimado: est ? { custo_unitario: n(est.custo_unitario_formacao), ii: n(est.ii), ipi: n(est.ipi), pis: n(est.pis_imp), cofins: n(est.cofins_imp), icms: n(est.icms_imp), despesas: n(est.despesas_brl), frete: n(est.frete_rateado_brl) } : null,
        };
      });
      setItens(base);
      if (f.di) { setDi(f.di); setCambioDi(f.di.cambio_di || ""); }
      setDespesas(f.despesas || despesasIniciais(o, null));
      setAcerto(f.acerto || { numerario_depositado_brl: o?.numerario_enviado_brl || "", debitado_real_brl: "", servicos_brl: "", observacao: "" });
      setObservacoes(f.observacoes || "");
      if (f.passo) setPasso(f.passo);
    } catch (e) { setErro(`Não consegui carregar a operação: ${e.message}`); }
    setLoading(false);
  };

  /** Despesas previstas vêm do simulador; o real começa vazio (ou com o que a DI já traz). */
  function despesasIniciais(o, diLida) {
    const t = o?.resultado_importacao?.totais || {};
    const cambioPrev = n(o?.cambio_chegada) || n(o?.cambio);
    const linha = (tipo, previsto, real = "", rateavel = true) => ({ id: `${tipo}-${Math.random().toString(36).slice(2, 7)}`, tipo, descricao: TIPOS_DESPESA.find(x => x.tipo === tipo)?.rotulo || tipo, previsto_brl: r2(previsto), real_brl: real, rateavel, criterio: "valor" });
    const lista = [
      linha("frete_internacional", n(o?.frete_internacional_usd) * cambioPrev, diLida ? diLida.totais.frete_brl : ""),
      linha("siscomex", 0, diLida ? diLida.totais.siscomex : ""),
      linha("afrmm", 0, diLida ? diLida.totais.afrmm : ""),
      linha("armazenagem", 0),
      linha("frete_rodoviario", 0),
      linha("sda", 0),
      linha("desembaraco", n(t.despesas_brl)),
    ];
    if (n(o?.seguro_usd) > 0 || (diLida && diLida.totais.seguro_brl > 0)) lista.push(linha("seguro", n(o?.seguro_usd) * cambioPrev, diLida ? diLida.totais.seguro_brl : ""));
    return lista;
  }

  // ===== Passo 1: XML da DI =====
  const onXml = async (file) => {
    if (!file) return;
    setErro("");
    try {
      const texto = await file.text();
      const lida = lerXmlDI(texto);
      setDi(lida);
      setCambioDi(lida.cambio_di || "");
      // Despesas: preenche o real do que a DI traz, sem apagar o que já foi digitado
      setDespesas(prev => {
        const lista = prev.length ? [...prev] : despesasIniciais(op, lida);
        const set = (tipo, val) => { const i = lista.findIndex(d => d.tipo === tipo); if (i >= 0 && (lista[i].real_brl === "" || lista[i].real_brl == null)) lista[i] = { ...lista[i], real_brl: val }; };
        if (lida.totais.siscomex) set("siscomex", lida.totais.siscomex);
        if (lida.totais.afrmm) set("afrmm", lida.totais.afrmm);
        if (lida.totais.seguro_brl) set("seguro", lida.totais.seguro_brl);
        return lista;
      });
      // Casamento automático
      const flat = itensDaDI(lida);
      const sug = sugerirCasamento(itens, flat, produtosPorId);
      setItens(prev => prev.map(it => ({ ...it, di_chaves: (it.di_chaves?.length ? it.di_chaves : (sug[it.chave] || [])) })));
    } catch (e) { setErro(e.message); }
  };

  // ===== Passo 2: itens =====
  const toggleChave = (itChave, diChave) => {
    setItens(prev => prev.map(it => {
      if (it.chave !== itChave) return it;
      const tem = it.di_chaves.includes(diChave);
      return { ...it, di_chaves: tem ? it.di_chaves.filter(c => c !== diChave) : [...it.di_chaves, diChave] };
    }));
  };
  const chavesUsadasPor = useMemo(() => { const m = {}; for (const it of itens) for (const c of it.di_chaves || []) m[c] = it.chave; return m; }, [itens]);
  const updItem = (chave, campo, val) => setItens(prev => prev.map(it => it.chave === chave ? { ...it, [campo]: val } : it));

  // ===== Passo 3: despesas =====
  const updDesp = (id, campo, val) => setDespesas(prev => prev.map(d => d.id === id ? { ...d, [campo]: val } : d));
  const addDesp = () => setDespesas(prev => [...prev, { id: `outras-${Math.random().toString(36).slice(2, 7)}`, tipo: "outras", descricao: "Outras despesas", previsto_brl: 0, real_brl: "", rateavel: true, criterio: "valor" }]);
  const delDesp = (id) => setDespesas(prev => prev.filter(d => d.id !== id));

  // ===== Resultado =====
  const resultado = useMemo(() => {
    if (!itens.length) return null;
    return calcularFechamento({ itens, itensDI, despesas, cambioMedio, config: { regime: config?.regime || "simples", ipi_recuperavel: config?.ipi_recuperavel !== false } });
  }, [itens, itensDI, despesas, cambioMedio, config]);

  const totalDespReal = useMemo(() => despesas.reduce((s, d) => s + n(d.real_brl), 0), [despesas]);
  const impostosReais = resultado ? r2(resultado.totais.ii + resultado.totais.ipi + resultado.totais.pis + resultado.totais.cofins + resultado.totais.icms) : 0;
  const debitadoCalc = r2(impostosReais + totalDespReal);
  const saldoDespachante = r2(n(acerto.numerario_depositado_brl) - (n(acerto.debitado_real_brl) || debitadoCalc) - n(acerto.servicos_brl));

  const montarFechamento = (extra = {}) => ({
    passo, di: di ? { ...di, cambio_di: n(cambioDi) || di.cambio_di } : null,
    itens: itens.map(it => ({ chave: it.chave, product_id: it.product_id, nome: it.nome, qty: it.qty, custo_usd: it.custo_usd, di_chaves: it.di_chaves, icms_brl: it.icms_brl, nao_embarcou: it.nao_embarcou })),
    despesas, acerto, observacoes, cambio_medio: cambioMedio,
    resultado: resultado ? { linhas: resultado.linhas.map(l => ({ chave: l.chave, product_id: l.product_id, nome: l.nome, qty: l.qty, fob_usd: l.fob_usd, fob_brl: l.fob_brl, ii: l.ii, ipi: l.ipi, pis: l.pis, cofins: l.cofins, icms: l.icms, rateio_brl: l.rateio_brl, impostos_custo: l.impostos_custo, custo_total: l.custo_total, custo_unitario: l.custo_unitario, estimado_unitario: l.estimado_unitario, diferenca_unitaria: l.diferenca_unitaria, nao_embarcou: l.nao_embarcou })), totais: resultado.totais, avisos: resultado.avisos, regime: resultado.regime } : null,
    ...extra,
  });

  const salvarRascunho = async () => {
    setSalvando(true);
    try { await base44.entities.ImportOperation.update(op.id, { fechamento: montarFechamento() }); }
    catch (e) { alert(`Não consegui salvar: ${e.message}`); }
    setSalvando(false);
  };

  const confirmar = async () => {
    if (!resultado) return;
    const embarcados = resultado.linhas.filter(l => !l.nao_embarcou && l.qty > 0 && l.product_id);
    if (!embarcados.length) { alert("Nenhum item embarcado para fechar."); return; }
    if (!window.confirm(`Fechar a operação "${op.nome}" com os valores reais?\n\n• ${embarcados.length} produtos recebem o custo real no cadastro\n• movimentos de estoque desta operação são reavaliados\n• a operação passa a FECHADA\n\nO estimado continua guardado para comparação.`)) return;
    setConfirmando(true);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      // 1) Custo real no cadastro (cost_landed_brl) — cost_fob_usd continua o preço real pago
      await base44.entities.Product.bulkUpdate(embarcados.map(l => ({ id: l.product_id, cost_landed_brl: l.custo_unitario })));
      // 2) Histórico de custo (origem "fechamento")
      for (const l of embarcados) {
        try {
          await base44.entities.ProductCostHistory.create({ product_id: l.product_id, custo: l.custo_unitario, origem: "fechamento_importacao", referencia: `${op.nome} · DI ${di?.numero_di || "s/n"}`, data: hoje });
        } catch (e) { console.error("histórico de custo:", e); }
      }
      // 3) Kardex: reavalia o custo dos movimentos de entrada desta operação (e acerta quantidades)
      await atualizarCustoEntradaImportacao(op.id, embarcados.map(l => ({ produto: { id: l.product_id }, quantidade: l.qty, custo_unitario_formacao: l.custo_unitario })), op.nome);
      // 4) Financeiro: acerto com o despachante (reference_type import_fechamento; substitui o anterior)
      try {
        const antigas = await base44.entities.FinancialEntry.filter({ reference_id: op.id, reference_type: "import_fechamento" }, "-created_date", 50);
        for (const e of antigas || []) await base44.entities.FinancialEntry.delete(e.id);
        if (Math.abs(saldoDespachante) >= 0.01) {
          await base44.entities.FinancialEntry.create({
            type: saldoDespachante > 0 ? "receivable" : "payable", category: "import", reference_id: op.id, reference_type: "import_fechamento",
            amount: Math.abs(saldoDespachante), status: "pending", due_date: hoje, payment_method: "transfer",
            description: saldoDespachante > 0 ? `Ressarcimento do despachante (fechamento real) — ${op.nome}` : `Diferença a pagar ao despachante (fechamento real) — ${op.nome}`,
          });
        }
      } catch (e) { console.error("financeiro do fechamento:", e); }
      // 5) Grava o fechamento e o status
      await base44.entities.ImportOperation.update(op.id, { fechamento: montarFechamento({ fechado_em: new Date().toISOString(), passo: 5 }), status: "fechada" });
      alert("Operação fechada com os valores reais. Custos dos produtos atualizados.");
      navigate("/import-simulator");
    } catch (e) { alert(`Erro ao fechar: ${e.message}`); }
    setConfirmando(false);
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground p-6"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>;
  if (!op) return <div className="p-6 text-destructive">{erro || "Operação não encontrada."}</div>;
  const fechada = op.status === "fechada";

  return (
    <div>
      <PageHeader title={`Fechamento com valores reais — ${op.nome || "operação"}`}
        description={`Câmbio médio das remessas ${cambioMedio ? cambioMedio.toFixed(4) : "—"} · ${itens.length} itens · estimado ${fmtBRL(op.resultado_importacao?.totais?.custo_formacao_preco)}`}
        actions={<div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/import-simulator")}><ArrowLeft className="w-4 h-4 mr-1" /> Simulador</Button>
          {!fechada && <Button variant="outline" size="sm" onClick={salvarRascunho} disabled={salvando}>{salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar rascunho"}</Button>}
        </div>} />

      {fechada && <div className="mb-4 p-3 rounded-lg bg-primary/10 text-primary text-sm flex items-center gap-2"><Lock className="w-4 h-4" /> Operação fechada em {op.fechamento?.fechado_em ? new Date(op.fechamento.fechado_em).toLocaleString("pt-BR") : "—"}. Os valores abaixo são os reais gravados; para refazer, ajuste e confirme de novo.</div>}
      {erro && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{erro}</div>}

      {/* Passos */}
      <div className="flex flex-wrap gap-2 mb-5">
        {PASSOS.map(p => (
          <button key={p.id} onClick={() => setPasso(p.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${passo === p.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-muted/40"}`}>
            {p.id}. {p.titulo}
          </button>
        ))}
      </div>

      {/* ===== 1. DI ===== */}
      {passo === 1 && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border cursor-pointer hover:bg-muted/30 text-sm">
              <Upload className="w-4 h-4" /> {di ? "Trocar o XML da DI" : "Carregar o XML da DI (Siscomex)"}
              <input type="file" accept=".xml,text/xml" className="hidden" onChange={e => onXml(e.target.files?.[0])} />
            </label>
            <p className="text-xs text-muted-foreground">O despachante envia o XML junto com o extrato da DI. Aceita o layout do extrato (ListaDeclaracoes) e o de transmissão (ListaDeclaracoesTransmissao).</p>
          </div>
          {di && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Info k="DI" v={`${di.numero_di || "—"} · ${di.data_registro || ""}`} />
                <Info k="Importador" v={di.importador_nome || "—"} />
                <Info k="Ref. despachante" v={di.ref_despachante || "—"} />
                <Info k="Navio / BL" v={`${di.navio || "—"} · ${di.bl || ""}`} />
                <Info k="Embarque → chegada" v={`${di.data_embarque || "—"} → ${di.data_chegada || "—"}`} />
                <Info k="Peso bruto / líquido" v={`${di.peso_bruto.toLocaleString("pt-BR")} / ${di.peso_liquido.toLocaleString("pt-BR")} kg`} />
                <Info k="FOB (VMLE)" v={`${fmtUSD(di.totais.fob_usd)} · ${fmtBRL(di.totais.fob_brl)}`} />
                <Info k="Frete / seguro (DI)" v={`${fmtBRL(di.totais.frete_brl)} / ${fmtBRL(di.totais.seguro_brl)}`} />
                <Info k="Valor aduaneiro" v={fmtBRL(di.totais.va_brl)} />
                <Info k="II / IPI" v={`${fmtBRL(di.totais.ii)} / ${fmtBRL(di.totais.ipi)}`} />
                <Info k="PIS / COFINS" v={`${fmtBRL(di.totais.pis)} / ${fmtBRL(di.totais.cofins)}`} />
                <Info k="Siscomex / AFRMM / ICMS" v={`${fmtBRL(di.totais.siscomex)} / ${fmtBRL(di.totais.afrmm)} / ${di.totais.icms ? fmtBRL(di.totais.icms) : "—"}`} />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div><Label className="text-xs">Nº da DI</Label><Input value={di.numero_di || ""} disabled={fechada} onChange={e => setDi(d => ({ ...d, numero_di: e.target.value }))} className="w-40" placeholder="26/0573830-1" /><p className="text-[10px] text-muted-foreground mt-1">O XML de transmissão (PESTI) não traz o número: copie do extrato.</p></div>
                <div><Label className="text-xs">Registro</Label><Input type="date" value={di.data_registro || ""} disabled={fechada} onChange={e => setDi(d => ({ ...d, data_registro: e.target.value }))} className="w-40" /></div>
                <div><Label className="text-xs">Câmbio da DI (R$/US$)</Label><Input type="number" step="0.0001" value={cambioDi} onChange={e => setCambioDi(e.target.value)} className="w-40" /></div>
                <p className="text-xs text-muted-foreground pb-2">Informativo: os impostos já vêm em R$ da DI. O custo da mercadoria usa o câmbio médio das remessas ({cambioMedio ? cambioMedio.toFixed(4) : "—"}).</p>
              </div>
              {di.avisos?.length > 0 && <div className="p-3 rounded-lg bg-warning/10 text-warning text-xs space-y-1">{di.avisos.map((a, i) => <div key={i} className="flex gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{a}</div>)}</div>}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="text-left px-2 py-2">Ad.</th><th className="text-left px-2 py-2">NCM</th><th className="text-left px-2 py-2">Fornecedor</th><th className="text-left px-2 py-2">Itens (qtd × US$)</th>
                    <th className="text-right px-2 py-2">VCMV US$</th><th className="text-right px-2 py-2">VA R$</th><th className="text-right px-2 py-2">II</th><th className="text-right px-2 py-2">IPI</th><th className="text-right px-2 py-2">PIS</th><th className="text-right px-2 py-2">COFINS</th><th className="text-right px-2 py-2">ICMS</th>
                  </tr></thead>
                  <tbody>{di.adicoes.map(a => (
                    <tr key={a.numero} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5">{a.numero}</td><td className="px-2 py-1.5">{a.ncm}</td><td className="px-2 py-1.5">{a.fornecedor.slice(0, 28)}</td>
                      <td className="px-2 py-1.5">{a.mercadorias.map(m => `${m.qtd}×${m.vucv_usd}`).join(", ")}</td>
                      <td className="px-2 py-1.5 text-right">{a.vcmv_usd.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5 text-right">{fmtBRL(a.va_brl)}</td><td className="px-2 py-1.5 text-right">{fmtBRL(a.ii.valor)}<span className="text-muted-foreground"> {a.ii.aliq}%</span></td>
                      <td className="px-2 py-1.5 text-right">{fmtBRL(a.ipi.valor)}</td><td className="px-2 py-1.5 text-right">{fmtBRL(a.pis.valor)}</td><td className="px-2 py-1.5 text-right">{fmtBRL(a.cofins.valor)}</td>
                      <td className="px-2 py-1.5 text-right">{a.icms_brl != null ? fmtBRL(a.icms_brl) : <span className="text-muted-foreground">—</span>}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex justify-end"><Button onClick={() => setPasso(2)} disabled={!di}>Próximo: casar os itens →</Button></div>
        </div>
      )}

      {/* ===== 2. Itens ===== */}
      {passo === 2 && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <p className="text-xs text-muted-foreground">Cada produto da operação recebe os impostos do(s) item(ns) da DI marcados nele. A sugestão automática usa NCM, modelo no nome e quantidade — <b>confira</b>. ICMS: a DI do despachante Golden traz por adição; a da PESTI não — digite o valor do "Draft de cálculo por item". Item pago que <b>não embarcou</b> sai do custo e do rateio.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="text-left px-2 py-2">Produto da operação</th><th className="text-right px-2 py-2">Qtd</th><th className="text-right px-2 py-2">FOB real US$</th><th className="text-left px-2 py-2">Itens da DI</th><th className="text-right px-2 py-2">II+IPI+PIS+COF (R$)</th><th className="text-right px-2 py-2">ICMS (R$)</th><th className="text-center px-2 py-2">Não embarcou</th>
              </tr></thead>
              <tbody>{(resultado?.linhas || itens).map(l => (
                <tr key={l.chave} className={`border-b border-border last:border-0 align-top ${l.nao_embarcou ? "opacity-50" : ""}`}>
                  <td className="px-2 py-2"><div className="font-medium">{l.nome}</div><div className="text-muted-foreground">{l.sku}{l.nao_declarado ? " · não declarado" : ""}{l.declarado_op_usd ? ` · declarado no simulador US$ ${l.declarado_op_usd}` : ""}</div></td>
                  <td className="px-2 py-2 text-right">{l.qty}{l.qtd_di && Math.abs(l.qtd_di - l.qty) > 0.001 ? <div className="text-warning">DI: {l.qtd_di}</div> : null}</td>
                  <td className="px-2 py-2 text-right">{n(l.custo_usd).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-2 py-2 min-w-[300px]">
                    <div className="flex flex-wrap gap-1 mb-1">
                      {(l.di_chaves || []).map(ch => { const d = itensDI.find(x => x.chave === ch); if (!d) return null; return (
                        <button key={ch} type="button" disabled={fechada} onClick={() => toggleChave(l.chave, ch)} title={`${d.descricao} — clique para tirar`} className="px-2 py-0.5 rounded-full border text-[10px] bg-primary/15 border-primary text-primary">
                          ✓ Ad.{d.adicao}.{d.seq} · {d.qtd}×{d.vucv_usd} · {d.descricao.replace(/^N\. SERIE:\s*\S+\s*-\s*/i, "").slice(0, 34)}
                        </button>); })}
                    </div>
                    {!fechada && (
                      <Select value="" onValueChange={v => toggleChave(l.chave, v)}>
                        <SelectTrigger className="h-7 w-full text-[11px]"><SelectValue placeholder={(l.di_chaves || []).length ? "+ outro item da DI…" : "Escolher o item da DI…"} /></SelectTrigger>
                        <SelectContent>
                          {itensDI.filter(d => !(l.di_chaves || []).includes(d.chave) && (!chavesUsadasPor[d.chave] || chavesUsadasPor[d.chave] === l.chave)).map(d => (
                            <SelectItem key={d.chave} value={d.chave} className="text-xs">Ad.{d.adicao}.{d.seq} · {d.qtd}×{d.vucv_usd} · NCM {d.ncm} · {d.descricao.replace(/^N\. SERIE:\s*\S+\s*-\s*/i, "").slice(0, 60)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">{fmtBRL((l.ii || 0) + (l.ipi || 0) + (l.pis || 0) + (l.cofins || 0))}</td>
                  <td className="px-2 py-2 text-right">
                    <Input type="number" step="0.01" disabled={fechada} value={l.icms_brl ?? ""} onChange={e => updItem(l.chave, "icms_brl", e.target.value)} placeholder={l.icms_origem === "DI" ? fmtBRL(l.icms) : "0,00"} className="h-7 w-28 text-right text-xs" />
                    <div className="text-[10px] text-muted-foreground">{l.icms_origem === "DI" ? "da DI (vazio = usa)" : l.icms_origem === "digitado" ? "digitado" : "digite do Draft"}</div>
                  </td>
                  <td className="px-2 py-2 text-center"><input type="checkbox" disabled={fechada} checked={!!l.nao_embarcou} onChange={e => updItem(l.chave, "nao_embarcou", e.target.checked)} /></td>
                </tr>))}</tbody>
            </table>
          </div>
          {resultado?.nao_casados?.length > 0 && <div className="p-3 rounded-lg bg-warning/10 text-warning text-xs"><b>Itens da DI sem produto:</b> {resultado.nao_casados.map(d => `Ad.${d.adicao}.${d.seq} ${d.descricao.slice(0, 40)} (${d.qtd}×${d.vucv_usd})`).join(" · ")}</div>}
          <div className="flex justify-between"><Button variant="ghost" onClick={() => setPasso(1)}>← DI</Button><Button onClick={() => setPasso(3)}>Próximo: despesas →</Button></div>
        </div>
      )}

      {/* ===== 3. Despesas ===== */}
      {passo === 3 && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <p className="text-xs text-muted-foreground">Previsto = o que o simulador usou. Real = fatura do forwarder, numerário/fechamento do despachante, CT-e, boletos. Despesas <b>rateáveis</b> entram no custo dos itens pelo % do FOB real em R$ (como na sua planilha); desmarque o que não deve entrar no custo (ex.: ICMS complementar pago depois, multa).</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="text-left px-2 py-2">Tipo</th><th className="text-left px-2 py-2">Descrição / documento</th><th className="text-right px-2 py-2">Previsto R$</th><th className="text-right px-2 py-2">Real R$</th><th className="text-right px-2 py-2">Diferença</th><th className="text-center px-2 py-2">Rateável</th><th className="text-center px-2 py-2">Critério</th><th></th>
              </tr></thead>
              <tbody>{despesas.map(d => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5">
                    <Select value={d.tipo} onValueChange={v => { updDesp(d.id, "tipo", v); if (!d.descricao || TIPOS_DESPESA.some(t => t.rotulo === d.descricao)) updDesp(d.id, "descricao", TIPOS_DESPESA.find(t => t.tipo === v)?.rotulo || v); }} disabled={fechada}>
                      <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIPOS_DESPESA.map(t => <SelectItem key={t.tipo} value={t.tipo}>{t.rotulo}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5"><Input value={d.descricao || ""} disabled={fechada} onChange={e => updDesp(d.id, "descricao", e.target.value)} className="h-8 text-xs" placeholder="ex.: Gold Arrow fat. 02016-0426" /></td>
                  <td className="px-2 py-1.5 text-right">{fmtBRL(d.previsto_brl)}</td>
                  <td className="px-2 py-1.5"><Input type="number" step="0.01" disabled={fechada} value={d.real_brl ?? ""} onChange={e => updDesp(d.id, "real_brl", e.target.value)} className="h-8 w-32 text-right text-xs ml-auto" /></td>
                  <td className={`px-2 py-1.5 text-right ${n(d.real_brl) - n(d.previsto_brl) > 0 ? "text-destructive" : "text-success"}`}>{d.real_brl === "" || d.real_brl == null ? "—" : fmtBRL(n(d.real_brl) - n(d.previsto_brl))}</td>
                  <td className="px-2 py-1.5 text-center"><input type="checkbox" disabled={fechada} checked={d.rateavel !== false} onChange={e => updDesp(d.id, "rateavel", e.target.checked)} /></td>
                  <td className="px-2 py-1.5 text-center">
                    <Select value={d.criterio || "valor"} onValueChange={v => updDesp(d.id, "criterio", v)} disabled={fechada || d.rateavel === false}>
                      <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="valor">valor</SelectItem><SelectItem value="peso">peso</SelectItem></SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5"><button disabled={fechada} onClick={() => delDesp(d.id)} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button></td>
                </tr>))}</tbody>
              <tfoot><tr className="font-medium"><td className="px-2 py-2" colSpan={2}>Total</td><td className="px-2 py-2 text-right">{fmtBRL(despesas.reduce((s, d) => s + n(d.previsto_brl), 0))}</td><td className="px-2 py-2 text-right">{fmtBRL(totalDespReal)}</td><td className="px-2 py-2 text-right">{fmtBRL(totalDespReal - despesas.reduce((s, d) => s + n(d.previsto_brl), 0))}</td><td colSpan={3}></td></tr></tfoot>
            </table>
          </div>
          {!fechada && <Button variant="outline" size="sm" onClick={addDesp}><Plus className="w-4 h-4 mr-1" /> Adicionar despesa</Button>}
          <div className="flex justify-between"><Button variant="ghost" onClick={() => setPasso(2)}>← Itens</Button><Button onClick={() => setPasso(4)}>Próximo: despachante →</Button></div>
        </div>
      )}

      {/* ===== 4. Acerto com o despachante ===== */}
      {passo === 4 && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <p className="text-xs text-muted-foreground">O numerário é adiantamento. No fechamento o despachante mostra o que debitou (impostos + despesas pagas a terceiros) e os serviços dele; a diferença volta para você (ou falta pagar) e entra no Financeiro ao confirmar.</p>
          <div className="grid md:grid-cols-4 gap-3">
            <div><Label className="text-xs">Numerário depositado (R$)</Label><Input type="number" step="0.01" disabled={fechada} value={acerto.numerario_depositado_brl ?? ""} onChange={e => setAcerto(a => ({ ...a, numerario_depositado_brl: e.target.value }))} /></div>
            <div><Label className="text-xs">Debitado real (R$)</Label><Input type="number" step="0.01" disabled={fechada} value={acerto.debitado_real_brl ?? ""} onChange={e => setAcerto(a => ({ ...a, debitado_real_brl: e.target.value }))} placeholder={debitadoCalc.toFixed(2)} /><p className="text-[10px] text-muted-foreground mt-1">Vazio = impostos reais + despesas reais = {fmtBRL(debitadoCalc)}</p></div>
            <div><Label className="text-xs">Serviços do despachante (R$)</Label><Input type="number" step="0.01" disabled={fechada} value={acerto.servicos_brl ?? ""} onChange={e => setAcerto(a => ({ ...a, servicos_brl: e.target.value }))} /><p className="text-[10px] text-muted-foreground mt-1">Só se ainda não estiver nas despesas.</p></div>
            <div><Label className="text-xs">Saldo</Label><div className={`h-10 flex items-center font-semibold ${saldoDespachante >= 0 ? "text-success" : "text-destructive"}`}>{saldoDespachante >= 0 ? "A receber " : "A pagar "}{fmtBRL(Math.abs(saldoDespachante))}</div></div>
          </div>
          <div><Label className="text-xs">Observação</Label><Input disabled={fechada} value={acerto.observacao || ""} onChange={e => setAcerto(a => ({ ...a, observacao: e.target.value }))} placeholder="ex.: reembolso PESTI 5.125,75 + 3.853,89" /></div>
          <div className="flex justify-between"><Button variant="ghost" onClick={() => setPasso(3)}>← Despesas</Button><Button onClick={() => setPasso(5)}>Próximo: resultado →</Button></div>
        </div>
      )}

      {/* ===== 5. Resultado ===== */}
      {passo === 5 && resultado && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi k="FOB real (R$)" v={fmtBRL(resultado.totais.fob_brl)} s={`${fmtUSD(resultado.totais.fob_usd)} @ ${cambioMedio.toFixed(4)}`} />
            <Kpi k="Impostos no custo" v={fmtBRL(resultado.totais.impostos_custo)} s={`II ${fmtBRL(resultado.totais.ii)} · ICMS ${fmtBRL(resultado.totais.icms)}`} />
            <Kpi k="Despesas rateadas" v={fmtBRL(resultado.totais.despesas_rateadas)} s={resultado.totais.despesas_nao_rateadas ? `+ ${fmtBRL(resultado.totais.despesas_nao_rateadas)} fora do custo` : "100% no custo"} />
            <Kpi k="Custo total real" v={fmtBRL(resultado.totais.custo_total)} s={`estimado ${fmtBRL(resultado.totais.estimado_total)}`} />
            <Kpi k="Diferença" v={resultado.totais.diferenca_total == null ? "—" : fmtBRL(resultado.totais.diferenca_total)} s={resultado.totais.estimado_total ? `${((resultado.totais.diferenca_total / resultado.totais.estimado_total) * 100).toFixed(1)}%` : ""} destaque={(resultado.totais.diferenca_total || 0) > 0 ? "neg" : "pos"} />
          </div>
          {resultado.avisos.length > 0 && <div className="p-3 rounded-lg bg-warning/10 text-warning text-xs space-y-1">{resultado.avisos.map((a, i) => <div key={i} className="flex gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{a}</div>)}</div>}
          {resultado.totais.nao_embarcado_usd > 0 && <div className="p-3 rounded-lg bg-muted/40 text-xs">Mercadoria paga e <b>não embarcada</b>: {fmtUSD(resultado.totais.nao_embarcado_usd)} — fora deste custo; lance como crédito na próxima operação.</div>}
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="text-left px-3 py-2">Produto</th><th className="text-right px-3 py-2">Qtd</th><th className="text-right px-3 py-2">FOB R$</th><th className="text-right px-3 py-2">% rateio</th><th className="text-right px-3 py-2">Rateio R$</th><th className="text-right px-3 py-2">II</th><th className="text-right px-3 py-2">PIS+COF</th><th className="text-right px-3 py-2">ICMS</th><th className="text-right px-3 py-2">Custo unit. REAL</th><th className="text-right px-3 py-2">Estimado</th><th className="text-right px-3 py-2">Dif.</th>
              </tr></thead>
              <tbody>{resultado.linhas.map(l => (
                <tr key={l.chave} className={`border-b border-border last:border-0 ${l.nao_embarcou ? "opacity-50 line-through" : ""}`}>
                  <td className="px-3 py-2 font-medium">{l.nome}</td><td className="px-3 py-2 text-right">{l.qty}</td><td className="px-3 py-2 text-right">{fmtBRL(l.fob_brl)}</td>
                  <td className="px-3 py-2 text-right">{(l.pct_valor * 100).toFixed(2)}%</td><td className="px-3 py-2 text-right">{fmtBRL(l.rateio_brl)}</td>
                  <td className="px-3 py-2 text-right">{fmtBRL(l.ii)}</td><td className="px-3 py-2 text-right">{fmtBRL(l.pis + l.cofins)}</td><td className="px-3 py-2 text-right">{fmtBRL(l.icms)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmtBRL(l.custo_unitario)}</td><td className="px-3 py-2 text-right text-muted-foreground">{l.estimado_unitario ? fmtBRL(l.estimado_unitario) : "—"}</td>
                  <td className={`px-3 py-2 text-right ${(l.diferenca_unitaria || 0) > 0 ? "text-destructive" : "text-success"}`}>{l.diferenca_unitaria == null ? "—" : `${fmtBRL(l.diferenca_unitaria)} (${l.diferenca_pct > 0 ? "+" : ""}${l.diferenca_pct}%)`}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <div><Label className="text-xs">Observações do fechamento (as "arestas")</Label><Input disabled={fechada} value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="ex.: 2 S2 pagas ficaram para o próximo navio; frete do forwarder incluiu correção de NCM" /></div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setPasso(4)}>← Despachante</Button>
              <div className="flex gap-2">
                {!fechada && <Button variant="outline" onClick={salvarRascunho} disabled={salvando}>Salvar rascunho</Button>}
                <Button onClick={confirmar} disabled={confirmando}>{confirmando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}{fechada ? "Refazer o fechamento com estes valores" : "Confirmar fechamento e gravar custos reais"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ k, v }) { return <div className="p-2 rounded-lg bg-muted/30"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p><p className="font-medium break-words">{v}</p></div>; }
function Kpi({ k, v, s, destaque }) { return <div className="bg-card rounded-xl border border-border p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p><p className={`text-lg font-semibold ${destaque === "neg" ? "text-destructive" : destaque === "pos" ? "text-success" : ""}`}>{v}</p>{s && <p className="text-[10px] text-muted-foreground">{s}</p>}</div>; }
