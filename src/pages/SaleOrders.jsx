import React, { useState, useEffect } from "react";
import { base44, supabase } from "@/api/base44Client";
import { Plus, Search, ShoppingCart, Edit, Trash2, Eye, FileText, Loader2, Printer, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import { reconciliarPedidoVenda, registrarMovimento } from "@/lib/stockService";
import { getCustoVigente, calcImpostosPct } from "@/lib/pricingCalc";
import { usePermissoes } from "@/hooks/usePermissoes";

const CHANNEL_TYPE_MAP = {
  direct: "venda_direta",
  mercado_livre: "mercado_livre_classico",
  woocommerce: "site_woocommerce",
  other: "outro",
};

export default function SaleOrders() {
  // O painel de margem líquida expõe custo e lucro — só para quem tem "custos".
  const { pode } = usePermissoes();
  const verCustos = pode("custos");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("todos"); const [fDe, setFDe] = useState(""); const [fAte, setFAte] = useState(""); // filtros (Larissa 17/09)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [channels, setChannels] = useState([]);
  const [pricings, setPricings] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [configTrib, setConfigTrib] = useState(null);
  // Contas de caixa: o Financeiro promete "qual método cai em qual conta (automático nos novos
  // lançamentos)" — e é aqui que a promessa vira lançamento com conta (Mauricio, 03/09/2026)
  const [contasCaixa, setContasCaixa] = useState([]);
  useEffect(() => { base44.entities.CashAccount.list("nome", 50).then(cs => setContasCaixa(cs || [])).catch(() => setContasCaixa([])); }, []);
  const [nfeBusy, setNfeBusy] = useState(null);
  // 16/09/2026 (pedidos da Larissa): cadastro de transportadoras para o autocompletar,
  // volumes/peso calculados pelo cadastro do produto, e DEVOLUÇÃO como evento próprio.
  const [transportadoras, setTransportadoras] = useState([]);
  // 16/09/2026 (Larissa): cadastro de transportadoras com CNPJ/telefone/contato, escolhido
  // no pedido por lista (não mais campo livre) — os dados vão para o pedido impresso.
  const TR_VAZIA = { nome: "", cnpj: "", telefone: "", contato: "", observacoes: "", ativo: true };
  const [trDialog, setTrDialog] = useState(null);
  // 17/09: transportadora É um contato do tipo "Transportador" (cadastro único em Contatos; a Rodonaves já estava lá)
  const recarregarTransportadoras = async () => { const cs = await base44.entities.Contato.list("-created_date", 1000).catch(() => []); setTransportadoras((cs || []).filter(c => (c.tipos || []).includes("Transportador") && c.status !== "inactive").map(c => ({ id: c.id, nome: c.name, cnpj: c.document, telefone: c.phone || c.whatsapp, contato: c.contact_name || "", cidade: c.city, ativo: true }))); };
  const salvarTransportadora = async () => {
    const nome = (trDialog.nome || "").trim(); if (!nome) return;
    const d = { name: nome, document: trDialog.cnpj || "", phone: trDialog.telefone || "", contact_name: trDialog.contato || "", city: trDialog.cidade || "", notes: trDialog.observacoes || "", tipos: ["Transportador"], person_type: "PJ", status: "active", country: "Brasil", currency: "BRL" };
    if (trDialog.id) await base44.entities.Contato.update(trDialog.id, { name: d.name, document: d.document, phone: d.phone, contact_name: d.contact_name, city: d.city }); else await base44.entities.Contato.create(d);
    await recarregarTransportadoras();
    setForm(prev => ({ ...prev, transportadora: nome }));
    setTrDialog({ ...TR_VAZIA });
  };
  const alternarTransportadora = async (t) => { await base44.entities.Contato.update(t.id, { status: "inactive" }); await recarregarTransportadoras(); };
  const trDoPedido = (nome) => transportadoras.find(x => (x.nome || "").trim().toLowerCase() === (nome || "").trim().toLowerCase());
  const [logAuto, setLogAuto] = useState(true);
  const [devolucoes, setDevolucoes] = useState([]);
  const [devDialog, setDevDialog] = useState(null);
  const [devSaving, setDevSaving] = useState(false);
  const hojeIso = () => new Date().toISOString().slice(0, 10);

  // Chama a edge function emitir-nfe com o login do usuário (tokens ficam no servidor)
  const chamarNfe = async (acao, orderId) => {
    const { data: sessao } = await supabase.auth.getSession();
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emitir-nfe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${sessao?.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ acao, sale_order_id: orderId }),
    });
    return r;
  };

  const handleEmitirNfe = async (o) => {
    if (!confirm(`Emitir NF-e do pedido ${o.order_number}?`)) return;
    setNfeBusy(o.id);
    try {
      const r = await chamarNfe("emitir", o.id);
      const resp = await r.json();
      if (!r.ok) { alert(resp.error || resp.mensagem || "Erro ao emitir."); }
      else {
        await new Promise(res => setTimeout(res, 9000));
        const s = await (await chamarNfe("status", o.id)).json();
        if (s.status === "autorizado") alert(`✅ NF-e AUTORIZADA!\nNúmero ${s.numero} série ${s.serie}\n${s.chave_nfe}`);
        else alert(`Status: ${s.status}\n${s.mensagem_sefaz || s.mensagem || "Consulte novamente em instantes."}`);
      }
    } catch (err) { alert(`Falha na emissão: ${err.message}`); }
    setNfeBusy(null);
    loadData();
  };

  const handleDanfe = async (o) => {
    setNfeBusy(o.id);
    try {
      const r = await chamarNfe("danfe", o.id);
      if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || "DANFE indisponível."); }
      else {
        const blob = await r.blob();
        window.open(URL.createObjectURL(blob), "_blank");
      }
    } catch (err) { alert(err.message); }
    setNfeBusy(null);
  };

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [o, c, p, ch, pr, cfgs, trs] = await Promise.all([
      base44.entities.SaleOrder.list("-created_date", 1000),
      base44.entities.Contato.list("-created_date", 1000).then(cs => (cs || []).filter(c => (c.tipos || []).includes("Cliente") && c.status !== "inactive")),
      base44.entities.Product.list("-created_date", 1000),
      base44.entities.SalesChannel.list("-created_date", 50),
      base44.entities.ProductPricing.list("-created_date", 1000),
      base44.entities.ConfigTributaria.list("-created_date", 5),
      base44.entities.Contato.list("-created_date", 1000).then(cs => (cs || []).filter(c => (c.tipos || []).includes("Transportador") && c.status !== "inactive").map(c => ({ id: c.id, nome: c.name, cnpj: c.document, telefone: c.phone || c.whatsapp, contato: c.contact_name || "", cidade: c.city, ativo: true }))).catch(() => []),
    ]);
    setOrders(o);
    setTransportadoras(trs || []);
    setCustomers(c);
    setProducts(p);
    setChannels(ch);
    setPricings(pr);
    setConfigTrib(cfgs?.[0] || null);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ status: "pending", channel: "direct", payment_method: "pix", payment_status: "pending", discount: 0, shipping_cost: 0, installments: 1, installment_interval_days: 30, first_due_days: 0, order_date: hojeIso() });
    setOrderItems([{ product_id: "", name: "", quantity: 1, unit_price: 0 }]);
    setLogAuto(true);
    setDevolucoes([]);
    setDialogOpen(true);
  };

  const [lancamentos, setLancamentos] = useState([]);
  const openEdit = (o) => {
    setEditing(o);
    setForm({ ...o });
    setOrderItems(o.items || [{ product_id: "", name: "", quantity: 1, unit_price: 0 }]);
    setLancamentos([]);
    setLogAuto(false); // pedido existente: volumes/peso já foram conferidos — não recalcular por cima
    base44.entities.FinancialEntry.filter({ reference_id: o.id, reference_type: "sale_order" }, "-created_date", 50)
      .then(e => setLancamentos(e || [])).catch(() => {});
    setDevolucoes([]);
    base44.entities.SaleReturn.filter({ sale_order_id: o.id }, "-data", 50).then(d => setDevolucoes(d || [])).catch(() => {});
    setDialogOpen(true);
  };

  const buscarCepEntrega = async (cepRaw) => {
    const cep = (cepRaw || "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const d = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json();
      if (!d.erro) setForm(prev => ({ ...prev, endereco_entrega: { ...prev.endereco_entrega, endereco: d.logradouro || prev.endereco_entrega?.endereco, bairro: d.bairro || prev.endereco_entrega?.bairro, cidade: d.localidade || prev.endereco_entrega?.cidade, uf: d.uf || prev.endereco_entrega?.uf } }));
    } catch { /* preenchimento manual segue */ }
  };

  const setEntrega = (campo, valor) => setForm(prev => ({ ...prev, endereco_entrega: { ...(prev.endereco_entrega || {}), [campo]: valor } }));

  // ==== PDF do pedido (Larissa: "enviamos aos clientes sempre para conferência") ====
  const gerarPdfPedido = (o) => {
    const cliente = customers.find(c => c.id === o.customer_id) || {};
    const itens = o.items || [];
    const subtotal = itens.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
    const total = subtotal - (o.discount || 0) + (o.shipping_cost || 0);
    const fmt = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
    const fpc = { 0: "CIF — por conta do remetente", 1: "FOB — por conta do destinatário", 2: "Por conta de terceiros", 3: "Transporte próprio (remetente)", 4: "Transporte próprio (destinatário)", 9: "Sem transporte" }[o.frete_por_conta] || "";
    const end = (c) => [c.address && `${c.address}${c.address_number ? `, ${c.address_number}` : ""}`, c.address_complement, c.neighborhood, c.city && `${c.city}/${c.state || ""}`, c.zip_code && `CEP ${c.zip_code}`].filter(Boolean).join(" — ");
    const ee = o.endereco_entrega || {};
    const endEntrega = [ee.nome, ee.endereco && `${ee.endereco}${ee.numero ? `, ${ee.numero}` : ""}`, ee.complemento, ee.bairro, ee.cidade && `${ee.cidade}/${ee.uf || ""}`, ee.cep && `CEP ${ee.cep}`].filter(Boolean).join(" — ");
    const w = window.open("", "_blank");
    if (!w) { alert("O navegador bloqueou a janela do PDF — libere pop-ups para o ERP e tente de novo."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pedido ${o.order_number}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:32px;font-size:13px}
  .topo{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #e65c00;padding-bottom:12px}
  .topo img{height:52px}
  h1{font-size:20px;margin:0}
  .muted{color:#666;font-size:11px}
  .bloco{margin-top:16px;border:1px solid #ddd;border-radius:8px;padding:12px}
  .bloco h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#e65c00;margin:0 0 6px}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th{background:#f5f5f5;text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase}
  td{padding:6px 8px;border-bottom:1px solid #eee}
  .dir{text-align:right}
  .tot{font-size:15px;font-weight:bold}
  .duas{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media print{ .noprint{display:none} }
</style></head><body>
<div class="topo">
  <div style="display:flex;align-items:center;gap:12px">
    <img src="${window.location.origin}/logo.png" onerror="this.style.display='none'">
    <div><h1>ROBOOSTER</h1><div class="muted">R B RESSUTI LTDA · CNPJ 43.926.449/0001-98<br>Av. Fernando Stecca, 745 — Iporanga — Sorocaba/SP — CEP 18087-149<br>www.robooster.com.br</div></div>
  </div>
  <div style="text-align:right"><h1>Pedido ${o.order_number}</h1><div class="muted">${o.order_date ? `Data da venda: ${o.order_date.split("-").reverse().join("/")}<br>` : ""}Emitido em ${new Date().toLocaleDateString("pt-BR")}</div></div>
</div>
<div class="duas">
  <div class="bloco"><h2>Cliente</h2>
    <strong>${cliente.name || o.customer_name || "—"}</strong><br>
    ${cliente.document ? `CPF/CNPJ: ${cliente.document}<br>` : ""}
    ${end(cliente) || ""}<br>
    ${[cliente.phone, cliente.whatsapp, cliente.email].filter(Boolean).join(" · ")}
  </div>
  <div class="bloco"><h2>Entrega</h2>
    ${o.entrega_diferente && endEntrega ? endEntrega : "No endereço de cobrança"}<br>
    ${o.transportadora ? (() => { const t = trDoPedido(o.transportadora); return `Transportadora: <strong>${o.transportadora}</strong>${t ? " — " + [t.cnpj && "CNPJ " + t.cnpj, t.telefone, t.contato].filter(Boolean).join(" · ") : ""}<br>`; })() : ""}
    ${fpc ? `Frete: ${fpc}<br>` : ""}
    ${o.volumes_qtd ? `Volumes: ${o.volumes_qtd} · ` : ""}${o.peso_bruto ? `Peso bruto: ${o.peso_bruto} kg` : ""}
  </div>
</div>
<div class="bloco"><h2>Itens</h2>
<table><thead><tr><th>Produto</th><th class="dir">Qtd</th><th class="dir">Preço unit.</th><th class="dir">Subtotal</th></tr></thead><tbody>
${itens.map(i => `<tr><td>${i.name || ""}</td><td class="dir">${i.quantity || 0}</td><td class="dir">${fmt(i.unit_price)}</td><td class="dir">${fmt((i.quantity || 0) * (i.unit_price || 0))}</td></tr>`).join("")}
</tbody><tfoot>
<tr><td colspan="3" class="dir">Subtotal</td><td class="dir">${fmt(subtotal)}</td></tr>
${o.discount ? `<tr><td colspan="3" class="dir">Desconto</td><td class="dir">−${fmt(o.discount)}</td></tr>` : ""}
${o.shipping_cost ? `<tr><td colspan="3" class="dir">Frete</td><td class="dir">${fmt(o.shipping_cost)}</td></tr>` : ""}
<tr class="tot"><td colspan="3" class="dir">TOTAL</td><td class="dir">${fmt(total)}</td></tr>
</tfoot></table></div>
${(o.pagamentos || []).length ? `<div class="bloco"><h2>Pagamento</h2>${o.pagamentos.map(p => `${{ pix: "Pix", credit_card: "Cartão de Crédito", debit_card: "Cartão de Débito", boleto: "Boleto", paypal: "PayPal", transfer: "Transferência", cash: "Dinheiro" }[p.metodo] || p.metodo}: ${fmt(parseFloat(p.valor) || 0)}${(p.parcelas || 1) > 1 ? ` em ${p.parcelas}×` : ""}`).join(" · ")}</div>` : ""}
${o.sinal_brl ? `<div class="bloco"><h2>Sinal</h2>Sinal recebido: ${fmt(o.sinal_brl)} — restante: ${fmt(Math.max(0, total - o.sinal_brl))}</div>` : ""}
<p class="muted" style="margin-top:20px">Documento de conferência do pedido — não é documento fiscal. A nota fiscal é emitida no faturamento.</p>
<div class="noprint" style="margin-top:16px"><button onclick="window.print()" style="padding:10px 24px;background:#e65c00;color:#fff;border:0;border-radius:8px;font-size:14px;cursor:pointer">🖨 Imprimir / Salvar PDF</button></div>
</body></html>`);
    w.document.close();
  };

  // Volumes e peso bruto pelo cadastro do produto × quantidade (Larissa, 15/09/2026):
  // 1 volume por unidade + as caixas extras cadastradas; peso = peso do produto + peso das caixas extras.
  const calcLogistica = (itens) => {
    let vol = 0, peso = 0;
    for (const it of itens || []) {
      const p = products.find(pr => pr.id === it.product_id);
      if (!p) continue;
      const q = parseFloat(it.quantity) || 0;
      const extras = Array.isArray(p.volumes_extras) ? p.volumes_extras : [];
      vol += (1 + extras.length) * q;
      peso += ((parseFloat(p.weight_kg) || 0) + extras.reduce((sx, v) => sx + (parseFloat(v.peso_kg) || 0), 0)) * q;
    }
    return { volumes_qtd: vol, peso_bruto: Math.round(peso * 1000) / 1000 };
  };
  useEffect(() => {
    if (!dialogOpen || !logAuto) return;
    const l = calcLogistica(orderItems);
    setForm(prev => (prev.volumes_qtd === l.volumes_qtd && prev.peso_bruto === l.peso_bruto) ? prev : { ...prev, ...l });
  }, [orderItems, logAuto, dialogOpen, products]);

  // ==== DEVOLUÇÃO DE VENDA (regra do Mauricio, 16/09/2026): mês fechado não reabre. ====
  // A devolução é um evento com data própria: volta o item ao estoque, lança o reembolso a pagar
  // no mês da devolução, estorna a comissão do vendedor (descontada do próximo pagamento) e
  // prepara a NF-e de devolução (nota avulsa, finalidade 4). Parcial permitida, proporcional.
  const abrirDevolucao = async (o) => {
    let anteriores = [];
    try { anteriores = await base44.entities.SaleReturn.filter({ sale_order_id: o.id }, "-data", 100); }
    catch (err) { alert(`Não consegui ler as devoluções anteriores deste pedido: ${err.message}`); return; }
    const jaDev = {};
    for (const r of anteriores || []) for (const i of (r.items || [])) { const k = i.product_id || i.name; jaDev[k] = (jaDev[k] || 0) + (parseFloat(i.quantity) || 0); }
    const itens = (o.items || []).map(it => { const k = it.product_id || it.name; const ja = jaDev[k] || 0; return { ...it, ja_devolvido: ja, qty_dev: Math.max(0, (parseFloat(it.quantity) || 0) - ja) }; });
    setDevDialog({ order: o, data: hojeIso(), motivo: "", itens, reembolsar: true, gerarNfe: !!o.nfe_chave, anteriores: anteriores || [] });
  };
  const calcDevolucao = (d) => {
    const o = d.order;
    const subtotal = (o.items || []).reduce((sx, i) => sx + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);
    const fatorDesc = subtotal > 0 ? Math.max(0, 1 - (parseFloat(o.discount) || 0) / subtotal) : 1;
    const ch = channels.find(c => c.id === o.channel_id) || null;
    const primeiro = products.find(p => p.id === (o.items || []).find(i => i.product_id)?.product_id) || null;
    const impPct = (o.imposto_aliquota != null && o.imposto_regime) ? (parseFloat(o.imposto_aliquota) || 0) : calcImpostosPct(configTrib, primeiro, ch).total;
    const rep = o.vendido_por === "representante";
    let valor = 0, comissao = 0, cmv = 0, qtdTotal = 0, tudo = true;
    for (const it of d.itens || []) {
      const q = parseFloat(it.qty_dev) || 0; const vendida = parseFloat(it.quantity) || 0;
      if (q + (it.ja_devolvido || 0) < vendida) tudo = false;
      if (q <= 0) continue;
      qtdTotal += q;
      const rec = q * (parseFloat(it.unit_price) || 0) * fatorDesc;
      valor += rec;
      const prod = products.find(pr => pr.id === it.product_id) || null;
      const pct = rep ? (parseFloat(prod?.seller_commission_percent) || 0) : (parseFloat(configTrib?.comissao_vendedor_padrao) || 0);
      comissao += rec * (1 - impPct / 100) * (pct / 100);
      cmv += (prod ? getCustoVigente(prod) : 0) * q;
    }
    const r2 = v => Math.round(v * 100) / 100;
    return { valor: r2(valor), comissao: r2(comissao), cmv: r2(cmv), fatorDesc, total: tudo && qtdTotal > 0, qtdTotal };
  };
  const confirmarDevolucao = async () => {
    if (!devDialog || devSaving) return;
    const o = devDialog.order;
    const itens = (devDialog.itens || []).filter(i => (parseFloat(i.qty_dev) || 0) > 0);
    if (!itens.length) { alert("Informe a quantidade devolvida de pelo menos um item."); return; }
    if (itens.some(i => (parseFloat(i.qty_dev) || 0) + (i.ja_devolvido || 0) > (parseFloat(i.quantity) || 0) + 1e-9)) { alert("Quantidade devolvida maior que a vendida em algum item."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(devDialog.data || "")) { alert("Informe a data da devolução."); return; }
    setDevSaving(true);
    try {
      const c = calcDevolucao(devDialog);
      const ret = await base44.entities.SaleReturn.create({
        sale_order_id: o.id, order_number: o.order_number, customer_id: o.customer_id || "", customer_name: o.customer_name || "",
        data: devDialog.data, motivo: devDialog.motivo || "",
        items: itens.map(i => ({ product_id: i.product_id || "", name: i.name || "", sku: i.sku || "", quantity: parseFloat(i.qty_dev) || 0, unit_price: parseFloat(i.unit_price) || 0, subtotal: Math.round((parseFloat(i.qty_dev) || 0) * (parseFloat(i.unit_price) || 0) * c.fatorDesc * 100) / 100 })),
        valor: c.valor, comissao_estornada: c.comissao, cmv_devolvido: c.cmv, devolucao_total: c.total, estoque_devolvido: false,
      });
      // 1) Estoque: entrada por devolução (Kardex), origem = a devolução — não confunde com os movimentos do pedido
      const errosEstoque = [];
      for (const i of itens) {
        if (!i.product_id) continue;
        try { await registrarMovimento({ productId: i.product_id, tipo: "devolucao_venda", quantidade: parseFloat(i.qty_dev) || 0, origemId: ret.id, origemRef: `DEV ${o.order_number}` }); }
        catch (e) { errosEstoque.push(`${i.name || i.product_id}: ${e.message}`); }
      }
      if (!errosEstoque.length) await base44.entities.SaleReturn.update(ret.id, { estoque_devolvido: true }).catch(() => {});
      // 2) Base instalada: máquina devolvida deixa de ser do cliente
      try {
        const maq = await base44.entities.BaseInstalada.filter({ sale_order_id: o.id }, "-created_date", 100);
        for (const i of itens) { let n = parseFloat(i.qty_dev) || 0; for (const m of (maq || []).filter(m => m.product_id === i.product_id)) { if (n <= 0) break; await base44.entities.BaseInstalada.delete(m.id); n--; } }
      } catch (e) { console.error("Base instalada não ajustada na devolução:", e); }
      // 3) Financeiro: reembolso a pagar, NO MÊS DA DEVOLUÇÃO (a venda de origem fica intacta)
      if (devDialog.reembolsar && c.valor > 0) {
        const metodo = ["pix", "boleto", "credit_card", "transfer", "cash"].includes(o.payment_method) ? o.payment_method : "other";
        await base44.entities.FinancialEntry.create({
          type: "payable", category: "devolucao_venda",
          description: `Reembolso devolução — Pedido ${o.order_number} — ${o.customer_name || "Cliente"}${devDialog.motivo ? ` (${devDialog.motivo})` : ""}`,
          reference_id: ret.id, reference_type: "sale_return",
          amount: c.valor, due_date: devDialog.data, status: "pending", payment_method: metodo, account_id: contaPara(metodo),
        });
      }
      // 4) Pedido: acumula o devolvido; devolução total muda o status (a data da venda NÃO muda)
      await base44.entities.SaleOrder.update(o.id, { valor_devolvido: Math.round(((parseFloat(o.valor_devolvido) || 0) + c.valor) * 100) / 100, ...(c.total ? { status: "returned" } : {}) });
      // 5) NF-e de devolução: nota avulsa de ENTRADA, finalidade 4, referenciando a chave da nota original
      let nfeMsg = "";
      if (devDialog.gerarNfe && o.nfe_chave) {
        try {
          const cli = customers.find(x => x.id === o.customer_id);
          const uf = cli?.state || "SP";
          const parcial = itens.length !== (o.items || []).length || !c.total;
          const nf = await base44.entities.NfeAvulsa.create({
            data: devDialog.data, tipo: "entrada", preset: "devolucao_venda", natureza_operacao: "Devolucao de venda", finalidade: 4,
            cfop: uf === "SP" ? "1202" : "2202", csosn: "102", contato_id: o.customer_id || "", chave_referenciada: o.nfe_chave,
            items: itens.map(i => { const pr = products.find(x => x.id === i.product_id); return { product_id: i.product_id || "", sku: i.sku || pr?.sku || "", name: i.name || pr?.name || "Item", ncm: pr?.ncm || "", unit: pr?.unit || "UN", quantity: parseFloat(i.qty_dev) || 0, unit_price: parseFloat(i.unit_price) || 0 }; }),
            informacoes_adicionais: `Devolucao referente a NF-e ${o.nfe_numero || ""} do pedido ${o.order_number}. ${devDialog.motivo || ""}`.trim(),
          });
          await base44.entities.SaleReturn.update(ret.id, { nfe_avulsa_id: nf.id }).catch(() => {});
          nfeMsg = `\n\nNF-e de devolução PREPARADA em Notas Fiscais (rascunho): confira e emita por lá.${parcial ? " Devolução parcial: confira que cada item está na MESMA posição da nota original (a referência é item a item)." : ""}`;
        } catch (e) { nfeMsg = `\n\nNão consegui preparar a NF-e de devolução: ${e.message}. Faça em Notas Fiscais → Devolução de venda.`; }
      } else if (devDialog.gerarNfe && !o.nfe_chave) {
        nfeMsg = "\n\nEste pedido não tem NF-e autorizada no ERP: a nota de devolução precisa ser feita em Notas Fiscais com a chave da nota original.";
      }
      alert(`Devolução registrada em ${devDialog.data.split("-").reverse().join("/")}.`
        + (errosEstoque.length ? `\n\nEstoque NÃO devolvido para: ${errosEstoque.join("; ")}` : "\nItens de volta ao estoque.")
        + (devDialog.reembolsar && c.valor > 0 ? `\nReembolso de ${formatCurrency(c.valor)} lançado como conta a pagar.` : "")
        + (c.comissao > 0 ? `\nComissão a estornar do vendedor: ${formatCurrency(c.comissao)} — descontar do próximo pagamento.` : "")
        + nfeMsg);
      setDevDialog(null);
      loadData();
    } catch (err) {
      alert(`Falha ao registrar a devolução: ${err.message}`);
    } finally { setDevSaving(false); }
  };

  const getChannelPrice = (productId, channelId) => {
    if (!channelId) return null;
    const pricing = pricings.find(p => p.product_id === productId && p.channel_id === channelId);
    return pricing?.price || null;
  };

  const canalDoPedido = () => channels.find(c => c.id === form.channel_id) || null;
  // Tabela de taxas por OPERADORA × PARCELAS (Configuração → Taxas de recebimento). Regra do
  // Mauricio 03/09: a taxa muda por operadora (PagBank, PayPal…) e por nº de parcelas, inclusive
  // 1x — nada de taxa fixa. A linha do pedido escolhe a operadora e o sistema busca a taxa.
  const operadoras = (configTrib?.taxas_operadoras || []).filter(o => (o.nome || "").trim());
  const operadoraDaLinha = (l) => operadoras.find(o => o.nome === l.operadora)
    || (l.metodo === "paypal" ? operadoras.find(o => /paypal/i.test(o.nome || "")) : null)
    || null;
  const taxaTabela = (l) => {
    const op = operadoraDaLinha(l);
    if (!op) return null;
    const v = l.metodo === "debit_card" ? op.debito : (op.parcelas || {})[String(Math.max(1, parseInt(l.parcelas) || 1))];
    return (v === "" || v == null || isNaN(parseFloat(v))) ? null : parseFloat(v);
  };
  const taxaDaLinha = (l) => (l.taxa_pct === "" || l.taxa_pct == null) ? (taxaTabela(l) ?? 0) : (parseFloat(l.taxa_pct) || 0);
  // Conta de caixa do lançamento: 1º a conta com o MESMO NOME da operadora (Rede, PagBank, PayPal…),
  // 2º a conta que o Financeiro mapeou para o método (Pix → Itaú, cartão → Rede…). Sem nada, fica em branco.
  const contaPara = (metodo, operadoraNome) => {
    const ativas = contasCaixa.filter(c => c.ativo !== false);
    const alvo = String(operadoraNome || "").trim().toLowerCase();
    const porNome = alvo ? ativas.find(c => (c.nome || "").trim().toLowerCase() === alvo) : null;
    const porMetodo = ativas.find(c => (c.metodos || []).includes(metodo));
    return (porNome || porMetodo)?.id || null;
  };

  const updateOrderItem = (idx, field, value) => {
    const updated = [...orderItems];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "product_id" && value) {
      const p = products.find(pr => pr.id === value);
      if (p) {
        updated[idx].name = p.name;
        updated[idx].sku = p.sku;
        const channelPrice = getChannelPrice(value, form.channel_id);
        updated[idx].unit_price = channelPrice ?? 0;
      }
    }
    setOrderItems(updated);
  };

  const handleChannelChange = (newChannelId) => {
    const ch = channels.find(c => c.id === newChannelId);
    const legado = ch?.type?.startsWith("mercado_livre") ? "mercado_livre" : ch?.type === "site_woocommerce" ? "woocommerce" : ch?.type === "venda_direta" ? "direct" : "other";
    setForm(prev => ({ ...prev, channel_id: newChannelId, channel: legado }));
    setOrderItems(prev => prev.map(item => {
      if (!item.product_id) return item;
      const price = getChannelPrice(item.product_id, newChannelId);
      return { ...item, unit_price: price ?? 0 };
    }));
  };

  const calcTotal = () => {
    const sub = orderItems.reduce((s, i) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0);
    return sub - (parseFloat(form.discount) || 0) + (parseFloat(form.shipping_cost) || 0);
  };

  // Status que baixam estoque e geram conta a receber
  const STATUS_BAIXA = ["invoiced", "shipped", "delivered"];

  const [savingOrder, setSavingOrder] = useState(false);
  const handleSave = async () => {
    if (savingOrder) return; // trava de duplo clique — evita PV duplicado e contas em dobro
    setSavingOrder(true);
    try {
    const sub = orderItems.reduce((s, i) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0);
    const total = calcTotal();
    const customer = customers.find(c => c.id === form.customer_id);
    const deveBaixar = STATUS_BAIXA.includes(form.status);

    // CARIMBO FISCAL: grava o regime e a alíquota VIGENTES no momento do pedido.
    // Mudar a chave Simples→Presumido no futuro NÃO reescreve o histórico — cada
    // pedido carrega o imposto do seu tempo.
    const impSnap = calcImpostosPct(configTrib, products.find(p => p.id === orderItems.find(i => i.product_id)?.product_id) || null, canalDoPedido());

    const data = {
      ...form,
      order_date: form.order_date || hojeIso(),
      customer_name: customer?.name || form.customer_name || "",
      items: orderItems,
      subtotal: sub,
      total,
      imposto_regime: impSnap.regime,
      imposto_aliquota: impSnap.total,
      imposto_valor: Math.round(total * impSnap.total) / 100,
      // Número SEQUENCIAL identificável (pedido da Larissa, 20/08/2026):
      // PV-1001, PV-1002... — pedidos antigos com código aleatório não mudam.
      order_number: form.order_number || (() => {
        const maxSeq = orders.reduce((m, o) => {
          const md = /^PV-(\d+)$/.exec(o.order_number || "");
          return md ? Math.max(m, parseInt(md[1], 10)) : m;
        }, 1000);
        return `PV-${maxSeq + 1}`;
      })(),
    };

    // 1) Salva o pedido primeiro para ter um ID (o Kardex referencia o pedido)
    let orderId;
    if (editing) {
      await base44.entities.SaleOrder.update(editing.id, data);
      orderId = editing.id;
    } else {
      const created = await base44.entities.SaleOrder.create(data);
      orderId = created.id;
    }

    // 1b) Transportadora digitada que não existe em Contatos entra lá como tipo "Transportador" (17/09)
    const nomeTr = (form.transportadora || "").trim();
    if (nomeTr && !transportadoras.some(t => (t.nome || "").trim().toLowerCase() === nomeTr.toLowerCase())) {
      try { await base44.entities.Contato.create({ name: nomeTr, tipos: ["Transportador"], person_type: "PJ", status: "active", country: "Brasil", currency: "BRL" }); } catch (e) { console.error("Transportadora não cadastrada em Contatos:", e); }
    }

    // 2) Estoque: reconcilia com o Kardex como fonte da verdade
    try {
      await reconciliarPedidoVenda(orderId, data.order_number, orderItems, deveBaixar);
    } catch (err) {
      // Sem estoque suficiente: pedido volta para Pendente e o usuário é avisado
      await base44.entities.SaleOrder.update(orderId, { status: "pending" }).catch(() => {});
      alert(`Não foi possível baixar o estoque: ${err.message}\n\nO pedido foi salvo como PENDENTE.`);
      setDialogOpen(false);
      loadData();
      return;
    }

    // 2b) Base instalada: pedido faturado com MÁQUINA → cliente passa a "possuir" a máquina.
    // Reconciliação simples: apaga os registros deste pedido e recria (edições não duplicam).
    try {
      const existentes = await base44.entities.BaseInstalada.filter({ sale_order_id: orderId }, "-created_date", 100);
      for (const b of (existentes || [])) await base44.entities.BaseInstalada.delete(b.id);
      if (deveBaixar && form.customer_id) {
        for (const item of orderItems) {
          const p = products.find(pr => pr.id === item.product_id);
          if (!p || !["Coladeira de Borda", "Coletor de Pó"].includes(p.category_name)) continue;
          for (let n = 0; n < (item.quantity || 1); n++) {
            await base44.entities.BaseInstalada.create({
              contato_id: form.customer_id,
              product_id: p.id,
              sale_order_id: orderId,
              data_venda: (form.order_date || new Date().toISOString().slice(0, 10)),
              origem: "pedido",
            });
          }
        }
      }
    } catch (err) {
      console.error("Base instalada não atualizada:", err);
    }

    // 3) Financeiro: contas a receber automáticas (parcelas + liberação do marketplace).
    // Erro aqui precisa aparecer: engolir a consulta duplicaria parcelas.
    try {
    const entradas = await base44.entities.FinancialEntry.filter({ reference_id: orderId, reference_type: "sale_order" }, "-created_date", 100);
    // Só RECEBÍVEIS pagos abatem o restante — a taxa de cartão/antecipação (payable) não é dinheiro que entrou
    const pagas = (entradas || []).filter(e => e.status === "paid" && e.type !== "payable");
    const pendentes = (entradas || []).filter(e => e.status === "pending" || e.status === "overdue");

    // 16/09/2026 (Larissa, pedido do Rodolfo): pedido CANCELADO com sinal já recebido.
    // O recebimento fica no financeiro (o dinheiro entrou no banco), mas ganha a marca
    // "PEDIDO CANCELADO" e, se ela confirmar, nasce a conta a pagar da devolução ao cliente.
    if (form.status === "cancelled" && pagas.length > 0) {
      const totalRecebido = Math.round(pagas.reduce((t, e) => t + (e.amount || 0), 0) * 100) / 100;
      for (const e of pagas) {
        if (!/PEDIDO CANCELADO/.test(e.description || "")) {
          await base44.entities.FinancialEntry.update(e.id, { description: `${e.description} · PEDIDO CANCELADO`, notes: `${e.notes ? e.notes + " " : ""}Pedido cancelado em ${hojeIso().split("-").reverse().join("/")}.` });
        }
      }
      const jaTemDevolucao = (entradas || []).some(e => e.type === "payable" && /Devolução ao cliente/.test(e.description || ""));
      if (!jaTemDevolucao && window.confirm(`Este pedido tem ${formatCurrency(totalRecebido)} já recebidos (sinal/parcelas).\n\nRegistrar a devolução ao cliente como conta a pagar de hoje?\n(Cancelar = o valor fica como recebido, sem devolução.)`)) {
        await base44.entities.FinancialEntry.create({
          type: "payable", category: "other",
          description: `Devolução ao cliente — Pedido ${data.order_number} cancelado — ${data.customer_name || "Cliente"}`,
          reference_id: orderId, reference_type: "sale_order", amount: totalRecebido,
          due_date: hojeIso(), status: "pending", payment_method: "pix",
        });
      }
    }

    // SINAL (reserva de máquina, regra 19/08/2026): lançado como conta RECEBIDA na
    // hora, mesmo com o pedido apenas Aprovado — o caixa reflete o dinheiro que já
    // entrou. Quando o pedido for faturado, as parcelas nascem só do RESTANTE
    // (a regra abaixo desconta tudo que está pago, sinal incluído).
    const sinalBrl = Math.round((parseFloat(form.sinal_brl) || 0) * 100) / 100;
    const sinalExistente = pagas.find(e => (e.description || "").startsWith("Sinal"));
    const temSinalLancado = !!sinalExistente;
    // Sinal reforçado/corrigido depois de lançado: o valor da conta acompanha
    if (sinalExistente && sinalBrl > 0 && Math.abs((parseFloat(sinalExistente.amount) || 0) - sinalBrl) >= 0.01) {
      await base44.entities.FinancialEntry.update(sinalExistente.id, { amount: sinalBrl });
      sinalExistente.amount = sinalBrl;
    }
    if (sinalBrl > 0 && !temSinalLancado) {
      const hoje = new Date().toISOString().slice(0, 10);
      const metodoSinal = ["pix", "boleto", "credit_card", "transfer", "cash"].includes(form.payment_method) ? form.payment_method : "pix";
      await base44.entities.FinancialEntry.create({
        type: "receivable",
        category: "sale",
        description: `Sinal — Pedido ${data.order_number} — ${data.customer_name || "Cliente"}`,
        reference_id: orderId,
        reference_type: "sale_order",
        amount: sinalBrl,
        due_date: hoje,
        status: "paid",
        payment_date: hoje,
        payment_method: metodoSinal,
        account_id: contaPara(metodoSinal),
      });
      pagas.push({ amount: sinalBrl, status: "paid", description: "Sinal" });
    }

    // Se NADA financeiro mudou numa edição de pedido já faturado (ex.: só ajustou
    // a transportadora), as parcelas existentes são PRESERVADAS — cancelar e
    // recriar re-basearia todos os vencimentos para hoje e apagaria o atraso.
    const financeiroInalterado = editing && deveBaixar && STATUS_BAIXA.includes(editing.status) && pendentes.length > 0 &&
      Math.abs((editing.total || 0) - total) < 0.01 &&
      (editing.installments || 1) === (form.installments || 1) &&
      (editing.installment_interval_days ?? 30) === (form.installment_interval_days ?? 30) &&
      (editing.first_due_days ?? 0) === (form.first_due_days ?? 0) &&
      (editing.channel_id || "") === (form.channel_id || "") &&
      (editing.payment_status || "pending") === (form.payment_status || "pending") &&
      Math.round((parseFloat(editing.sinal_brl) || 0) * 100) === Math.round(sinalBrl * 100) &&
      JSON.stringify(editing.pagamentos || []) === JSON.stringify(form.pagamentos || []);

    if (!financeiroInalterado) {
    // APAGA as pendentes antigas (as pagas são preservadas sempre). Ordem do Mauricio 03/09:
    // "quero que desapareça, não fique riscado — polui a tela". Nada de status "cancelled".
    for (const e of pendentes) {
      await base44.entities.FinancialEntry.delete(e.id);
    }

    if (deveBaixar) {
      const canalObj = channels.find(c => c.id === form.channel_id);
      const comissaoPct = canalObj?.commission_percent || 0;
      const taxaFixa = canalObj?.fixed_fee || 0;
      const diasLiberacao = canalObj?.dias_liberacao || 0;
      const intermediado = comissaoPct > 0 || diasLiberacao > 0;
      const totalPago = pagas.reduce((t, e) => t + (e.amount || 0), 0);
      const metodoValido = ["pix", "boleto", "credit_card", "transfer", "cash"].includes(form.payment_method) ? form.payment_method : "other";
      const hojeStr = () => new Date().toISOString().slice(0, 10);
      // Próximo dia útil (seg-sex; feriado não é considerado) — data padrão do crédito antecipado
      const proximoDiaUtil = () => { const d = new Date(); d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
      const METODOS_ANTECIPAVEIS = ["credit_card", "debit_card", "paypal"];

      // Linhas de "Pagamento misto" preenchidas MANDAM sobre o canal intermediado
      // (03/09/2026): no canal "Venda Site" (12%) a cliente pagou sinal Pix + restante
      // direto à Robooster — o recebimento líquido do canal não descreve esse caixa.
      const temLinhasMistas = (form.pagamentos || []).some(l => (parseFloat(l.valor) || 0) > 0);
      if (intermediado && !temLinhasMistas) {
        // Marketplace / PayPal / cartão intermediado: recebimento ÚNICO, LÍQUIDO da comissão, na data de liberação
        const liquido = Math.round((total * (1 - comissaoPct / 100) - taxaFixa) * 100) / 100;
        const restante = Math.max(0, liquido - totalPago);
        if (restante > 0) {
          const venc = new Date();
          venc.setDate(venc.getDate() + diasLiberacao);
          await base44.entities.FinancialEntry.create({
            type: "receivable",
            category: "sale",
            description: `Pedido ${data.order_number} — ${data.customer_name || "Cliente"} · ${canalObj?.name || "canal"} (líquido de ${comissaoPct}% de comissão${taxaFixa > 0 ? " + taxa fixa" : ""})`,
            reference_id: orderId,
            reference_type: "sale_order",
            amount: restante,
            due_date: venc.toISOString().slice(0, 10),
            status: form.payment_status === "paid" ? "paid" : "pending",
            payment_method: metodoValido,
            account_id: contaPara(metodoValido),
            ...(form.payment_status === "paid" ? { payment_date: hojeStr() } : {}),
          });
        }
      } else if (temLinhasMistas) {
        // PAGAMENTO MISTO: cada forma vira conta(s) a receber própria(s), com o
        // método correto — parte Pix cai como Pix, parte cartão como cartão.
        // Como nos outros ramos, o que JÁ FOI PAGO (sinal, parcela recebida)
        // abate: as linhas são reescaladas para somar só o restante do pedido.
        const rotulos = { pix: "Pix", credit_card: "Cartão de Crédito", debit_card: "Cartão de Débito", boleto: "Boleto", paypal: "PayPal", transfer: "Transferência", cash: "Dinheiro" };
        const intervaloMix = Math.max(1, parseInt(form.installment_interval_days) || 30);
        const primeiroVencMix = Math.max(0, parseInt(form.first_due_days) || 0);
        const restanteGeral = Math.max(0, total - totalPago);
        // O que já foi RECEBIDO em cada forma abate DAQUELA forma (a conta paga
        // carrega "· Pix" etc. na descrição) — Pix quitado não renasce pendente.
        // Saldo pago consumido SEQUENCIALMENTE entre linhas do mesmo método —
        // duas linhas "Pix" não abatem o mesmo pagamento em dobro.
        const saldoPago = {};
        for (const l of form.pagamentos) {
          if (saldoPago[l.metodo] === undefined) {
            saldoPago[l.metodo] = pagas
              .filter(e => (e.description || "").includes(`· ${rotulos[l.metodo] || l.metodo}`))
              .reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
          }
        }
        const linhasCalc = form.pagamentos.map(l => {
          const abate = Math.min(parseFloat(l.valor) || 0, saldoPago[l.metodo] || 0);
          saldoPago[l.metodo] = (saldoPago[l.metodo] || 0) - abate;
          return { ...l, restanteLinha: Math.max(0, (parseFloat(l.valor) || 0) - abate) };
        });
        const somaRestantes = linhasCalc.reduce((s, l) => s + l.restanteLinha, 0);
        // Nunca cobrar mais que o restante do pedido; reconcilia os centavos na última linha
        const fator = somaRestantes > 0 ? Math.min(1, restanteGeral / somaRestantes) : 0;
        let alocado = 0;
        const linhasComValor = linhasCalc.filter(l => l.restanteLinha > 0);
        for (let li = 0; li < linhasComValor.length; li++) {
          const linha = linhasComValor[li];
          const ultimaLinha = li === linhasComValor.length - 1;
          const alvoTotal = Math.min(restanteGeral, Math.round(somaRestantes * fator * 100) / 100);
          const valorLinha = ultimaLinha
            ? Math.round((alvoTotal - alocado) * 100) / 100
            : Math.round(linha.restanteLinha * fator * 100) / 100;
          alocado = Math.round((alocado + valorLinha) * 100) / 100;
          if (valorLinha <= 0) continue;
          const nParc = Math.max(1, parseInt(linha.parcelas) || 1);
          // Data própria da linha (pedido da Larissa/Mauricio 28/08): sinal pago em
          // 28/07 nasce como conta PAGA naquela data; parcela futura vence na data
          // informada. Sem data = prazos padrão do pedido, como sempre foi.
          const dataLinha = /^\d{4}-\d{2}-\d{2}$/.test(linha.data || "") ? linha.data : null;
          const linhaPaga = !!linha.pago && !!dataLinha;
          const rotuloLinha = rotulos[linha.metodo] || linha.metodo;
          // ANTECIPAÇÃO (regra do Mauricio, 03/09/2026): cartão e PayPal entram À VISTA em
          // 99% dos casos — o preço já embute o juro, a adquirente/PayPal credita o valor
          // cheio na data do crédito e a taxa vira DESPESA. Então: UM recebível (bruto) na
          // data (vazia = próximo dia útil) + UM pagável "card_fee" com a taxa, em vez de
          // 12/18 contas a receber que nunca vão existir. "Sem antecipação" mantém o antigo.
          const antecipa = METODOS_ANTECIPAVEIS.includes(linha.metodo) && linha.antecipar !== false;
          if (antecipa) {
            const credito = dataLinha || proximoDiaUtil();
            const taxaPct = Math.max(0, taxaDaLinha(linha)); // vazio na linha = padrão da Configuração
            const taxaRs = Math.round(valorLinha * taxaPct) / 100;
            const pago = linhaPaga || form.payment_status === "paid";
            await base44.entities.FinancialEntry.create({
              type: "receivable",
              category: "sale",
              description: `Pedido ${data.order_number} — ${data.customer_name || "Cliente"} · ${rotuloLinha}${nParc > 1 ? ` ${nParc}x` : ""} antecipado`,
              reference_id: orderId,
              reference_type: "sale_order",
              amount: valorLinha,
              due_date: credito,
              status: pago ? "paid" : "pending",
              payment_method: linha.metodo || "other",
              account_id: contaPara(linha.metodo, operadoraDaLinha(linha)?.nome),
              ...(pago ? { payment_date: credito } : {}),
            });
            if (taxaRs > 0) {
              await base44.entities.FinancialEntry.create({
                type: "payable",
                category: "card_fee",
                description: `Taxa ${taxaPct}% ${operadoraDaLinha(linha)?.nome ? `${operadoraDaLinha(linha).nome} · ` : ""}${rotuloLinha}${linha.metodo === "debit_card" ? "" : ` ${nParc}x`} (antecipação) — Pedido ${data.order_number} — ${data.customer_name || "Cliente"}`,
                reference_id: orderId,
                reference_type: "sale_order",
                amount: taxaRs,
                due_date: credito,
                status: pago ? "paid" : "pending",
                payment_method: linha.metodo || "other",
              account_id: contaPara(linha.metodo, operadoraDaLinha(linha)?.nome),
                ...(pago ? { payment_date: credito } : {}),
              });
            }
            continue;
          }
          const vParc = Math.round((valorLinha / nParc) * 100) / 100;
          for (let i = 0; i < nParc; i++) {
            let venc;
            if (dataLinha) {
              venc = new Date(dataLinha + "T12:00:00");
              venc.setDate(venc.getDate() + i * intervaloMix);
            } else {
              venc = new Date();
              venc.setDate(venc.getDate() + primeiroVencMix + i * intervaloMix);
            }
            const ultima = i === nParc - 1;
            const valor = ultima ? Math.round((valorLinha - vParc * (nParc - 1)) * 100) / 100 : vParc;
            await base44.entities.FinancialEntry.create({
              type: "receivable",
              category: "sale",
              description: `Pedido ${data.order_number} — ${data.customer_name || "Cliente"} · ${rotulos[linha.metodo] || linha.metodo}${nParc > 1 ? ` (parcela ${i + 1}/${nParc})` : ""}`,
              reference_id: orderId,
              reference_type: "sale_order",
              amount: valor,
              due_date: venc.toISOString().slice(0, 10),
              status: linhaPaga || form.payment_status === "paid" ? "paid" : "pending",
              payment_method: linha.metodo || "other",
              account_id: contaPara(linha.metodo, operadoraDaLinha(linha)?.nome),
              ...(linhaPaga ? { payment_date: dataLinha } : (form.payment_status === "paid" ? { payment_date: hojeStr() } : {})),
            });
          }
        }
      } else {
        // Venda direta: boleto parcelado gera N parcelas brutas com vencimentos reais
        const nParcelas = Math.max(1, parseInt(form.installments) || 1);
        const intervalo = Math.max(0, parseInt(form.installment_interval_days) || 30);
        const primeiroVenc = Math.max(0, parseInt(form.first_due_days) || 0);
        const restante = Math.max(0, total - totalPago);
        // O SINAL abate o VALOR, mas não conta como parcela do plano
        const parcelasPagas = pagas.filter(e => !(e.description || "").startsWith("Sinal")).length;
        const parcelasRestantes = Math.max(1, nParcelas - parcelasPagas);
        const valorParcela = Math.round((restante / parcelasRestantes) * 100) / 100;

        if (restante > 0) {
          for (let i = 0; i < parcelasRestantes; i++) {
            const venc = new Date();
            venc.setDate(venc.getDate() + primeiroVenc + i * intervalo);
            const ultima = i === parcelasRestantes - 1;
            const valor = ultima ? Math.round((restante - valorParcela * (parcelasRestantes - 1)) * 100) / 100 : valorParcela;
            const idxParcela = parcelasPagas + i + 1;
            await base44.entities.FinancialEntry.create({
              type: "receivable",
              category: "sale",
              description: `Pedido ${data.order_number} — ${data.customer_name || "Cliente"}${nParcelas > 1 ? ` (parcela ${idxParcela}/${nParcelas})` : ""}`,
              reference_id: orderId,
              reference_type: "sale_order",
              amount: valor,
              due_date: venc.toISOString().slice(0, 10),
              status: form.payment_status === "paid" ? "paid" : "pending",
              payment_method: metodoValido,
            account_id: contaPara(metodoValido),
              ...(form.payment_status === "paid" ? { payment_date: hojeStr() } : {}),
            });
          }
        }
      }
    }
    } // fim de !financeiroInalterado
    } catch (err) {
      alert(`O pedido e o estoque foram salvos, mas houve erro ao gerar as contas a receber: ${err.message}\n\nConfira o Financeiro antes de salvar de novo.`);
    }

    setDialogOpen(false);
    await loadData(); // aguardado: o próximo pedido numera em cima da lista fresca
    } catch (err) {
      // Sem isto, uma falha no create/update morre em silêncio e o usuário acha que salvou
      alert(`FALHA AO SALVAR O PEDIDO: ${err.message}\n\nConfira na lista se ele apareceu antes de tentar de novo (para não duplicar).`);
    } finally {
      setSavingOrder(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este pedido?")) return;
    const order = orders.find(o => o.id === id);
    try {
      // Reconcilia o estoque para zero (devolve o que estiver baixado)
      await reconciliarPedidoVenda(id, order?.order_number, order?.items || [], false);
      // Base Instalada: máquinas registradas por ESTE pedido saem junto
      const maquinas = await base44.entities.BaseInstalada.filter({ sale_order_id: id }, "-created_date", 50).catch(() => []);
      for (const mq of maquinas) await base44.entities.BaseInstalada.delete(mq.id).catch(() => {});
      // APAGA todas as contas em aberto do pedido (um 12x tem 12 parcelas); as pagas ficam
      const entradas = await base44.entities.FinancialEntry.filter({ reference_id: id, reference_type: "sale_order" }, "-created_date", 100);
      for (const e of entradas || []) {
        if (e.status !== "paid") {
          await base44.entities.FinancialEntry.delete(e.id);
        }
      }
      await base44.entities.SaleOrder.delete(id);
    } catch (err) {
      alert(`Não foi possível excluir o pedido: ${err.message}`);
    }
    loadData();
  };

  const formatCurrency = (val) => {
    if (!val && val !== 0) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const filtered = orders.filter(o => {
    const txt = !search || o.order_number?.toLowerCase().includes(search.toLowerCase()) || o.customer_name?.toLowerCase().includes(search.toLowerCase());
    const st = fStatus === "todos" || (fStatus === "abertos" ? !["cancelled", "returned", "delivered"].includes(o.status) : o.status === fStatus);
    const d = o.order_date || (o.created_date || "").slice(0, 10);
    const dt = (!fDe || d >= fDe) && (!fAte || d <= fAte);
    return txt && st && dt;
  });

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader title="Pedidos de Venda" description={`${orders.length} pedidos`} actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo Pedido</Button>} />

      {orders.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Nenhum pedido" description="Crie pedidos de venda para seus clientes." actionLabel="Novo Pedido" onAction={openNew} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar pedido..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div><Label className="text-[10px] text-muted-foreground">Situação</Label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[["todos","Todos"],["abertos","Em aberto"],["pending","Pendente"],["approved","Aprovado"],["invoiced","Faturado"],["shipped","Enviado"],["delivered","Entregue"],["cancelled","Cancelado"],["returned","Devolvido"]].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div><Label className="text-[10px] text-muted-foreground">Data do pedido: de</Label><Input type="date" value={fDe} onChange={e => setFDe(e.target.value)} className="w-40" /></div>
            <div><Label className="text-[10px] text-muted-foreground">até</Label><Input type="date" value={fAte} onChange={e => setFAte(e.target.value)} className="w-40" /></div>
            {(fStatus !== "todos" || fDe || fAte || search) && <Button type="button" variant="ghost" size="sm" onClick={() => { setFStatus("todos"); setFDe(""); setFAte(""); setSearch(""); }}>Limpar</Button>}
            <span className="text-xs text-muted-foreground self-center">{filtered.length} de {orders.length}</span>
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pedido</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Data</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Cliente</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Canal</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Pagamento</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr></thead>
                <tbody>
                  {filtered.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{o.order_number || `#${o.id.slice(0,6)}`}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs">{((o.order_date || (o.created_date || "").slice(0, 10)) || "").split("-").reverse().join("/") || "—"}</td>
                      <td className="px-4 py-3 hidden md:table-cell">{o.customer_name || "—"}</td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell text-xs">{o.channel}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(o.total)}{(parseFloat(o.valor_devolvido) || 0) > 0 && <span className="block text-[10px] text-destructive font-normal">devolvido {formatCurrency(o.valor_devolvido)}</span>}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell"><StatusBadge status={o.payment_status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {o.nfe_status === "autorizado" ? (
                            <button onClick={() => handleDanfe(o)} disabled={nfeBusy === o.id} title={`NF-e ${o.nfe_numero} autorizada — ver DANFE`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-success/10 text-success hover:bg-success/20">
                              {nfeBusy === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} NF {o.nfe_numero}
                            </button>
                          ) : STATUS_BAIXA.includes(o.status) ? (
                            <button onClick={() => handleEmitirNfe(o)} disabled={nfeBusy === o.id} title={o.nfe_mensagem || "Emitir NF-e"}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium ${o.nfe_status && o.nfe_status !== "autorizado" ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : "bg-primary/10 text-primary hover:bg-primary/20"}`}>
                              {nfeBusy === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                              {o.nfe_status && o.nfe_status !== "autorizado" ? "Reemitir" : "Emitir NF-e"}
                            </button>
                          ) : null}
                          {(STATUS_BAIXA.includes(o.status) || o.status === "returned") && (
                            <button onClick={() => abrirDevolucao(o)} className="p-1.5 hover:bg-warning/10 rounded-lg" title="Registrar devolução (total ou parcial)"><RotateCcw className="w-3.5 h-3.5 text-warning" /></button>
                          )}
                          <button onClick={() => gerarPdfPedido(o)} className="p-1.5 hover:bg-muted rounded-lg" title="PDF do pedido (enviar ao cliente)"><Printer className="w-3.5 h-3.5 text-primary" /></button>
                          <button onClick={() => openEdit(o)} className="p-1.5 hover:bg-muted rounded-lg"><Edit className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => handleDelete(o.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar Pedido" : "Novo Pedido de Venda"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div>
              <Label>Cliente</Label>
              <Combobox
                value={form.customer_id || "none"}
                onChange={v => setForm({...form, customer_id: v === "none" ? "" : v})}
                placeholder="Selecione o cliente"
                searchPlaceholder="Nome, CPF, CNPJ ou telefone…"
                emptyText="Nenhum cliente com esse nome ou documento"
                options={[{ value: "none", label: "Nenhum" }, ...customers.map(c => ({
                  value: c.id, label: c.name,
                  sub: [c.document, c.phone].filter(Boolean).join(" · "),
                  keywords: [c.document, c.phone, c.email],
                }))]}
              />
            </div>
            <div>
              <Label>Canal</Label>
              <Select value={form.channel_id || ""} onValueChange={v => handleChannelChange(v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o canal" /></SelectTrigger>
                <SelectContent>
                  {channels.filter(c => c.active !== false).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.commission_percent > 0 ? ` (${c.commission_percent}%)` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendido por</Label>
              <Select value={form.vendido_por || "vendedor"} onValueChange={v => setForm({...form, vendido_por: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">Vendedor (comissão padrão)</SelectItem>
                  <SelectItem value="representante">Representante (comissão do produto)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-0.5">A comissão é de quem fez a venda: vendedor usa a % padrão (Config. Tributária); representante usa a % cadastrada em cada produto.</p>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || "pending"} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[["pending","Pendente"],["approved","Aprovado"],["invoiced","Faturado"],["shipped","Enviado"],["delivered","Entregue"],["cancelled","Cancelado"],["returned","Devolvido"]].map(([s, label]) => <SelectItem key={s} value={s}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data da venda</Label>
              <Input type="date" value={form.order_date || ""} onChange={e => setForm({...form, order_date: e.target.value})} />
              <p className="text-[10px] text-muted-foreground mt-0.5">Mês da receita, da comissão e da garantia. Uma devolução futura não mexe nesta data — entra no mês em que acontecer.</p>
            </div>
            <div>
              <Label>Pagamento</Label>
              <Select value={form.payment_method || "pix"} onValueChange={v => setForm({...form, payment_method: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[["pix","Pix"],["boleto","Boleto"],["credit_card","Cartão de Crédito"],["transfer","Transferência"],["marketplace","Marketplace"]].map(([m, label]) => <SelectItem key={m} value={m}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!(canalDoPedido()?.commission_percent > 0 || canalDoPedido()?.dias_liberacao > 0) && (
            <>
            <div>
              <Label>Condição</Label>
              <Select value={String(form.installments || 1)} onValueChange={v => setForm({...form, installments: parseInt(v)})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[[1,"À vista / 1 parcela"],[2,"2 parcelas"],[3,"3 parcelas"],[4,"4 parcelas"],[6,"6 parcelas"],[10,"10 parcelas"],[12,"12 parcelas"]].map(([n, label]) => <SelectItem key={n} value={String(n)}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(form.installments || 1) > 1 && (
              <>
                <div>
                  <Label>1º vencimento (dias)</Label>
                  <Input type="number" min="0" value={form.first_due_days ?? 0} onChange={e => setForm({...form, first_due_days: parseInt(e.target.value) || 0})} placeholder="30" />
                </div>
                <div>
                  <Label>Intervalo (dias)</Label>
                  <Input type="number" min="1" value={form.installment_interval_days ?? 30} onChange={e => setForm({...form, installment_interval_days: parseInt(e.target.value) || 30})} placeholder="30" />
                </div>
              </>
            )}
            </>
            )}
            <div>
              <Label>Sinal recebido (R$)</Label>
              <Input type="number" step="0.01" min="0" value={form.sinal_brl ?? ""} onChange={e => setForm({...form, sinal_brl: e.target.value})} placeholder="0,00" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Reserva de máquina: o sinal vira conta RECEBIDA no Financeiro na hora, mesmo com o pedido só Aprovado. Ao faturar, as parcelas nascem apenas do restante (total − sinal).</p>
            </div>
          </div>

          {/* PAGAMENTO MISTO: parte Pix, parte cartão, parte PayPal... Cada linha vira
              conta(s) a receber própria(s) no Financeiro, com o método correto.
              Aparece em TODO canal (reclamação da Larissa 03/09: no canal "Venda Site",
              que tem 12% de comissão, o bloco sumia e não havia onde lançar sinal Pix +
              restante). Com linhas preenchidas, elas mandam — inclusive sobre o
              recebimento líquido do canal intermediado. */}
          {(() => {
            const linhas = form.pagamentos || [];
            const somaLinhas = linhas.reduce((s, l) => s + (parseFloat(l.valor) || 0), 0);
            const alvo = Math.max(0, calcTotal() - (parseFloat(form.sinal_brl) || 0));
            const bate = Math.abs(somaLinhas - alvo) < 0.01;
            return (
              <div className="mt-3 rounded-lg border border-dashed border-border p-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Pagamento misto (opcional)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => { const resto = Math.max(0, Math.round((alvo - somaLinhas) * 100) / 100); setForm(prev => ({ ...prev, pagamentos: [...(prev.pagamentos || []), { metodo: "pix", valor: resto > 0 ? String(resto) : "", parcelas: 1, data: "", pago: false }] })); }}>+ Forma</Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 mb-2">Cliente pagando parte em Pix, parte no cartão, PayPal etc.? Adicione uma linha por forma. Com linhas aqui, os campos "Pagamento" e "Condição" acima são ignorados — cada linha vira conta a receber com o método dela, pelo valor cheio (mesmo em canal com comissão: o dinheiro entrou direto). <b>Data</b>: quando foi (ou será) o pagamento — marque <b>Pago</b> se já entrou. Sem data = usa os prazos padrão; pagamento "na chegada da máquina" fica sem data e você define o vencimento no Financeiro quando ela chegar.</p>
                {linhas.map((l, ix) => (
                  <div key={ix} className="mb-2"><div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <Label className="text-xs">Forma</Label>
                      <Select value={l.metodo || "pix"} onValueChange={v => setForm(prev => ({ ...prev, pagamentos: prev.pagamentos.map((x, i) => i === ix ? { ...x, metodo: v } : x) }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[["pix","Pix"],["credit_card","Cartão de Crédito"],["debit_card","Cartão de Débito"],["boleto","Boleto"],["paypal","PayPal"],["transfer","Transferência"],["cash","Dinheiro"]].map(([m, label]) => <SelectItem key={m} value={m}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs flex items-center justify-between">Valor (R$)
                        {/* Pedido da Larissa 03/09: o sistema calcula sozinho o que falta para fechar o pedido */}
                        {(() => { const outras = linhas.reduce((s, x, i) => s + (i === ix ? 0 : (parseFloat(x.valor) || 0)), 0); const resto = Math.max(0, Math.round((alvo - outras) * 100) / 100); return Math.abs((parseFloat(l.valor) || 0) - resto) >= 0.01 ? <button type="button" className="text-[10px] text-primary underline font-normal" title={`Preencher com o que falta: ${formatCurrency(resto)}`} onClick={() => setForm(prev => ({ ...prev, pagamentos: prev.pagamentos.map((x, i) => i === ix ? { ...x, valor: String(resto) } : x) }))}>= restante</button> : null; })()}
                      </Label>
                      <Input type="number" step="0.01" min="0" value={l.valor ?? ""} onChange={e => setForm(prev => ({ ...prev, pagamentos: prev.pagamentos.map((x, i) => i === ix ? { ...x, valor: e.target.value } : x) }))} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Parcelas</Label>
                      <Select value={String(l.parcelas || 1)} onValueChange={v => setForm(prev => ({ ...prev, pagamentos: prev.pagamentos.map((x, i) => i === ix ? { ...x, parcelas: parseInt(v) } : x) }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{Array.from({ length: 18 }, (_, k) => k + 1).map(n => <SelectItem key={n} value={String(n)}>{n}×</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2"><Label className="text-xs">{["credit_card", "debit_card", "paypal"].includes(l.metodo || "pix") && l.antecipar !== false ? "Data do crédito" : "Data (1ª parc.)"}</Label><Input type="date" value={l.data || ""} onChange={e => setForm(prev => ({ ...prev, pagamentos: prev.pagamentos.map((x, i) => i === ix ? { ...x, data: e.target.value } : x) }))} /></div>
                    <div className="col-span-1 flex flex-col items-center">
                      <Label className="text-xs">Pago</Label>
                      <input type="checkbox" className="h-5 w-5 mt-2 accent-primary" checked={!!l.pago} disabled={!l.data} title={l.data ? "Já recebido nesta data" : "Preencha a data para marcar como pago"} onChange={e => setForm(prev => ({ ...prev, pagamentos: prev.pagamentos.map((x, i) => i === ix ? { ...x, pago: e.target.checked } : x) }))} />
                    </div>
                    <button type="button" className="col-span-1 h-9 text-destructive hover:bg-destructive/10 rounded text-sm" onClick={() => setForm(prev => ({ ...prev, pagamentos: prev.pagamentos.filter((_, i) => i !== ix) }))}>✕</button>
                  </div>
                  {["credit_card", "debit_card", "paypal"].includes(l.metodo || "pix") && (() => {
                    const antec = l.antecipar !== false;
                    const v = parseFloat(l.valor) || 0;
                    const tx = taxaDaLinha(l);
                    const txTabela = taxaTabela(l);
                    const opSel = operadoraDaLinha(l);
                    const setL = (patch) => setForm(prev => ({ ...prev, pagamentos: prev.pagamentos.map((x, i) => i === ix ? { ...x, ...patch } : x) }));
                    return (
                      <div className="grid grid-cols-12 gap-2 items-end mt-1 pl-1">
                        <div className="col-span-4">
                          <Label className="text-xs">Recebimento</Label>
                          <Select value={antec ? "antecipado" : "parcelado"} onValueChange={val => setL({ antecipar: val === "antecipado" })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="antecipado">Antecipado — entra à vista</SelectItem>
                              <SelectItem value="parcelado">Sem antecipação — 1 conta por parcela</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {antec ? (
                          <>
                            <div className="col-span-3">
                              <Label className="text-xs">Operadora</Label>
                              <Select value={opSel?.nome || "__none"} onValueChange={val => setL({ operadora: val === "__none" ? "" : val, taxa_pct: "" })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="PagBank, PayPal…" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none">— escolher —</SelectItem>
                                  {operadoras.map(o => <SelectItem key={o.nome} value={o.nome}>{o.nome}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-2"><Label className="text-xs">Taxa (%)</Label><Input type="number" step="0.01" min="0" className="h-8 text-xs" placeholder={txTabela != null ? `${txTabela} (tabela)` : (opSel ? "sem taxa p/ este nº" : "escolha a operadora")} title={txTabela != null ? `Vazio = usa a tabela da operadora (${txTabela}% em ${l.metodo === "debit_card" ? "débito" : `${l.parcelas || 1}x`})` : "Cadastre em Configuração → Taxas de recebimento"} value={l.taxa_pct ?? ""} onChange={e => setL({ taxa_pct: e.target.value })} /></div>
                            <p className="col-span-3 text-[10px] text-muted-foreground leading-tight">Crédito único de {formatCurrency(v)} na <b>Data</b> (vazia = próximo dia útil){tx > 0 ? <> e despesa de taxa de {formatCurrency(Math.round(v * tx) / 100)}</> : (opSel && txTabela == null ? <span className="text-warning"> — sem taxa cadastrada para {l.metodo === "debit_card" ? "débito" : `${l.parcelas || 1}x`} nesta operadora</span> : "")}.</p>
                          </>
                        ) : (
                          <p className="col-span-8 text-[10px] text-muted-foreground leading-tight">Uma conta a receber por parcela, vencendo a partir da Data (ou dos prazos padrão do pedido).</p>
                        )}
                      </div>
                    );
                  })()}
                  </div>
                ))}
                {linhas.length > 0 && (
                  <p className={`text-[11px] font-medium ${bate ? "text-success" : "text-warning"}`}>
                    Soma das formas: {formatCurrency(somaLinhas)} · Restante do pedido (total − sinal): {formatCurrency(alvo)} {bate ? "✓" : "— ajuste até bater"}
                  </p>
                )}
              </div>
            );
          })()}
          {(() => {
            const ch = canalDoPedido();
            if (!ch) return null;
            const intermediado = (ch.commission_percent || 0) > 0 || (ch.dias_liberacao || 0) > 0;
            if (!intermediado) return null;
            const temLinhas = (form.pagamentos || []).some(l => (parseFloat(l.valor) || 0) > 0);
            if (temLinhas) return <p className="text-[11px] text-muted-foreground mt-1">Canal com comissão de {ch.commission_percent || 0}%, mas o pagamento foi lançado por forma acima: as contas a receber nascem das linhas, pelo valor cheio. A comissão continua contando na margem.</p>;
            const liquido = calcTotal() * (1 - (ch.commission_percent || 0) / 100) - (ch.fixed_fee || 0);
            return <p className="text-[11px] text-warning mt-1">Canal intermediado: sem linhas no "Pagamento misto", o recebimento é único e líquido — {formatCurrency(Math.max(0, liquido))} previsto para {ch.dias_liberacao || 0} dia(s) após o faturamento (comissão de {ch.commission_percent || 0}% já descontada). Se o cliente pagou direto (Pix, cartão, sinal + restante), lance as formas acima.</p>;
          })()}

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label>Itens</Label>
              <Button size="sm" variant="ghost" onClick={() => setOrderItems([...orderItems, { product_id: "", name: "", quantity: 1, unit_price: 0 }])}><Plus className="w-3 h-3 mr-1" /> Item</Button>
            </div>
            {orderItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-9 gap-2 mb-2 items-end">
                <div className="col-span-4">
                  <Combobox
                    value={item.product_id || "manual"}
                    onChange={v => updateOrderItem(idx, "product_id", v === "manual" ? "" : v)}
                    placeholder="Produto"
                    searchPlaceholder="Nome, SKU ou categoria…"
                    emptyText="Nenhum produto com esse nome ou SKU"
                    triggerClassName="h-9 text-xs"
                    options={[{ value: "manual", label: "Manual" }, ...products.map(p => ({
                      value: p.id, label: p.name,
                      sub: [p.sku, p.category_name].filter(Boolean).join(" · "),
                      keywords: [p.sku, p.category_name],
                    }))]}
                  />
                </div>
                <Input type="number" className="col-span-2 h-9 text-xs" placeholder="Qtd" value={item.quantity || ""} onChange={e => updateOrderItem(idx, "quantity", parseFloat(e.target.value) || 0)} />
                <Input type="number" step="0.01" className="col-span-2 h-9 text-xs" placeholder="Preço" value={item.unit_price || ""} onChange={e => updateOrderItem(idx, "unit_price", parseFloat(e.target.value) || 0)} />
                <button type="button" className="col-span-1 h-9 text-destructive hover:bg-destructive/10 rounded text-sm" title="Excluir este item" onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))}>✕</button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-3">
            <div><Label className="text-xs">Desconto</Label><Input type="number" step="0.01" value={form.discount || ""} onChange={e => setForm({...form, discount: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">Frete</Label><Input type="number" step="0.01" value={form.shipping_cost || ""} onChange={e => setForm({...form, shipping_cost: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">Total</Label><Input readOnly className="bg-muted font-bold" value={formatCurrency(calcTotal())} /></div>
          </div>

          {/* TRANSPORTADORA E ENTREGA (pedido da Larissa, 20/08/2026) */}
          <div className="mt-3 rounded-lg border border-border p-3">
            <Label className="font-semibold">Transportadora e entrega</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              <div className="col-span-2">
                <Label className="text-xs">Transportadora</Label>
                <div className="flex gap-1">
                  <Select value={form.transportadora || "__none"} onValueChange={v => setForm({ ...form, transportadora: v === "__none" ? "" : v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Escolha no cadastro" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— Sem transportadora —</SelectItem>
                      {transportadoras.filter(t => t.ativo !== false).map(t => <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>)}
                      {form.transportadora && !transportadoras.some(t => t.nome === form.transportadora) && <SelectItem value={form.transportadora}>{form.transportadora}</SelectItem>}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" className="h-10 px-3" title="Cadastrar ou editar transportadoras" onClick={() => setTrDialog({ ...TR_VAZIA })}>Cadastro</Button>
                </div>
                {(() => { const t = trDoPedido(form.transportadora); return form.transportadora ? <p className="text-[10px] text-muted-foreground mt-0.5">{t ? ([t.cnpj && `CNPJ ${t.cnpj}`, t.telefone, t.contato && `contato: ${t.contato}`].filter(Boolean).join(" · ") || "cadastrada sem CNPJ/telefone — complete no Cadastro") : "não está no cadastro — clique em Cadastro para incluir"}</p> : null; })()}
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Frete por conta</Label>
                <Select value={String(form.frete_por_conta ?? 9)} onValueChange={v => setForm({ ...form, frete_por_conta: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[[0, "0 — Remetente (CIF)"], [1, "1 — Destinatário (FOB)"], [2, "2 — Terceiros"], [3, "3 — Próprio (remetente)"], [4, "4 — Próprio (destinatário)"], [9, "9 — Sem transporte"]].map(([v, l]) => <SelectItem key={v} value={String(v)}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Volumes (qtd)</Label><Input type="number" min="0" value={form.volumes_qtd ?? ""} onChange={e => { setLogAuto(false); setForm({ ...form, volumes_qtd: parseInt(e.target.value) || 0 }); }} /></div>
              <div><Label className="text-xs">Peso bruto (kg)</Label><Input type="number" step="0.001" min="0" value={form.peso_bruto ?? ""} onChange={e => { setLogAuto(false); setForm({ ...form, peso_bruto: parseFloat(e.target.value) || 0 }); }} /></div>
              <p className="col-span-2 sm:col-span-4 text-[10px] text-muted-foreground -mt-1">
                {logAuto ? "Volumes e peso calculados pelo cadastro dos produtos × quantidade (1 volume por unidade + caixas extras cadastradas). Digitar um valor desliga o cálculo." : "Valores digitados à mão. "}
                {!logAuto && <button type="button" className="text-primary underline" onClick={() => { setLogAuto(true); setForm(prev => ({ ...prev, ...calcLogistica(orderItems) })); }}>Recalcular pelo cadastro</button>}
              </p>
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm">
              <input type="checkbox" checked={!!form.entrega_diferente} onChange={e => setForm({ ...form, entrega_diferente: e.target.checked })} />
              <b>Endereço de entrega diferente da cobrança</b>
            </label>
            {form.entrega_diferente && (
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-2">
                <div className="col-span-2"><Label className="text-xs">Nome / A/C</Label><Input value={form.endereco_entrega?.nome || ""} onChange={e => setEntrega("nome", e.target.value)} /></div>
                <div><Label className="text-xs">CEP</Label><Input value={form.endereco_entrega?.cep || ""} onChange={e => { setEntrega("cep", e.target.value); buscarCepEntrega(e.target.value); }} placeholder="00000-000" /></div>
                <div className="col-span-2"><Label className="text-xs">Endereço</Label><Input value={form.endereco_entrega?.endereco || ""} onChange={e => setEntrega("endereco", e.target.value)} /></div>
                <div><Label className="text-xs">Número</Label><Input value={form.endereco_entrega?.numero || ""} onChange={e => setEntrega("numero", e.target.value)} /></div>
                <div><Label className="text-xs">Complemento</Label><Input value={form.endereco_entrega?.complemento || ""} onChange={e => setEntrega("complemento", e.target.value)} /></div>
                <div><Label className="text-xs">Bairro</Label><Input value={form.endereco_entrega?.bairro || ""} onChange={e => setEntrega("bairro", e.target.value)} /></div>
                <div className="col-span-2"><Label className="text-xs">Cidade</Label><Input value={form.endereco_entrega?.cidade || ""} onChange={e => setEntrega("cidade", e.target.value)} /></div>
                <div><Label className="text-xs">UF</Label><Input value={form.endereco_entrega?.uf || ""} onChange={e => setEntrega("uf", e.target.value)} maxLength={2} /></div>
                <p className="col-span-2 sm:col-span-6 text-[10px] text-muted-foreground -mt-1">O endereço preenche sozinho pelo CEP. Esse endereço vai no PDF do pedido e no grupo de ENTREGA da NF-e.</p>
              </div>
            )}
          </div>

          {/* LANÇAMENTOS DO PEDIDO — estoque e contas, visíveis sem sair da tela */}
          {editing && (
            <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
              <Label className="font-semibold">Lançamentos deste pedido</Label>
              <p className="text-[11px] mt-1">
                <b>Estoque:</b> {["invoiced", "shipped", "delivered"].includes(form.status) ? "✅ baixado (movimentos no Kardex)" : ["pending", "approved"].includes(form.status) ? "🔒 reservado — baixa ao faturar" : "—"}
              </p>
              {devolucoes.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {devolucoes.map(d => (
                    <p key={d.id} className="text-[11px] flex justify-between gap-2 text-destructive">
                      <span>↩ Devolução {d.devolucao_total ? "total" : "parcial"} em {(d.data || "").split("-").reverse().join("/")}{d.motivo ? ` — ${d.motivo}` : ""}</span>
                      <span className="whitespace-nowrap font-medium">−{formatCurrency(d.valor)}{(parseFloat(d.comissao_estornada) || 0) > 0 ? ` · comissão −${formatCurrency(d.comissao_estornada)}` : ""}</span>
                    </p>
                  ))}
                </div>
              )}
              {lancamentos.length === 0 ? (
                <p className="text-[11px] text-muted-foreground mt-1"><b>Contas:</b> nenhuma gerada ainda — nascem ao faturar (ou pelo sinal).</p>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {lancamentos.map(l => (
                    <p key={l.id} className="text-[11px] flex justify-between gap-2">
                      <span className={l.status === "cancelled" ? "line-through text-muted-foreground" : ""}>{l.description}</span>
                      <span className={`whitespace-nowrap font-medium ${l.status === "paid" ? "text-success" : l.status === "cancelled" ? "text-muted-foreground" : "text-warning"}`}>
                        {formatCurrency(l.amount)} · {l.status === "paid" ? "recebida" : l.status === "cancelled" ? "cancelada" : `vence ${l.due_date?.split("-").reverse().join("/") || ""}`}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MARGEM EM TEMPO REAL — o vendedor nunca fecha no escuro */}
          {verCustos && (() => {
            const receita = calcTotal();
            if (receita <= 0) return null;
            const ch = canalDoPedido();
            const primeiroProduto = products.find(p => p.id === orderItems.find(i => i.product_id)?.product_id) || null;
            const imp = calcImpostosPct(configTrib, primeiroProduto, ch);
            const impostosRs = receita * imp.total / 100;
            const comissaoCanalRs = receita * ((ch?.commission_percent || 0) / 100) + (ch?.fixed_fee || 0);
            // Comissão segue QUEM VENDEU (regra firmada 18/08/2026):
            // vendedor → % padrão da Config. Tributária em todos os itens;
            // representante → % cadastrada no produto (item sem % = sem comissão).
            const vendidoPorRep = form.vendido_por === "representante";
            const comissaoVendRs = orderItems.reduce((s, it) => {
              const rec = (parseFloat(it.unit_price) || 0) * (parseFloat(it.quantity) || 0);
              if (rec <= 0) return s;
              const prod = products.find(pr => pr.id === it.product_id) || null;
              const pct = vendidoPorRep
                ? (parseFloat(prod?.seller_commission_percent) || 0)
                : (configTrib?.comissao_vendedor_padrao || 0);
              return s + rec * (1 - imp.total / 100) * (pct / 100);
            }, 0);
            let custoProdutos = 0; let itensSemCusto = [];
            orderItems.forEach(i => {
              if (!i.product_id) { if (i.name || i.unit_price) itensSemCusto.push(i.name || "item manual"); return; }
              const p = products.find(pr => pr.id === i.product_id);
              const c = p ? getCustoVigente(p) : 0;
              if (!c) itensSemCusto.push(p?.model || p?.name || "produto");
              custoProdutos += c * (i.quantity || 0);
            });
            const freteRs = parseFloat(form.shipping_cost) || 0;
            const margem = receita - impostosRs - comissaoCanalRs - comissaoVendRs - custoProdutos - freteRs;
            const margemPct = receita > 0 ? (margem / receita) * 100 : 0;
            const cor = margem < 0 ? "text-destructive" : margemPct < 12 ? "text-warning" : "text-success";
            return (
              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                  <div><p className="text-muted-foreground">Receita</p><p className="font-semibold">{formatCurrency(receita)}</p></div>
                  <div><p className="text-muted-foreground">{imp.regime === "simples" ? `DAS (${imp.total.toFixed(2)}%)` : `Impostos (${imp.total.toFixed(1)}%)`}</p><p className="font-semibold text-destructive">−{formatCurrency(impostosRs)}</p></div>
                  <div><p className="text-muted-foreground">Comissão canal</p><p className="font-semibold text-destructive">−{formatCurrency(comissaoCanalRs)}</p></div>
                  <div><p className="text-muted-foreground">Comissão {vendidoPorRep ? "representante" : "vendedor"}</p><p className="font-semibold text-destructive">−{formatCurrency(comissaoVendRs)}</p></div>
                  <div><p className="text-muted-foreground">Custo + frete</p><p className="font-semibold text-destructive">−{formatCurrency(custoProdutos + freteRs)}</p></div>
                  <div><p className="text-muted-foreground">MARGEM LÍQUIDA</p><p className={`font-bold text-sm ${cor}`}>{formatCurrency(margem)} <span className="text-xs">({margemPct.toFixed(1)}%)</span></p></div>
                </div>
                {itensSemCusto.length > 0 && (
                  <p className="text-[10px] text-warning mt-2">⚠️ Sem custo cadastrado: {itensSemCusto.join(", ")} — a margem real é MENOR que a exibida. Cadastre o custo (landed ou manual) no produto.</p>
                )}
              </div>
            );
          })()}

          <div className="mt-3">
            <Label>Observações</Label>
            <textarea className="w-full min-h-[50px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none" value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={savingOrder}>{savingOrder ? "Salvando..." : "Salvar"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DEVOLUÇÃO DE VENDA — evento próprio, com data própria (mês fechado não reabre) */}
      {/* CADASTRO DE TRANSPORTADORAS (16/09/2026) */}
      <Dialog open={!!trDialog} onOpenChange={o => { if (!o) setTrDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Transportadoras (contatos do tipo Transportador)</DialogTitle></DialogHeader>
          {trDialog && <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><Label className="text-xs">Nome *</Label><Input value={trDialog.nome || ""} onChange={e => setTrDialog({ ...trDialog, nome: e.target.value })} placeholder="Ex.: Braspress" /></div>
              <div><Label className="text-xs">CNPJ</Label><Input value={trDialog.cnpj || ""} onChange={e => setTrDialog({ ...trDialog, cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></div>
              <div><Label className="text-xs">Telefone</Label><Input value={trDialog.telefone || ""} onChange={e => setTrDialog({ ...trDialog, telefone: e.target.value })} placeholder="(15) 0000-0000" /></div>
              <div><Label className="text-xs">Contato</Label><Input value={trDialog.contato || ""} onChange={e => setTrDialog({ ...trDialog, contato: e.target.value })} placeholder="Nome de quem atende" /></div>
              <div><Label className="text-xs">Cidade</Label><Input value={trDialog.cidade || ""} onChange={e => setTrDialog({ ...trDialog, cidade: e.target.value })} placeholder="Ribeirão Preto" /></div>
            </div>
            <div className="flex justify-end gap-2">
              {trDialog.id && <Button type="button" variant="outline" onClick={() => setTrDialog({ ...TR_VAZIA })}>Nova</Button>}
              <Button type="button" onClick={salvarTransportadora} disabled={!(trDialog.nome || "").trim()}>{trDialog.id ? "Salvar alterações" : "Cadastrar e usar neste pedido"}</Button>
            </div>
            <div className="border-t border-border pt-2 max-h-56 overflow-y-auto text-sm">
              <p className="text-[10px] text-muted-foreground">É o mesmo cadastro de Contatos: tudo que estiver com o tipo "Transportador" aparece aqui e no pedido.</p>
              {transportadoras.length === 0 && <p className="text-muted-foreground text-xs">Nenhum contato do tipo Transportador ainda.</p>}
              {transportadoras.map(t => <div key={t.id} className={`flex items-center justify-between gap-2 py-1 ${t.ativo === false ? "opacity-50" : ""}`}>
                <div className="min-w-0"><b>{t.nome}</b>{t.ativo === false && " (inativa)"}<div className="text-xs text-muted-foreground truncate">{[t.cnpj, t.telefone, t.contato].filter(Boolean).join(" · ") || "sem dados"}</div></div>
                <div className="flex gap-1 shrink-0">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setTrDialog({ ...t })}>Editar</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { if (confirm(`Inativar o contato ${t.nome}?`)) alternarTransportadora(t); }}>Inativar</Button>
                </div>
              </div>)}
            </div>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!devDialog} onOpenChange={(v) => { if (!v && !devSaving) setDevDialog(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {devDialog && (() => {
            const o = devDialog.order; const c = calcDevolucao(devDialog);
            const setDev = (patch) => setDevDialog(prev => ({ ...prev, ...patch }));
            return (
              <>
                <DialogHeader><DialogTitle>Devolução — Pedido {o.order_number} · {o.customer_name || "Cliente"}</DialogTitle></DialogHeader>
                <p className="text-[11px] text-muted-foreground">Venda de {((o.order_date || (o.created_date || "").slice(0, 10)) || "").split("-").reverse().join("/")}. A devolução entra no mês em que acontece: reembolso a pagar, estoque de volta, comissão estornada. A venda original e a DRE do mês dela ficam como estão.</p>
                {devDialog.anteriores.length > 0 && <p className="text-[11px] text-warning">Este pedido já tem {devDialog.anteriores.length} devolução(ões) registrada(s); as quantidades abaixo já descontam o que voltou.</p>}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                  <div><Label>Data da devolução</Label><Input type="date" value={devDialog.data} onChange={e => setDev({ data: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label>Motivo</Label><Input value={devDialog.motivo} onChange={e => setDev({ motivo: e.target.value })} placeholder="Ex.: arrependimento, defeito, troca por outro modelo" /></div>
                </div>
                <div className="mt-2 rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/30"><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Vendido</th><th className="text-right px-3 py-2">Já devolvido</th><th className="text-right px-3 py-2">Devolver agora</th><th className="text-right px-3 py-2">Valor</th></tr></thead>
                    <tbody>
                      {devDialog.itens.map((it, ix) => (
                        <tr key={ix} className="border-t border-border">
                          <td className="px-3 py-2">{it.name || "Item"}{!it.product_id && <span className="block text-[10px] text-muted-foreground">item manual — não volta ao estoque</span>}</td>
                          <td className="px-3 py-2 text-right">{it.quantity}</td>
                          <td className="px-3 py-2 text-right">{it.ja_devolvido || 0}</td>
                          <td className="px-3 py-2 text-right"><Input type="number" min="0" step="1" max={Math.max(0, (parseFloat(it.quantity) || 0) - (it.ja_devolvido || 0))} className="h-8 w-20 ml-auto text-right" value={it.qty_dev ?? ""} onChange={e => setDev({ itens: devDialog.itens.map((x, i) => i === ix ? { ...x, qty_dev: e.target.value } : x) })} /></td>
                          <td className="px-3 py-2 text-right">{formatCurrency((parseFloat(it.qty_dev) || 0) * (parseFloat(it.unit_price) || 0) * c.fatorDesc)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {c.fatorDesc < 1 && <p className="text-[10px] text-muted-foreground mt-1">O desconto do pedido ({formatCurrency(o.discount)}) é rateado proporcionalmente nos valores devolvidos.</p>}
                <div className="mt-3 space-y-1.5 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!devDialog.reembolsar} onChange={e => setDev({ reembolsar: e.target.checked })} /> Lançar reembolso ao cliente como conta a pagar ({formatCurrency(c.valor)}, vencendo na data da devolução)</label>
                  <label className={`flex items-center gap-2 ${o.nfe_chave ? "cursor-pointer" : "opacity-60"}`}><input type="checkbox" checked={!!devDialog.gerarNfe} disabled={!o.nfe_chave} onChange={e => setDev({ gerarNfe: e.target.checked })} /> Preparar NF-e de devolução (entrada, finalidade 4, referenciando a nota {o.nfe_numero || "original"}){!o.nfe_chave && <span className="text-[10px]">— pedido sem NF-e autorizada no ERP</span>}</label>
                </div>
                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div className={`grid grid-cols-2 ${verCustos ? "sm:grid-cols-4" : "sm:grid-cols-2"} gap-2 text-xs`}>
                    <div><p className="text-muted-foreground">Valor devolvido</p><p className="font-bold text-sm text-destructive">{formatCurrency(c.valor)}</p></div>
                    <div><p className="text-muted-foreground">Comissão a estornar</p><p className="font-semibold">{formatCurrency(c.comissao)}</p><p className="text-[10px] text-muted-foreground">desconta do próximo pagamento do vendedor</p></div>
                    {verCustos && <div><p className="text-muted-foreground">Custo que volta ao estoque</p><p className="font-semibold">{formatCurrency(c.cmv)}</p></div>}
                    {verCustos && <div><p className="text-muted-foreground">Tipo</p><p className="font-semibold">{c.total ? "Devolução total" : c.qtdTotal > 0 ? "Devolução parcial" : "—"}</p></div>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">Na DRE do mês da devolução: (−) Devoluções de vendas, (+) custo devolvido ao estoque e (+) estorno de comissão. {c.total ? "O pedido passa a Devolvido." : "O pedido continua faturado, com o valor devolvido anotado."}</p>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => setDevDialog(null)} disabled={devSaving}>Cancelar</Button>
                  <Button onClick={confirmarDevolucao} disabled={devSaving || c.qtdTotal <= 0}>{devSaving ? "Registrando..." : "Registrar devolução"}</Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}