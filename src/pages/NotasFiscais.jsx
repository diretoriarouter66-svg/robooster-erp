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
// Fase B (17/09): tabelas de CST/CSOSN usadas nas abas de imposto do item
const CSOSN = [["101","101 - Com permissão de crédito"],["102","102 - Sem permissão de crédito"],["103","103 - Isenção por faixa"],["300","300 - Imune"],["400","400 - Não tributada"],["500","500 - ICMS cobrado por ST"],["900","900 - Outros"]];
const CST_IPI = [["00","00 - Entrada com recuperação de crédito"],["01","01 - Entrada tributada alíquota zero"],["02","02 - Entrada isenta"],["03","03 - Entrada não tributada"],["04","04 - Entrada imune"],["05","05 - Entrada com suspensão"],["49","49 - Outras entradas"],["50","50 - Saída tributada"],["51","51 - Saída alíquota zero"],["52","52 - Saída isenta"],["53","53 - Saída não tributada"],["54","54 - Saída imune"],["55","55 - Saída com suspensão"],["99","99 - Outras saídas"]];
const CST_PIS = [["01","01 - Alíquota básica"],["02","02 - Alíquota diferenciada"],["04","04 - Monofásico alíquota zero"],["06","06 - Alíquota zero"],["07","07 - Isenta"],["08","08 - Sem incidência"],["09","09 - Suspensão"],["49","49 - Outras saídas"],["70","70 - Aquisição sem direito a crédito"],["73","73 - Aquisição p/ revenda (isenta)"],["98","98 - Outras entradas"],["99","99 - Outras operações"]];
const ORIGENS = [["0","0 - Nacional"],["1","1 - Estrangeira (importação direta)"],["2","2 - Estrangeira (mercado interno)"],["3","3 - Nacional >40% importado"],["5","5 - Nacional ≤40% importado"],["6","6 - Estrangeira sem similar"],["7","7 - Estrangeira sem similar (mercado interno)"],["8","8 - Nacional >70% importado"]];
const MOD_BC = [["0","0 - Margem de valor agregado"],["1","1 - Pauta"],["2","2 - Preço tabelado"],["3","3 - Valor da operação"]];
const ABAS_ITEM = [["dados","Dados"],["icms","ICMS"],["ipi","IPI"],["pis","PIS/COFINS"],["imp","Importação"],["outros","Outros"]];
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
const totaisNota = (n) => {
  const its = n.items || [];
  const t = { produtos: 0, frete: num(n.frete), seguro: num(n.seguro), outras: num(n.outras_despesas), desconto: num(n.desconto), ii: 0, ipi: 0, pis: 0, cofins: 0, icms_base: 0, icms: 0 };
  for (const i of its) {
    t.produtos += num(i.quantity) * num(i.unit_price);
    t.frete += num(i.frete_item); t.seguro += num(i.seguro_item); t.outras += num(i.outras_item); t.desconto += num(i.desconto_item);
    t.ii += num(i.ii_valor); t.ipi += num(i.ipi_valor); t.pis += num(i.pis_valor); t.cofins += num(i.cofins_valor); t.icms_base += num(i.icms_base); t.icms += num(i.icms_valor);
  }
  for (const k of Object.keys(t)) t[k] = Math.round(t[k] * 100) / 100;
  t.total = Math.round((t.produtos - t.desconto + t.frete + t.seguro + t.outras + t.ii + t.ipi) * 100) / 100;
  return t;
};
const totalNota = (n) => totaisNota(n).total;

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
    const [n, c, p, ops, pv, cf] = await Promise.all([
      base44.entities.NfeAvulsa.list("-created_date", 300),
      base44.entities.Contato.list("-created_date", 1000),
      base44.entities.Product.list("-created_date", 1000),
      base44.entities.ImportOperation.list("-created_date", 100).catch(() => []),
      base44.entities.SaleOrder.list("-created_date", 2000).catch(() => []),
      base44.entities.Cfop.list("codigo", 300).catch(() => []),
    ]);
    setCfops(cf || []);
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
    const doCfop = cfops.find(c => c.codigo === String(form.cfop || "") && c.ativo !== false)?.info_padrao;
    const t = doCfop || INFO_PADRAO[form.preset] || "";
    const tt = totaisNota(form); const trib = tt.ii + tt.ipi + tt.pis + tt.cofins + tt.icms;
    const base = t.replace("{tributos}", formatCurrency(trib));
    return baseTexto(base);
  };
  const baseTexto = (t) => {
    const vol = (form.items || []).reduce((sm, it) => sm + (parseFloat(it.quantity) || 0), 0);
    return t.replace("{di}", form.di?.numero || "____").replace("{data_di}", form.di?.data_registro ? form.di.data_registro.split("-").reverse().join("/") : "__/__/____").replace("{volumes}", vol ? `${vol} volume(s)` : "").replace("{ref}", form.chave_referenciada ? `chave ${form.chave_referenciada}` : "____").replace(/\n{2,}/g, "\n").trim();
  };
  // Fase B: preenche os impostos de cada item da importação (II, IPI, PIS 2,1%, COFINS 9,65%, ICMS por dentro).
  // Frete/seguro/outras despesas da nota são rateados por valor. A Larissa confere contra a DI e ajusta o que precisar.
  const calcularImportacao = () => {
    const its = form.items || []; if (!its.length) return;
    const somaProd = its.reduce((sm, i) => sm + num(i.quantity) * num(i.unit_price), 0) || 1;
    const aliqIcms = num(form.icms_aliq_padrao) || 18, aliqPis = num(form.pis_aliq_padrao) || 2.1, aliqCofins = num(form.cofins_aliq_padrao) || 9.65;
    const r2 = (v) => Math.round(v * 100) / 100;
    const novos = its.map((i, ix) => {
      const prod = num(i.quantity) * num(i.unit_price), fr = prod / somaProd;
      const frete = r2(num(form.frete) * fr), seguro = r2(num(form.seguro) * fr), outras = r2(num(form.outras_despesas) * fr), despAdu = r2(num(form.di?.despesas_aduaneiras) * fr);
      const va = r2(num(i.ii_base) > 0 ? num(i.ii_base) : prod + frete + seguro);      // valor aduaneiro
      const aliqII = num(i.ii_aliq), ii = r2(num(i.ii_valor) > 0 && !aliqII ? num(i.ii_valor) : va * aliqII / 100);
      const aliqIpi = num(i.ipi_aliq), ipiBase = r2(va + ii), ipi = r2(ipiBase * aliqIpi / 100);
      const pis = r2(va * aliqPis / 100), cofins = r2(va * aliqCofins / 100);
      const icmsBase = r2((va + ii + ipi + pis + cofins + outras + despAdu + num(i.ii_iof)) / (1 - aliqIcms / 100)), icms = r2(icmsBase * aliqIcms / 100);
      return { ...i, frete_item: frete, seguro_item: seguro, outras_item: outras, ii_base: va, ii_aliq: aliqII, ii_valor: ii, ii_despesas: despAdu, adicao: i.adicao ?? 1, seq_adicao: i.seq_adicao ?? (ix + 1),
        icms_csosn: i.icms_csosn || "900", icms_origem: i.icms_origem ?? "1", icms_mod_bc: i.icms_mod_bc || "3", icms_base: icmsBase, icms_aliq: aliqIcms, icms_valor: icms,
        ipi_cst: aliqIpi > 0 ? (i.ipi_cst && i.ipi_cst !== "49" ? i.ipi_cst : "00") : (i.ipi_cst || "49"), ipi_base: ipiBase, ipi_aliq: aliqIpi, ipi_valor: ipi,
        pis_cst: "01", pis_base: va, pis_aliq: aliqPis, pis_valor: pis, cofins_cst: "01", cofins_base: va, cofins_aliq: aliqCofins, cofins_valor: cofins };
    });
    setForm(prev => ({ ...prev, items: novos, frete: 0, seguro: 0, outras_despesas: 0 })); // rateado nos itens: a nota não repete
  };
  const salvarCfop = async () => {
    const d = { codigo: String(cfopDialog.codigo || "").replace(/\D/g, ""), descricao: cfopDialog.descricao || "", natureza: cfopDialog.natureza || "", tipo: cfopDialog.tipo || (String(cfopDialog.codigo || "").match(/^[123]/) ? "entrada" : "saida"), csosn: cfopDialog.csosn || "900", finalidade: parseInt(cfopDialog.finalidade) || 1, info_padrao: cfopDialog.info_padrao || "", ativo: cfopDialog.ativo !== false };
    if (d.codigo.length !== 4) { alert("CFOP tem 4 dígitos."); return; }
    if (cfopDialog.id) await base44.entities.Cfop.update(cfopDialog.id, d); else await base44.entities.Cfop.create(d);
    const cf = await base44.entities.Cfop.list("codigo", 300).catch(() => []); setCfops(cf || []); setCfopDialog({ lista: true });
  };
  const aplicarCfop = (codigo) => {
    const c = cfops.find(x => x.codigo === codigo); if (!c) return;
    setForm(prev => ({ ...prev, cfop: c.codigo, cfop_id: c.id, natureza_operacao: c.natureza || prev.natureza_operacao, tipo: c.tipo || prev.tipo, csosn: c.csosn || prev.csosn, finalidade: c.finalidade || prev.finalidade }));
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
                <div><Label className="flex items-center justify-between">CFOP <button type="button" className="text-[10px] text-primary underline font-normal" onClick={() => setCfopDialog({ lista: true })}>gerenciar CFOPs</button></Label>
                  <Select value={cfops.some(c => c.codigo === form.cfop) ? form.cfop : "manual"} onValueChange={v => v === "manual" ? null : aplicarCfop(v)}>
                    <SelectTrigger><SelectValue placeholder="Escolha no cadastro" /></SelectTrigger>
                    <SelectContent><SelectItem value="manual">— digitar —</SelectItem>{cfops.filter(c => c.ativo !== false).map(c => <SelectItem key={c.id} value={c.codigo}>{c.codigo} · {c.descricao}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="mt-1" value={form.cfop || ""} onChange={e => setForm({ ...form, cfop: e.target.value })} placeholder="Ex: 5949" /></div>
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
                  {(() => {
                    const ab = abaItem[ix] || "";
                    const set = (campo) => (e) => setItem(ix, campo, e.target.value);
                    const numIn = (campo, label, cols = "col-span-3") => <div className={cols}><Label className="text-[10px]">{label}</Label><Input type="number" step="0.01" className="h-8 text-xs" value={it[campo] ?? ""} onChange={set(campo)} /></div>;
                    const sel = (campo, label, opts, def, cols = "col-span-4") => <div className={cols}><Label className="text-[10px]">{label}</Label><Select value={String(it[campo] ?? def)} onValueChange={v => setItem(ix, campo, v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>;
                    return (<>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ABAS_ITEM.filter(([k]) => k !== "imp" || p.di || String(form.cfop || "").startsWith("3")).map(([k, l]) => <button key={k} type="button" className={`px-2 py-0.5 rounded text-[10px] border ${ab === k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`} onClick={() => setAbaItem(prev => ({ ...prev, [ix]: prev[ix] === k ? "" : k }))}>{l}</button>)}
                        {(num(it.icms_valor) || num(it.ii_valor) || num(it.pis_valor)) ? <span className="text-[10px] text-muted-foreground self-center ml-1">II {formatCurrency(num(it.ii_valor))} · IPI {formatCurrency(num(it.ipi_valor))} · PIS {formatCurrency(num(it.pis_valor))} · COFINS {formatCurrency(num(it.cofins_valor))} · ICMS {formatCurrency(num(it.icms_valor))}</span> : null}
                      </div>
                      {ab === "dados" && <div className="grid grid-cols-12 gap-2 items-end mt-1">
                        <div className="col-span-2"><Label className="text-[10px]">Código</Label><Input className="h-8 text-xs" value={it.sku || ""} onChange={set("sku")} /></div>
                        <div className="col-span-2"><Label className="text-[10px]">Unidade</Label><Input className="h-8 text-xs" value={it.unit || "UN"} onChange={set("unit")} /></div>
                        <div className="col-span-2"><Label className="text-[10px]">CFOP do item</Label><Input className="h-8 text-xs" value={it.cfop || ""} onChange={set("cfop")} placeholder={form.cfop || ""} /></div>
                        <div className="col-span-2"><Label className="text-[10px]">CEST</Label><Input className="h-8 text-xs" value={it.cest || ""} onChange={set("cest")} /></div>
                        <div className="col-span-2"><Label className="text-[10px]">GTIN/EAN</Label><Input className="h-8 text-xs" value={it.gtin || ""} onChange={set("gtin")} placeholder="SEM GTIN" /></div>
                        <div className="col-span-2"><Label className="text-[10px]">Total</Label><Input readOnly className="h-8 text-xs bg-muted" value={formatCurrency(num(it.quantity) * num(it.unit_price))} /></div>
                        {numIn("frete_item", "Frete (R$)")}{numIn("seguro_item", "Seguro (R$)")}{numIn("outras_item", "Outras desp. (R$)")}{numIn("desconto_item", "Desconto (R$)")}
                        <div className="col-span-12"><Label className="text-[10px]">Informações adicionais do item</Label><Input className="h-8 text-xs" value={it.info_adicional || ""} onChange={set("info_adicional")} /></div>
                      </div>}
                      {ab === "icms" && <div className="grid grid-cols-12 gap-2 items-end mt-1">
                        {sel("icms_csosn", "CSOSN", CSOSN, form.csosn || "900")}{sel("icms_origem", "Origem", ORIGENS, p.exterior ? "1" : "0")}{sel("icms_mod_bc", "Modalidade BC", MOD_BC, "3")}
                        {numIn("icms_base", "Base ICMS (R$)")}{numIn("icms_aliq", "% ICMS")}{numIn("icms_valor", "Valor ICMS (R$)")}{numIn("icms_red_bc", "% redução BC")}
                        <div className="col-span-12 text-[10px] text-muted-foreground">Simples Nacional: na importação a base é "por dentro" (valor aduaneiro + II + IPI + PIS + COFINS + despesas) ÷ (1 − alíquota). O botão "Calcular importação" faz essa conta.</div>
                      </div>}
                      {ab === "ipi" && <div className="grid grid-cols-12 gap-2 items-end mt-1">
                        {sel("ipi_cst", "CST IPI", CST_IPI, "49")}{numIn("ipi_base", "Base IPI (R$)")}{numIn("ipi_aliq", "% IPI")}{numIn("ipi_valor", "Valor IPI (R$)")}
                        <div className="col-span-3"><Label className="text-[10px]">Enquadramento</Label><Input className="h-8 text-xs" value={it.ipi_enq || "999"} onChange={set("ipi_enq")} /></div>
                      </div>}
                      {ab === "pis" && <div className="grid grid-cols-12 gap-2 items-end mt-1">
                        {sel("pis_cst", "CST PIS", CST_PIS, p.exterior ? "01" : "07")}{numIn("pis_base", "Base PIS (R$)")}{numIn("pis_aliq", "% PIS")}{numIn("pis_valor", "Valor PIS (R$)")}
                        {sel("cofins_cst", "CST COFINS", CST_PIS, p.exterior ? "01" : "07")}{numIn("cofins_base", "Base COFINS (R$)")}{numIn("cofins_aliq", "% COFINS")}{numIn("cofins_valor", "Valor COFINS (R$)")}
                      </div>}
                      {ab === "imp" && <div className="grid grid-cols-12 gap-2 items-end mt-1">
                        {numIn("ii_base", "Valor aduaneiro / base II (R$)", "col-span-4")}{numIn("ii_aliq", "% II", "col-span-2")}{numIn("ii_valor", "Valor II (R$)")}{numIn("ii_despesas", "Desp. aduaneiras (R$)")}
                        {numIn("ii_iof", "IOF (R$)")}
                        <div className="col-span-2"><Label className="text-[10px]">Nº adição</Label><Input type="number" min="1" className="h-8 text-xs" value={it.adicao ?? 1} onChange={set("adicao")} /></div>
                        <div className="col-span-2"><Label className="text-[10px]">Seq. na adição</Label><Input type="number" min="1" className="h-8 text-xs" value={it.seq_adicao ?? (ix + 1)} onChange={set("seq_adicao")} /></div>
                        <div className="col-span-5"><Label className="text-[10px]">Cód. fabricante (opcional)</Label><Input className="h-8 text-xs" value={it.cod_fabricante || ""} onChange={set("cod_fabricante")} /></div>
                        <div className="col-span-12 text-[10px] text-muted-foreground">Valor aduaneiro = produtos + frete + seguro. IPI incide sobre aduaneiro + II. PIS/COFINS sobre o aduaneiro.</div>
                      </div>}
                      {ab === "outros" && <div className="grid grid-cols-12 gap-2 items-end mt-1">
                        <div className="col-span-3"><Label className="text-[10px]">Unidade tributável</Label><Input className="h-8 text-xs" value={it.unit_trib || ""} onChange={set("unit_trib")} placeholder={it.unit || "UN"} /></div>
                        {numIn("qtd_trib", "Qtd tributável")}{numIn("vunit_trib", "Valor unit. tributável")}
                        {numIn("aprox_trib_pct", "% aprox. tributos (IBPT)")}{numIn("aprox_trib_valor", "Valor aprox. tributos (R$)")}
                        <div className="col-span-3"><Label className="text-[10px]">Nº pedido de compra</Label><Input className="h-8 text-xs" value={it.pedido_compra || ""} onChange={set("pedido_compra")} /></div>
                        <div className="col-span-3"><Label className="text-[10px]">Item do pedido</Label><Input className="h-8 text-xs" value={it.item_pedido_compra || ""} onChange={set("item_pedido_compra")} /></div>
                      </div>}
                    </>);
                  })()}
                </div>
              ))}
              {!(form.items || []).length && <p className="text-[10px] text-muted-foreground">Nenhum item — escolha um produto acima ou "item manual".</p>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><Label>Frete (R$)</Label><Input type="number" step="0.01" value={form.frete ?? ""} onChange={e => setForm({ ...form, frete: e.target.value })} /></div>
              <div><Label>Seguro (R$)</Label><Input type="number" step="0.01" value={form.seguro ?? ""} onChange={e => setForm({ ...form, seguro: e.target.value })} /></div>
              <div><Label>Outras despesas (R$)</Label><Input type="number" step="0.01" value={form.outras_despesas ?? ""} onChange={e => setForm({ ...form, outras_despesas: e.target.value })} /></div>
              <div><Label>Desconto (R$)</Label><Input type="number" step="0.01" value={form.desconto ?? ""} onChange={e => setForm({ ...form, desconto: e.target.value })} /></div>
              {(p.di || String(form.cfop || "").startsWith("3")) && <div className="col-span-2 sm:col-span-4 rounded-lg border border-dashed border-border p-2 flex flex-wrap items-end gap-2">
                <div><Label className="text-[10px]">% ICMS</Label><Input type="number" step="0.01" className="h-8 w-20 text-xs" value={form.icms_aliq_padrao ?? 18} onChange={e => setForm({ ...form, icms_aliq_padrao: e.target.value })} /></div>
                <div><Label className="text-[10px]">% PIS</Label><Input type="number" step="0.01" className="h-8 w-20 text-xs" value={form.pis_aliq_padrao ?? 2.1} onChange={e => setForm({ ...form, pis_aliq_padrao: e.target.value })} /></div>
                <div><Label className="text-[10px]">% COFINS</Label><Input type="number" step="0.01" className="h-8 w-20 text-xs" value={form.cofins_aliq_padrao ?? 9.65} onChange={e => setForm({ ...form, cofins_aliq_padrao: e.target.value })} /></div>
                <Button type="button" size="sm" variant="outline" onClick={calcularImportacao}>Calcular impostos da importação</Button>
                <span className="text-[10px] text-muted-foreground">Preenche II, IPI, PIS, COFINS e ICMS de cada item (% II e % IPI vêm da aba Importação/IPI de cada item). Confira contra a DI.</span>
              </div>}
              <div className="sm:col-span-2"><Label className="flex items-center justify-between">Informações adicionais / complementares <button type="button" className="text-[10px] text-primary underline font-normal" onClick={() => setForm({ ...form, informacoes_adicionais: [textoPadrao(), form.informacoes_adicionais].filter(Boolean).join("\n") })}>+ texto padrão da natureza</button></Label>
                <Textarea rows={4} value={form.informacoes_adicionais || ""} onChange={e => setForm({ ...form, informacoes_adicionais: e.target.value })} placeholder="Sai no rodapé da DANFE: volumes, DI, transporte, coleta, referência de NF…" />
                <p className="text-[10px] text-muted-foreground mt-1">Transporte, coleta, volumes, número da DI: tudo o que a contabilidade e o transportador precisam ler na nota.</p></div>
            </div>

            {(() => { const t = totaisNota(form); return (
            <div className="rounded-lg bg-muted/30 border border-border p-3 text-sm">
              <p className="font-semibold text-xs mb-2">Cálculo de imposto (somatório dos itens, como a SEFAZ confere)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Total dos produtos</span><span className="text-right">{formatCurrency(t.produtos)}</span>
                <span className="text-muted-foreground">Frete</span><span className="text-right">{formatCurrency(t.frete)}</span>
                <span className="text-muted-foreground">Seguro</span><span className="text-right">{formatCurrency(t.seguro)}</span>
                <span className="text-muted-foreground">Outras despesas</span><span className="text-right">{formatCurrency(t.outras)}</span>
                <span className="text-muted-foreground">Desconto</span><span className="text-right">− {formatCurrency(t.desconto)}</span>
                <span className="text-muted-foreground">II</span><span className="text-right">{formatCurrency(t.ii)}</span>
                <span className="text-muted-foreground">IPI</span><span className="text-right">{formatCurrency(t.ipi)}</span>
                <span className="text-muted-foreground">PIS · COFINS</span><span className="text-right">{formatCurrency(t.pis)} · {formatCurrency(t.cofins)}</span>
                <span className="text-muted-foreground">Base ICMS · ICMS</span><span className="text-right">{formatCurrency(t.icms_base)} · {formatCurrency(t.icms)}</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border"><span className="text-muted-foreground">Total da nota</span><span className="font-bold">{formatCurrency(t.total)}</span></div>
              <p className="text-[10px] text-muted-foreground mt-1">Total = produtos − desconto + frete + seguro + outras + II + IPI. PIS, COFINS e ICMS são destacados, não somam. Para mudar um total, mude o item: a SEFAZ rejeita nota cujo total não bate com os itens.</p>
            </div>); })()}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>Salvar rascunho</Button>
            <Button onClick={() => handleSave(true)} disabled={saving}>{saving ? "Processando..." : "Salvar e Emitir"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==== CADASTRO DE CFOP / NATUREZA (Fase B, 17/09) ==== */}
      <Dialog open={!!cfopDialog} onOpenChange={o => { if (!o) setCfopDialog(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>CFOPs e naturezas de operação</DialogTitle></DialogHeader>
          {cfopDialog && (cfopDialog.lista ? (<div className="space-y-2">
            <div className="flex justify-between items-center"><p className="text-xs text-muted-foreground">Cada CFOP carrega a natureza, o CSOSN, a finalidade e o texto padrão que sai em "Informações adicionais". {"{di}"}, {"{data_di}"}, {"{volumes}"}, {"{ref}"} e {"{tributos}"} são preenchidos na hora.</p><Button size="sm" onClick={() => setCfopDialog({ codigo: "", tipo: "saida", csosn: "900", finalidade: 1, ativo: true })}>+ Novo CFOP</Button></div>
            <table className="w-full text-xs"><thead><tr className="text-muted-foreground border-b border-border"><th className="text-left py-1">CFOP</th><th className="text-left py-1">Descrição</th><th className="text-left py-1">Natureza</th><th className="text-left py-1">Tipo</th><th className="text-left py-1">CSOSN</th><th></th></tr></thead>
              <tbody>{cfops.map(c => <tr key={c.id} className={`border-b border-border/50 ${c.ativo === false ? "opacity-50" : ""}`}><td className="py-1 font-mono">{c.codigo}</td><td className="py-1">{c.descricao}</td><td className="py-1">{c.natureza}</td><td className="py-1">{c.tipo}</td><td className="py-1">{c.csosn}</td><td className="py-1 text-right"><button className="text-primary underline" onClick={() => setCfopDialog({ ...c })}>editar</button></td></tr>)}</tbody></table>
          </div>) : (<div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><Label className="text-xs">CFOP</Label><Input value={cfopDialog.codigo || ""} onChange={e => setCfopDialog({ ...cfopDialog, codigo: e.target.value })} maxLength={4} /></div>
              <div className="col-span-3"><Label className="text-xs">Descrição</Label><Input value={cfopDialog.descricao || ""} onChange={e => setCfopDialog({ ...cfopDialog, descricao: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Natureza da operação (sai na NF)</Label><Input value={cfopDialog.natureza || ""} onChange={e => setCfopDialog({ ...cfopDialog, natureza: e.target.value })} /></div>
              <div><Label className="text-xs">Tipo</Label><Select value={cfopDialog.tipo || "saida"} onValueChange={v => setCfopDialog({ ...cfopDialog, tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="entrada">Entrada</SelectItem><SelectItem value="saida">Saída</SelectItem></SelectContent></Select></div>
              <div><Label className="text-xs">CSOSN</Label><Select value={cfopDialog.csosn || "900"} onValueChange={v => setCfopDialog({ ...cfopDialog, csosn: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CSOSN.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Finalidade</Label><Select value={String(cfopDialog.finalidade || 1)} onValueChange={v => setCfopDialog({ ...cfopDialog, finalidade: parseInt(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[["1","1 - Normal"],["2","2 - Complementar"],["3","3 - Ajuste"],["4","4 - Devolução"]].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div className="col-span-2 sm:col-span-3 flex items-end gap-2"><label className="text-xs flex items-center gap-2"><input type="checkbox" checked={cfopDialog.ativo !== false} onChange={e => setCfopDialog({ ...cfopDialog, ativo: e.target.checked })} /> Ativo</label></div>
              <div className="col-span-2 sm:col-span-4"><Label className="text-xs">Texto padrão das informações adicionais</Label><Textarea rows={3} value={cfopDialog.info_padrao || ""} onChange={e => setCfopDialog({ ...cfopDialog, info_padrao: e.target.value })} placeholder="Ex.: Valor aproximado dos tributos: {tributos}. Documento emitido por ME/EPP optante pelo Simples Nacional." /></div>
            </div>
            <div className="flex justify-between"><Button variant="ghost" onClick={() => setCfopDialog({ lista: true })}>← Lista</Button><Button onClick={salvarCfop}>Salvar CFOP</Button></div>
          </div>))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
