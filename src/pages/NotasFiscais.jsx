import React, { useState, useEffect } from "react";
import { base44, supabase } from "@/api/base44Client";
import { Plus, Search, FileText, Pencil, Trash2, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";

// NF-e avulsa: entrada/saída SEM pedido de venda — entrada de importação,
// devoluções, conserto. O CFOP intra/interestadual é escolhido sozinho pela UF
// do destinatário; a lógica fiscal pesada mora na edge function emitir-nfe.
// Texto padrão que sai em "Informações adicionais" da nota, por natureza (Larissa 17/09). {di}, {data_di}, {volumes} são preenchidos na hora.
const INFO_PADRAO = {
  importacao: "DI nº {di} · Data de registro da DI: {data_di}\n{volumes}\nDespesas aduaneiras rateadas nos itens.",
  devolucao_venda: "Devolução de mercadoria referente à NF-e {ref}. Mercadoria retorna ao estoque.",
  devolucao_compra: "Devolução de compra referente à NF-e {ref}.",
  entrada_conserto: "Mercadoria recebida para conserto/reparo. Retorno ao remetente após o serviço (CFOP 5916/6916).",
  retorno_conserto: "Retorno de mercadoria recebida para conserto, referente à NF-e {ref}. Serviço cobrado à parte.",
  remessa_conserto: "Remessa de mercadoria para conserto/reparo. Retorno previsto após o serviço.",
  outra: "",
};
const VIAS_TRANSPORTE = [[1, "Marítima"], [2, "Fluvial"], [3, "Lacustre"], [4, "Aérea"], [5, "Postal"], [6, "Ferroviária"], [7, "Rodoviária"], [8, "Conduto / rede de transmissão"], [9, "Meios próprios"], [10, "Entrada / saída ficta"], [11, "Courier"], [12, "Em mãos"], [13, "Por reboque"]];
const FORMAS_IMPORTACAO = [[1, "Por conta própria"], [2, "Por conta e ordem"], [3, "Encomenda"]];
const PRESETS = [
  { value: "importacao", label: "Entrada de importação (chegada de container)", tipo: "entrada", natureza: "Compra para comercializacao - importacao", cfop: "3102", csosn: "900", finalidade: 1, exterior: true, di: true },
  { value: "devolucao_venda", label: "Devolução de venda (cliente devolvendo)", tipo: "entrada", natureza: "Devolucao de venda", cfopSP: "1202", cfopFora: "2202", csosn: "102", finalidade: 4, ref: true },
  { value: "devolucao_compra", label: "Devolução de compra (devolver ao fornecedor)", tipo: "saida", natureza: "Devolucao de compra", cfopSP: "5202", cfopFora: "6202", csosn: "102", finalidade: 4, ref: true },
  { value: "entrada_conserto", label: "Entrada para conserto (máquina do cliente chega)", tipo: "entrada", natureza: "Entrada de mercadoria para conserto ou reparo", cfopSP: "1915", cfopFora: "2915", csosn: "900", finalidade: 1 },
  { value: "retorno_conserto", label: "Retorno de conserto (devolver máquina consertada)", tipo: "saida", natureza: "Retorno de mercadoria recebida para conserto ou reparo", cfopSP: "5916", cfopFora: "6916", csosn: "900", finalidade: 1, ref: true },
  { value: "remessa_conserto", label: "Remessa para conserto (enviar a terceiro)", tipo: "saida", natureza: "Remessa de mercadoria para conserto ou reparo", cfopSP: "5915", cfopFora: "6915", csosn: "900", finalidade: 1 },
  { value: "outra", label: "Outra operação (CFOP manual)", tipo: "saida", natureza: "", cfop: "", csosn: "900", finalidade: 1 },
];
const presetInfo = (v) => PRESETS.find(p => p.value === v) || PRESETS[PRESETS.length - 1];

const PAISES = [
  { codigo: 1600, nome: "CHINA, REPUBLICA POPULAR" },
  { codigo: 1619, nome: "TAIWAN (FORMOSA)" },
  { codigo: 3514, nome: "HONG KONG" },
  { codigo: 1902, nome: "COREIA DO SUL" },
  { codigo: 2496, nome: "ESTADOS UNIDOS" },
  { codigo: 230, nome: "ALEMANHA" },
  { codigo: 3867, nome: "ITALIA" },
  { codigo: 3999, nome: "JAPAO" },
  { codigo: 3611, nome: "INDIA" },
];

const formatCurrency = (val) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);
const num = (v) => parseFloat(v) || 0;
const totalNota = (n) => (n.items || []).reduce((s, i) => s + num(i.quantity) * num(i.unit_price), 0) + num(n.frete);

const STATUS_COR = {
  autorizado: "bg-success/10 text-success",
  processando_autorizacao: "bg-warning/10 text-warning",
  erro_autorizacao: "bg-destructive/10 text-destructive",
  cancelado: "bg-muted text-muted-foreground",
};

export default function NotasFiscais() {
  const [notas, setNotas] = useState([]);
  const [contatos, setContatos] = useState([]);
  const [products, setProducts] = useState([]);
  const [operacoes, setOperacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [aba, setAba] = useState("todas"); const [canal, setCanal] = useState("todos"); const [pedidosNf, setPedidosNf] = useState([]); // lista única (Larissa 17/09)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [n, c, p, ops, pv] = await Promise.all([
      base44.entities.NfeAvulsa.list("-created_date", 300),
      base44.entities.Contato.list("-created_date", 1000),
      base44.entities.Product.list("-created_date", 1000),
      base44.entities.ImportOperation.list("-created_date", 100).catch(() => []),
      base44.entities.SaleOrder.list("-created_date", 2000).catch(() => []),
    ]);
    setNotas(n || []);
    setPedidosNf((pv || []).filter(o => o.nfe_numero || o.nfe_chave || o.nfe_status));
    setContatos(c || []);
    setProducts(p || []);
    setOperacoes((ops || []).filter(o => ["realizada", "concluida"].includes(o.status)));
    setLoading(false);
  };

  const chamarNfe = async (acao, nfeId) => {
    const { data: sessao } = await supabase.auth.getSession();
    return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emitir-nfe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${sessao?.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ acao, nfe_id: nfeId }),
    });
  };

  const danfePedido = async (o) => {
    setBusy(o.id);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emitir-nfe`, { method: "POST", headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${sessao?.session?.access_token ?? ""}` }, body: JSON.stringify({ acao: "danfe", sale_order_id: o.id }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || "DANFE indisponível."); } else { window.open(URL.createObjectURL(await r.blob()), "_blank"); }
    } catch (err) { alert(err.message); }
    setBusy(null);
  };
  const canalPedido = (o) => ({ mercado_livre: "Mercado Livre", woocommerce: "Site", direct: "Venda direta" }[o.channel] || o.channel || "Outro");
  const textoPadrao = () => {
    const t = INFO_PADRAO[form.preset] || "";
    const vol = (form.items || []).reduce((sm, it) => sm + (parseFloat(it.quantity) || 0), 0);
    return t.replace("{di}", form.di?.numero || "____").replace("{data_di}", form.di?.data_registro ? form.di.data_registro.split("-").reverse().join("/") : "__/__/____").replace("{volumes}", vol ? `${vol} volume(s)` : "").replace("{ref}", form.chave_referenciada ? `chave ${form.chave_referenciada}` : "____").replace(/\n{2,}/g, "\n").trim();
  };
  const exportarLista = () => {
    const rows = [["Data", "Tipo", "Origem", "Natureza", "CFOP", "Destinatario", "Total", "NF numero", "Serie", "Chave", "Situacao"]];
    for (const l of linhasFiltradas) rows.push([l.data.split("-").reverse().join("/"), l.tipo, l.origem, l.natureza, l.cfop, l.dest, l.total.toFixed(2).replace(".", ","), l.nfe_numero || "", l.nfe_serie || "", l.nfe_chave || "", l.nfe_status || "rascunho"]);
    const csv = "\ufeff" + rows.map(r => r.map(x => String(x ?? "").replace(/;/g, ",")).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `notas-fiscais-${aba}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const openNew = () => {
    setEditing(null);
    const p = PRESETS[0];
    setForm({
      preset: p.value, tipo: p.tipo, natureza_operacao: p.natureza, cfop: p.cfop, csosn: p.csosn,
      finalidade: p.finalidade, data: new Date().toISOString().slice(0, 10),
      items: [], di: { via_transporte: 1 }, exterior: { pais_codigo: 1600, pais_nome: PAISES[0].nome },
    });
    setDialogOpen(true);
  };

  const openEdit = (n) => {
    setEditing(n);
    setForm({ ...n, items: n.items || [], di: n.di || { via_transporte: 1 }, exterior: n.exterior || { pais_codigo: 1600, pais_nome: PAISES[0].nome } });
    setDialogOpen(true);
  };

  const aplicarPreset = (v) => {
    const p = presetInfo(v);
    setForm(prev => ({
      ...prev, preset: v, tipo: p.tipo, natureza_operacao: p.natureza || prev.natureza_operacao,
      finalidade: p.finalidade, csosn: p.csosn,
      cfop: p.cfop !== undefined ? p.cfop : cfopDoPreset(p, prev.contato_id),
    }));
  };

  const cfopDoPreset = (p, contatoId) => {
    if (p.cfop !== undefined) return p.cfop;
    const c = contatos.find(x => x.id === contatoId);
    return (c?.state || "SP") === "SP" ? p.cfopSP : p.cfopFora;
  };

  const setContato = (v) => {
    const p = presetInfo(form.preset);
    setForm(prev => ({ ...prev, contato_id: v === "none" ? "" : v, cfop: p.cfop !== undefined ? prev.cfop : cfopDoPreset(p, v === "none" ? "" : v) }));
  };

  const setItem = (ix, campo, valor) => setForm(prev => ({
    ...prev, items: prev.items.map((it, i) => i === ix ? { ...it, [campo]: valor } : it),
  }));

  const addItemProduto = (pid) => {
    const p = products.find(x => x.id === pid);
    setForm(prev => ({
      ...prev,
      items: [...(prev.items || []), {
        product_id: p?.id || "", sku: p?.sku || "", name: p?.name || "", ncm: p?.ncm || "",
        unit: p?.unit || "UN", quantity: 1, unit_price: "",
      }],
    }));
  };

  // Preset importação: puxa o mix DECLARADO da operação (valor aduaneiro e II por item)
  const puxarOperacao = (opId) => {
    const op = operacoes.find(o => o.id === opId);
    const rs = op?.resultado_importacao?.resultados || [];
    const itens = rs.filter(r => (r.va || 0) > 0).map(r => {
      const p = products.find(x => x.id === r.produto?.id);
      return {
        product_id: r.produto?.id || "", sku: p?.sku || "", name: r.produto?.nome || p?.name || "Item",
        ncm: p?.ncm || "", unit: p?.unit || "UN",
        quantity: r.quantidade || 1,
        unit_price: Math.round(((r.va || 0) / (r.quantidade || 1)) * 100) / 100,
        ii_base: r.va || 0, ii_valor: r.ii || 0, ii_despesas: r.despesas_brl || 0, ii_iof: 0,
      };
    });
    setForm(prev => ({ ...prev, items: itens, informacoes_adicionais: prev.informacoes_adicionais || `Referente à operação de importação "${op?.nome || ""}".` }));
  };

  const handleSave = async (emitirDepois = false) => {
    const p = presetInfo(form.preset);
    if (!p.exterior && !form.contato_id) { alert("Selecione o destinatário (contato)."); return; }
    if (!(form.items || []).length) { alert("Adicione ao menos um item."); return; }
    const itemInvalido = (form.items || []).find(it => !((parseFloat(it.quantity) || 0) > 0) || !((parseFloat(it.unit_price) || 0) > 0));
    if (itemInvalido) { alert(`O item "${itemInvalido.name || "(sem nome)"}" está sem quantidade ou valor unitário — a SEFAZ rejeitaria a nota.`); return; }
    if (p.di && !form.di?.numero?.trim()) { alert("Entrada de importação exige o nº da DI/DUImp no bloco Declaração de Importação."); return; }
    if (p.ref && String(form.chave_referenciada || "").replace(/\D/g, "").length !== 44) {
      if (!confirm("Esta operação normalmente referencia a chave (44 dígitos) da nota original. Continuar sem referenciar?")) return;
    }
    setSaving(true);
    try {
      const data = { ...form, exterior: p.exterior ? form.exterior : null, di: p.di ? form.di : null };
      const salvo = editing
        ? await base44.entities.NfeAvulsa.update(editing.id, data)
        : await base44.entities.NfeAvulsa.create(data);
      const id = salvo?.id || editing?.id;
      setDialogOpen(false);
      if (emitirDepois) await handleEmitir({ id });
      loadData();
    } catch (err) {
      alert(`Não foi possível salvar a nota: ${err.message}`);
    }
    setSaving(false);
  };

  const handleEmitir = async (n) => {
    setBusy(n.id);
    try {
      const r = await chamarNfe("emitir", n.id);
      const resp = await r.json();
      if (!r.ok) { alert(resp.error || resp.mensagem || "Erro ao emitir."); }
      else {
        await new Promise(res => setTimeout(res, 12000));
        const s = await (await chamarNfe("status", n.id)).json();
        if (s.status === "autorizado") alert(`✅ NF-e AUTORIZADA!\nNúmero ${s.numero} série ${s.serie}\n${s.chave_nfe}`);
        else alert(`Status: ${s.status}\n${s.mensagem_sefaz || s.mensagem || ""}`);
      }
    } catch (err) { alert(`Erro: ${err.message}`); }
    setBusy(null);
    loadData();
  };

  const handleDanfe = async (n) => {
    setBusy(n.id);
    try {
      const r = await chamarNfe("danfe", n.id);
      if (!r.ok) { const e = await r.json(); alert(e.error || "DANFE indisponível."); }
      else {
        const blob = await r.blob();
        window.open(URL.createObjectURL(blob), "_blank");
      }
    } catch (err) { alert(`Erro: ${err.message}`); }
    setBusy(null);
  };

  const handleDelete = async (n) => {
    if (n.nfe_status === "autorizado") { alert("Nota autorizada não pode ser excluída do histórico."); return; }
    if (!confirm("Excluir esta nota (rascunho)?")) return;
    await base44.entities.NfeAvulsa.delete(n.id);
    loadData();
  };

  // LISTA ÚNICA (Larissa 17/09): avulsas + NF-e dos pedidos (site, Mercado Livre, venda direta), com abas Entrada/Saída e filtro por canal
  const linhasTodas = [
    ...notas.map(n => ({ kind: "avulsa", id: n.id, n, data: n.data || (n.created_date || "").slice(0, 10), tipo: n.tipo === "entrada" ? "Entrada" : "Saída", origem: "Avulsa", natureza: n.natureza_operacao || "—", cfop: n.cfop || (n.items?.[0]?.cfop ?? ""), dest: n.exterior?.nome || contatos.find(c => c.id === n.contato_id)?.name || "—", total: totalNota(n), nfe_numero: n.nfe_numero, nfe_serie: n.nfe_serie, nfe_chave: n.nfe_chave, nfe_status: n.nfe_status, nfe_mensagem: n.nfe_mensagem })),
    ...pedidosNf.map(o => ({ kind: "pedido", id: o.id, o, data: o.order_date || (o.created_date || "").slice(0, 10), tipo: "Saída", origem: canalPedido(o), natureza: `Venda · pedido ${o.order_number || ""}`, cfop: "", dest: o.customer_name || "—", total: parseFloat(o.total) || 0, nfe_numero: o.nfe_numero, nfe_serie: "", nfe_chave: o.nfe_chave, nfe_status: o.nfe_status, nfe_mensagem: o.nfe_mensagem })),
  ].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const origens = Array.from(new Set(linhasTodas.map(l => l.origem)));
  const linhasFiltradas = linhasTodas.filter(l => {
    const q = search.toLowerCase();
    const txt = !q || l.dest.toLowerCase().includes(q) || l.natureza.toLowerCase().includes(q) || String(l.nfe_numero || "").includes(q);
    const ab = aba === "todas" || (aba === "entrada" ? l.tipo === "Entrada" : l.tipo === "Saída");
    const cn = canal === "todos" || l.origem === canal;
    return txt && ab && cn;
  });
  const filtered = linhasFiltradas;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  const p = presetInfo(form.preset);

  return (
    <div>
      <PageHeader
        title="Notas Fiscais"
        description="Todas as NF-e num lugar só: as dos pedidos (site, Mercado Livre, venda direta) e as avulsas (importação, devoluções, conserto)"
        actions={<div className="flex gap-2"><Button variant="outline" onClick={exportarLista} disabled={!filtered.length}><Download className="w-4 h-4 mr-1" /> Exportar CSV</Button><Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nova NF avulsa</Button></div>}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="todas">Todas ({linhasTodas.length})</TabsTrigger>
            <TabsTrigger value="entrada">Entrada ({linhasTodas.filter(l => l.tipo === "Entrada").length})</TabsTrigger>
            <TabsTrigger value="saida">Saída ({linhasTodas.filter(l => l.tipo === "Saída").length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={canal} onValueChange={setCanal}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os canais</SelectItem>{origens.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
        <div className="ml-auto max-w-xs relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar destinatário, natureza, nº..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhuma nota" description={linhasTodas.length ? "Nada nesse filtro." : "As NF-e dos pedidos aparecem aqui quando emitidas; avulsas você emite pelo botão."} actionLabel="Nova NF avulsa" onAction={openNew} />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Origem · natureza</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Destinatário</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">NF-e</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr></thead>
              <tbody>
                {filtered.map(l => {
                  const n = l.n; const dest = l.dest;
                  return (
                    <tr key={l.kind + l.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 text-xs">{l.data ? l.data.split("-").reverse().join("/") : "—"}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${l.tipo === "Entrada" ? "bg-blue-100 text-blue-700" : "bg-primary/10 text-primary"}`}>{l.tipo}</span></td>
                      <td className="px-4 py-3 text-xs"><span className="font-medium">{l.origem}</span> · {l.natureza}{l.cfop && <span className="block text-[10px] text-muted-foreground">CFOP {l.cfop}</span>}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs">{dest}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(l.total)}</td>
                      <td className="px-4 py-3 text-center">
                        {l.nfe_status === "autorizado" ? (
                          <button onClick={() => l.kind === "avulsa" ? handleDanfe(n) : danfePedido(l.o)} disabled={busy === l.id} title={`NF ${l.nfe_numero} autorizada — ver DANFE`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-success/10 text-success hover:bg-success/20">
                            {busy === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} NF {l.nfe_numero}
                          </button>
                        ) : l.kind === "avulsa" ? (
                          <button onClick={() => handleEmitir(n)} disabled={busy === l.id} title={l.nfe_mensagem || "Emitir NF-e"}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium ${l.nfe_status && l.nfe_status !== "autorizado" ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : "bg-primary/10 text-primary hover:bg-primary/20"}`}>
                            {busy === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                            {l.nfe_status && l.nfe_status !== "autorizado" ? "Reemitir" : "Emitir"}
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">{l.nfe_status || "sem NF"}</span>
                        )}
                        {l.nfe_status && l.nfe_status !== "autorizado" && <span className="block text-[9px] text-destructive mt-0.5 max-w-[140px] truncate" title={l.nfe_mensagem}>{l.nfe_mensagem}</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {l.kind === "avulsa" ? (<>
                          <button onClick={() => openEdit(n)} className="p-1.5 hover:bg-muted rounded-lg"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                          <button onClick={() => handleDelete(n)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-4 h-4 text-destructive" /></button>
                        </>) : <span className="text-[10px] text-muted-foreground">em Pedidos de Venda</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar NF Avulsa" : "Nova NF Avulsa"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Operação</Label>
              <Select value={form.preset || "outra"} onValueChange={aplicarPreset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRESETS.map(pr => <SelectItem key={pr.value} value={pr.value}>{pr.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Nota de {form.tipo === "entrada" ? "ENTRADA" : "SAÍDA"} · CFOP {form.cfop || "—"} {p.cfopSP && "(intra/interestadual escolhido pela UF do destinatário)"}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><Label>Data</Label><Input type="date" value={form.data || ""} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Natureza da operação</Label><Input value={form.natureza_operacao || ""} onChange={e => setForm({ ...form, natureza_operacao: e.target.value })} /></div>
              {form.preset === "outra" && <>
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.tipo || "saida"} onValueChange={v => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="saida">Saída</SelectItem><SelectItem value="entrada">Entrada</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>CFOP</Label><Input value={form.cfop || ""} onChange={e => setForm({ ...form, cfop: e.target.value })} placeholder="Ex: 5949" /></div>
              </>}
            </div>

            {p.exterior ? (
              <div className="rounded-lg border border-border p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><Label className="font-semibold">Exportador (fornecedor no exterior)</Label></div>
                <div><Label className="text-xs">Nome</Label><Input value={form.exterior?.nome || ""} onChange={e => setForm(prev => ({ ...prev, exterior: { ...prev.exterior, nome: e.target.value } }))} placeholder="Ex: Foshan Hezhi Machinery Co Ltd" /></div>
                <div><Label className="text-xs">Endereço (cidade/zona)</Label><Input value={form.exterior?.endereco || ""} onChange={e => setForm(prev => ({ ...prev, exterior: { ...prev.exterior, endereco: e.target.value } }))} placeholder="Ex: Foshan Industrial Zone" /></div>
                <div>
                  <Label className="text-xs">País</Label>
                  <Select value={String(form.exterior?.pais_codigo || 1600)} onValueChange={v => { const pa = PAISES.find(x => String(x.codigo) === v); setForm(prev => ({ ...prev, exterior: { ...prev.exterior, pais_codigo: pa.codigo, pais_nome: pa.nome } })); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAISES.map(pa => <SelectItem key={pa.codigo} value={String(pa.codigo)}>{pa.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Identificação (opcional)</Label><Input value={form.exterior?.id_estrangeiro || ""} onChange={e => setForm(prev => ({ ...prev, exterior: { ...prev.exterior, id_estrangeiro: e.target.value } }))} placeholder="EXTERIOR" /></div>
              </div>
            ) : (
              <div>
                <Label>Destinatário *</Label>
                <Select value={form.contato_id || "none"} onValueChange={setContato}>
                  <SelectTrigger><SelectValue placeholder="Selecione o contato" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— selecione —</SelectItem>
                    {contatos.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.state ? ` · ${c.state}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {p.ref && (
              <div>
                <Label>Chave da NF referenciada (44 dígitos)</Label>
                <Input value={form.chave_referenciada || ""} onChange={e => setForm({ ...form, chave_referenciada: e.target.value })} placeholder="Chave de acesso da nota original" />
                {form.finalidade === 4 && <p className="text-[10px] text-muted-foreground mt-1">Em devolução, a referência vai item a item — o item 1 desta nota referencia o item 1 da original, e assim por diante. Monte os itens na MESMA ordem da nota devolvida.</p>}
              </div>
            )}

            {p.di && (
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold">Declaração de Importação (DI)</Label>
                  {operacoes.length > 0 && (
                    <Select value="" onValueChange={puxarOperacao}>
                      <SelectTrigger className="w-auto text-xs h-8"><SelectValue placeholder="⬇ Puxar itens da operação..." /></SelectTrigger>
                      <SelectContent>{operacoes.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><Label className="text-xs">Nº da DI/DUImp</Label><Input value={form.di?.numero || ""} onChange={e => setForm(prev => ({ ...prev, di: { ...prev.di, numero: e.target.value } }))} /></div>
                  <div><Label className="text-xs">Data de registro</Label><Input type="date" value={form.di?.data_registro || ""} onChange={e => setForm(prev => ({ ...prev, di: { ...prev.di, data_registro: e.target.value } }))} /></div>
                  <div><Label className="text-xs">Data do desembaraço</Label><Input type="date" value={form.di?.data_desembaraco || ""} onChange={e => setForm(prev => ({ ...prev, di: { ...prev.di, data_desembaraco: e.target.value } }))} /></div>
                  <div><Label className="text-xs">UF desembaraço</Label><Input value={form.di?.uf || "SP"} onChange={e => setForm(prev => ({ ...prev, di: { ...prev.di, uf: e.target.value } }))} maxLength={2} /></div>
                  <div className="col-span-2"><Label className="text-xs">Local do desembaraço</Label><Input value={form.di?.local || ""} onChange={e => setForm(prev => ({ ...prev, di: { ...prev.di, local: e.target.value } }))} placeholder="Ex: Porto de Santos" /></div>
                  <div><Label className="text-xs">AFRMM (R$)</Label><Input type="number" step="0.01" value={form.di?.valor_afrmm ?? ""} onChange={e => setForm(prev => ({ ...prev, di: { ...prev.di, valor_afrmm: e.target.value } }))} /></div>
                  <div><Label className="text-xs">Cód. exportador</Label><Input value={form.di?.codigo_exportador || ""} onChange={e => setForm(prev => ({ ...prev, di: { ...prev.di, codigo_exportador: e.target.value } }))} placeholder="Ex: HEZHI" /></div>
                  <div><Label className="text-xs">Via de transporte</Label>
                    <Select value={String(form.di?.via_transporte || 1)} onValueChange={v => setForm(prev => ({ ...prev, di: { ...prev.di, via_transporte: parseInt(v) } }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{VIAS_TRANSPORTE.map(([v, l]) => <SelectItem key={v} value={String(v)}>{v} - {l}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div><Label className="text-xs">Forma de importação</Label>
                    <Select value={String(form.di?.forma_importacao || 1)} onValueChange={v => setForm(prev => ({ ...prev, di: { ...prev.di, forma_importacao: parseInt(v) } }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FORMAS_IMPORTACAO.map(([v, l]) => <SelectItem key={v} value={String(v)}>{v} - {l}</SelectItem>)}</SelectContent>
                    </Select></div>
                  {(form.di?.forma_importacao || 1) !== 1 && <div><Label className="text-xs">CNPJ do adquirente</Label><Input value={form.di?.cnpj_adquirente || ""} onChange={e => setForm(prev => ({ ...prev, di: { ...prev.di, cnpj_adquirente: e.target.value } }))} /></div>}
                  <div><Label className="text-xs">Despesas aduaneiras (R$)</Label><Input type="number" step="0.01" value={form.di?.despesas_aduaneiras ?? ""} onChange={e => setForm(prev => ({ ...prev, di: { ...prev.di, despesas_aduaneiras: e.target.value } }))} placeholder="Total, rateado nos itens" /></div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">"Puxar itens da operação" preenche os itens com o mix DECLARADO (valor aduaneiro e II por item, calculados pelo simulador). Confira com a DI real antes de emitir.</p>
              </div>
            )}

            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="font-semibold">Itens</Label>
                <Select value="" onValueChange={addItemProduto}>
                  <SelectTrigger className="w-auto text-xs h-8"><SelectValue placeholder="+ Adicionar produto..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">— item manual —</SelectItem>
                    {products.map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(form.items || []).map((it, ix) => (
                <div key={ix} className="border-b border-border/50 last:border-0 pb-2 mb-2">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4"><Label className="text-xs">Descrição</Label><Input value={it.name || ""} onChange={e => setItem(ix, "name", e.target.value)} /></div>
                    <div className="col-span-2"><Label className="text-xs">NCM</Label><Input value={it.ncm || ""} onChange={e => setItem(ix, "ncm", e.target.value)} /></div>
                    <div className="col-span-2"><Label className="text-xs">Qtd</Label><Input type="number" min="0" value={it.quantity ?? ""} onChange={e => setItem(ix, "quantity", e.target.value)} /></div>
                    <div className="col-span-3"><Label className="text-xs">Valor unit. (R$)</Label><Input type="number" step="0.01" value={it.unit_price ?? ""} onChange={e => setItem(ix, "unit_price", e.target.value)} /></div>
                    <button type="button" className="col-span-1 h-9 text-destructive hover:bg-destructive/10 rounded text-sm" onClick={() => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== ix) }))}>✕</button>
                  </div>
                  {p.di && (
                    <div className="grid grid-cols-12 gap-2 items-end mt-1">
                      <div className="col-span-3"><Label className="text-[10px]">Base II (R$)</Label><Input type="number" step="0.01" value={it.ii_base ?? ""} onChange={e => setItem(ix, "ii_base", e.target.value)} /></div>
                      <div className="col-span-3"><Label className="text-[10px]">Valor II (R$)</Label><Input type="number" step="0.01" value={it.ii_valor ?? ""} onChange={e => setItem(ix, "ii_valor", e.target.value)} /></div>
                      <div className="col-span-3"><Label className="text-[10px]">Desp. aduaneiras (R$)</Label><Input type="number" step="0.01" value={it.ii_despesas ?? ""} onChange={e => setItem(ix, "ii_despesas", e.target.value)} /></div>
                      <div className="col-span-3"><Label className="text-[10px]">IOF (R$)</Label><Input type="number" step="0.01" value={it.ii_iof ?? ""} onChange={e => setItem(ix, "ii_iof", e.target.value)} /></div>
                      <div className="col-span-2"><Label className="text-[10px]">Nº adição</Label><Input type="number" min="1" value={it.adicao ?? 1} onChange={e => setItem(ix, "adicao", e.target.value)} /></div>
                      <div className="col-span-2"><Label className="text-[10px]">Seq. na adição</Label><Input type="number" min="1" value={it.seq_adicao ?? (ix + 1)} onChange={e => setItem(ix, "seq_adicao", e.target.value)} /></div>
                      <div className="col-span-4"><Label className="text-[10px]">Cód. fabricante (opcional)</Label><Input value={it.cod_fabricante || ""} onChange={e => setItem(ix, "cod_fabricante", e.target.value)} /></div>
                    </div>
                  )}
                </div>
              ))}
              {!(form.items || []).length && <p className="text-[10px] text-muted-foreground">Nenhum item — escolha um produto acima ou "item manual".</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><Label>Frete (R$)</Label><Input type="number" step="0.01" value={form.frete ?? ""} onChange={e => setForm({ ...form, frete: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label className="flex items-center justify-between">Informações adicionais / complementares <button type="button" className="text-[10px] text-primary underline font-normal" onClick={() => setForm({ ...form, informacoes_adicionais: [textoPadrao(), form.informacoes_adicionais].filter(Boolean).join("\n") })}>+ texto padrão da natureza</button></Label>
                <Textarea rows={4} value={form.informacoes_adicionais || ""} onChange={e => setForm({ ...form, informacoes_adicionais: e.target.value })} placeholder="Sai no rodapé da DANFE: volumes, DI, transporte, coleta, referência de NF…" />
                <p className="text-[10px] text-muted-foreground mt-1">Transporte, coleta, volumes, número da DI: tudo o que a contabilidade e o transportador precisam ler na nota.</p></div>
            </div>

            <div className="rounded-lg bg-muted/30 border border-border p-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total da nota</span>
              <span className="font-bold">{formatCurrency(totalNota(form))}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>Salvar rascunho</Button>
            <Button onClick={() => handleSave(true)} disabled={saving}>{saving ? "Processando..." : "Salvar e Emitir"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
