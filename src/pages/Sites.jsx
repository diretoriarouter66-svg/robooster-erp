import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Globe, Search, Users, Bot, Megaphone, AlertTriangle, TrendingUp, TrendingDown, Gauge, MessageSquare, Map } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, BarChart, Bar,
} from "recharts";

/*
 * Central de Análise — Google (Search Console), Bing (Webmaster), Analytics (GA4), visitas de IA por
 * assistente, velocidade (PageSpeed), indexação, atendimento (Chatwoot), Mapa da Placa e IndexNow, dos
 * 4 sites, num lugar só, com pontos de atenção e altas/baixas calculados aqui na tela.
 * Dados: tabela site_metricas, alimentada às 07:30 (coleta-sites.py) e 07:35 (coleta-sites-extra.py).
 */

const SITES = [
  { id: "robooster", nome: "Robooster", cor: "#c85f10", cadencia: 2 },
  { id: "saber", nome: "Saber da Eletrônica", cor: "#b58a00", cadencia: 7 },
  { id: "tbl", nome: "TechBenchLab", cor: "#2f6f3e", cadencia: 7 },
  { id: "basepanama", nome: "Base Panamá", cor: "#1d4a8a", cadencia: 0 },
];
const CANAIS = [
  { k: "google", nome: "Google", cor: "#4285f4" }, { k: "bing", nome: "Bing", cor: "#0a8f5c" }, { k: "yahoo", nome: "Yahoo", cor: "#6e2dc7" },
  { k: "ia", nome: "IA (ChatGPT, Gemini…)", cor: "#111827" }, { k: "anuncio", nome: "Anúncios", cor: "#f59e0b" }, { k: "direto", nome: "Direto", cor: "#6b7280" },
  { k: "social", nome: "Social", cor: "#ec4899" }, { k: "youtube", nome: "YouTube", cor: "#ef4444" }, { k: "referencia", nome: "Referência", cor: "#14b8a6" },
  { k: "outros_buscadores", nome: "Outros buscadores", cor: "#a3a3a3" }, { k: "outros", nome: "Outros", cor: "#d4d4d4" },
];
const ASSISTENTES = [
  { k: "chatgpt", nome: "ChatGPT", cor: "#10a37f" }, { k: "gemini", nome: "Gemini", cor: "#4285f4" }, { k: "copilot", nome: "Copilot", cor: "#0a8f5c" },
  { k: "perplexity", nome: "Perplexity", cor: "#1d4a8a" }, { k: "claude", nome: "Claude", cor: "#c85f10" }, { k: "outros_ia", nome: "Outras IAs", cor: "#9ca3af" },
];
const fmt = (n) => (n == null || Number.isNaN(n) ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n));
const isoDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);

function Delta({ atual, anterior }) {
  const p = pct(atual, anterior);
  if (p == null) return null;
  return <span className={`text-xs font-medium ${p >= 0 ? "text-emerald-600" : "text-red-600"}`}>{p >= 0 ? "+" : ""}{p.toFixed(0)}%</span>;
}
function Num({ label, valor, anterior, icon: Icon, sufixo = "" }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{Icon && <Icon className="w-3.5 h-3.5" />}{label}</div>
      <div className="flex items-baseline gap-2 mt-1"><span className="text-xl font-semibold tabular-nums">{fmt(valor)}{sufixo}</span><Delta atual={valor} anterior={anterior} /></div>
    </div>
  );
}
function Sev({ nivel }) {
  const cls = nivel === "critico" ? "bg-red-100 text-red-700" : nivel === "atencao" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700";
  const txt = nivel === "critico" ? "crítico" : nivel === "atencao" ? "atenção" : "ok";
  return <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${cls}`}>{txt}</span>;
}

export default function Sites() {
  const [periodo, setPeriodo] = useState(28);
  const [siteSel, setSiteSel] = useState("saber");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setErro(null);
      const { data, error } = await supabase.from("site_metricas").select("dia,site,fonte,metrica,valor,extra")
        .gte("dia", isoDaysAgo(periodo * 2 + 3)).order("dia", { ascending: true }).limit(40000);
      if (error) setErro(error.message); else setRows(data || []);
      setLoading(false);
    })();
  }, [periodo]);

  const ini = isoDaysAgo(periodo), iniAnt = isoDaysAgo(periodo * 2), fimAnt = isoDaysAgo(periodo + 1);
  // Search Console atrasa ~3 dias e o Bing ~6: cada fonte é ancorada no último dia em que tem dado,
  // senão os dias vazios do fim viram "queda" falsa na comparação com o período anterior.
  const fimFonte = useMemo(() => {
    const m = {};
    rows.forEach((r) => { if ((r.fonte === "gsc" || r.fonte === "bing") && Number(r.valor) > 0) { const k = r.site + "|" + r.fonte; if (!m[k] || r.dia > m[k]) m[k] = r.dia; } });
    return m;
  }, [rows]);
  const shift = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const somaBruta = (site, fonte, metrica, de, ate) => rows.filter((r) => r.site === site && r.fonte === fonte && r.metrica === metrica && r.dia >= de && (!ate || r.dia <= ate)).reduce((a, r) => a + Number(r.valor), 0);
  const soma = (site, fonte, metrica, de, ate) => {
    const fim = fimFonte[site + "|" + fonte];
    if (!fim || fim >= isoDaysAgo(0)) return somaBruta(site, fonte, metrica, de, ate);
    // janela pedida (de..ate) é relativa a hoje; desloca pelo atraso da fonte
    const atraso = Math.round((new Date(isoDaysAgo(0) + "T12:00:00") - new Date(fim + "T12:00:00")) / 86400000);
    return somaBruta(site, fonte, metrica, shift(de, atraso), ate ? shift(ate, atraso) : fim);
  };
  const ultimo = (site, fonte, metrica) => { const l = rows.filter((r) => r.site === site && r.fonte === fonte && r.metrica === metrica); return l.length ? l[l.length - 1] : null; };
  const ultimoVal = (site, fonte, metrica) => { const r = ultimo(site, fonte, metrica); return r ? Number(r.valor) : null; };
  const media = (site, fonte, metrica, de, ate) => { const l = rows.filter((r) => r.site === site && r.fonte === fonte && r.metrica === metrica && r.dia >= de && (!ate || r.dia <= ate)); return l.length ? l.reduce((a, r) => a + Number(r.valor), 0) / l.length : null; };

  // ---------- Resumo por site ----------
  const resumo = useMemo(() => SITES.map((s) => {
    const g = (f, m) => ({ atual: soma(s.id, f, m, ini), ant: soma(s.id, f, m, iniAnt, fimAnt) });
    return { ...s, gscImp: g("gsc", "impressoes"), gscCli: g("gsc", "cliques"), bingImp: g("bing", "impressoes"), bingCli: g("bing", "cliques"),
      usuarios: g("ga4", "usuarios"), ia: g("ga4_canal", "ia"), posts: g("wp", "posts"), nota: ultimoVal(s.id, "vitals", "nota") };
  }), [rows, periodo]);

  // ---------- Pontos de atenção (regras) ----------
  const alertas = useMemo(() => {
    const out = [];
    for (const s of SITES) {
      const gc = soma(s.id, "gsc", "cliques", ini), gcA = soma(s.id, "gsc", "cliques", iniAnt, fimAnt);
      const bc = soma(s.id, "bing", "cliques", ini), bcA = soma(s.id, "bing", "cliques", iniAnt, fimAnt);
      const us = soma(s.id, "ga4", "usuarios", ini), usA = soma(s.id, "ga4", "usuarios", iniAnt, fimAnt);
      const p = (a, b) => pct(a, b);
      if (gcA >= 20 && p(gc, gcA) <= -25) out.push({ site: s, nivel: "atencao", txt: `Cliques do Google caíram ${p(gc, gcA).toFixed(0)}% (${fmt(gc)} × ${fmt(gcA)}).` });
      if (bcA >= 20 && p(bc, bcA) <= -25) out.push({ site: s, nivel: "atencao", txt: `Cliques do Bing caíram ${p(bc, bcA).toFixed(0)}%.` });
      if (usA >= 50 && p(us, usA) <= -25) out.push({ site: s, nivel: "atencao", txt: `Usuários caíram ${p(us, usA).toFixed(0)}% no GA4.` });
      const pi = ultimoVal(s.id, "indexacao", "posts_indexados"), pt = ultimoVal(s.id, "indexacao", "posts_total");
      if (pt && pi / pt < 0.8) out.push({ site: s, nivel: pi / pt < 0.4 ? "critico" : "atencao", txt: `Só ${pi} de ${pt} posts estão no índice do Google (${((pi / pt) * 100).toFixed(0)}%), inspeção de ${dm(ultimo(s.id, "indexacao", "posts_total").dia)}.` });
      const nota = ultimoVal(s.id, "vitals", "nota"), lcp = ultimoVal(s.id, "vitals", "lcp_s"), cls = ultimoVal(s.id, "vitals", "cls");
      if (nota != null && nota < 60) out.push({ site: s, nivel: "atencao", txt: `Velocidade no celular: nota ${nota}. LCP ${fmt(lcp)} s, CLS ${fmt(cls)}.` });
      else if (lcp != null && lcp > 4) out.push({ site: s, nivel: "atencao", txt: `Imagem principal demora ${fmt(lcp)} s para aparecer no celular (meta: 2,5 s).` });
      else if (cls != null && cls > 0.25) out.push({ site: s, nivel: "atencao", txt: `Página "pula" ao carregar (CLS ${fmt(cls)}, meta: 0,1).` });
      const postsPer = soma(s.id, "wp", "posts", isoDaysAgo(7));
      if (s.cadencia > 0 && postsPer < Math.ceil(s.cadencia * 0.5)) out.push({ site: s, nivel: "atencao", txt: `Só ${postsPer} post(s) nos últimos 7 dias; a cadência combinada é ${s.cadencia} por semana.` });
    }
    // Atendimento
    const sr = ultimoVal("robooster", "atendimento", "sem_resposta_24h");
    if (sr) out.push({ site: SITES[0], nivel: sr >= 5 ? "critico" : "atencao", txt: `${sr} conversa(s) de WhatsApp sem resposta há mais de 24 h.` });
    const pr = media("robooster", "atendimento", "primeira_resposta_min", isoDaysAgo(7));
    if (pr != null && pr > 60) out.push({ site: SITES[0], nivel: "atencao", txt: `Tempo mediano da 1ª resposta na semana: ${fmt(pr)} min (meta: até 30 min no horário comercial).` });
    // Mapa da Placa
    const ass = ultimoVal("saber", "mapa", "assinantes_ativos");
    if (ass === 0) out.push({ site: SITES[1], nivel: "critico", txt: "Mapa da Placa segue com zero assinantes pagantes." });
    const fichas2d = soma("saber", "fabrica", "fichas_dia", isoDaysAgo(2));
    const acervo = ultimoVal("saber", "mapa", "acervo") ?? ultimoVal("saber", "fabrica", "acervo");
    if (acervo != null && acervo < 1000 && fichas2d === 0) out.push({ site: SITES[1], nivel: "atencao", txt: "Fábrica de fichas sem produção nos últimos 2 dias." });
    // TBL sem Google
    const tblG = soma("tbl", "gsc", "cliques", ini);
    if (tblG === 0 && periodo >= 7) out.push({ site: SITES[2], nivel: "critico", txt: "Zero cliques do Google no período: o site continua fora do índice. Bing é o único buscador entregando." });
    return out.sort((a, b) => (a.nivel === "critico" ? -1 : 1) - (b.nivel === "critico" ? -1 : 1));
  }, [rows, periodo]);

  // ---------- Em alta / em baixa (canais e assistentes, por site selecionado) ----------
  const movers = useMemo(() => {
    const list = [];
    for (const c of CANAIS) {
      const a = soma(siteSel, "ga4_canal", c.k, ini), b = soma(siteSel, "ga4_canal", c.k, iniAnt, fimAnt);
      if (a + b >= 10) list.push({ nome: c.nome, atual: a, ant: b, p: pct(a, b) });
    }
    for (const c of ASSISTENTES) {
      const a = soma(siteSel, "ia", c.k, ini), b = soma(siteSel, "ia", c.k, iniAnt, fimAnt);
      if (a + b >= 3) list.push({ nome: c.nome, atual: a, ant: b, p: pct(a, b) });
    }
    const gc = soma(siteSel, "gsc", "cliques", ini), gcA = soma(siteSel, "gsc", "cliques", iniAnt, fimAnt);
    if (gc + gcA) list.push({ nome: "Cliques Google (Search Console)", atual: gc, ant: gcA, p: pct(gc, gcA) });
    const bc = soma(siteSel, "bing", "cliques", ini), bcA = soma(siteSel, "bing", "cliques", iniAnt, fimAnt);
    if (bc + bcA) list.push({ nome: "Cliques Bing (Webmaster)", atual: bc, ant: bcA, p: pct(bc, bcA) });
    const alta = list.filter((x) => x.p != null && x.p > 10).sort((a, b) => b.p - a.p).slice(0, 6);
    const baixa = list.filter((x) => x.p != null && x.p < -10).sort((a, b) => a.p - b.p).slice(0, 6);
    const novos = list.filter((x) => x.p == null && x.atual > 0).slice(0, 4);
    return { alta, baixa, novos };
  }, [rows, siteSel, periodo]);

  // ---------- Série diária ----------
  const serie = useMemo(() => {
    const dias = {};
    rows.filter((r) => r.site === siteSel && r.dia >= ini).forEach((r) => {
      const d = (dias[r.dia] ||= { dia: dm(r.dia), iso: r.dia });
      if (r.fonte === "gsc" && r.metrica === "cliques") d.google = Number(r.valor);
      if (r.fonte === "gsc" && r.metrica === "impressoes") d.googleImp = Number(r.valor);
      if (r.fonte === "bing" && r.metrica === "cliques") d.bing = Number(r.valor);
      if (r.fonte === "bing" && r.metrica === "impressoes") d.bingImp = Number(r.valor);
      if (r.fonte === "ga4" && r.metrica === "usuarios") d.usuarios = Number(r.valor);
      if (r.fonte === "ia") d.ia = (d.ia || 0) + Number(r.valor);
    });
    return Object.values(dias).sort((a, b) => a.iso.localeCompare(b.iso));
  }, [rows, siteSel, periodo]);

  const canaisTot = useMemo(() => CANAIS.map((c) => ({ ...c, n: soma(siteSel, "ga4_canal", c.k, ini) })).filter((c) => c.n > 0).sort((a, b) => b.n - a.n), [rows, siteSel, periodo]);
  const iaTot = useMemo(() => ASSISTENTES.map((c) => ({ ...c, n: soma(siteSel, "ia", c.k, ini), todos: SITES.reduce((a, s) => a + soma(s.id, "ia", c.k, ini), 0) })).filter((c) => c.todos > 0).sort((a, b) => b.todos - a.todos), [rows, siteSel, periodo]);
  const ultimoExtra = (fonte, metrica) => [...rows].reverse().find((r) => r.site === siteSel && r.fonte === fonte && r.metrica === metrica && r.extra)?.extra || [];
  const topBing = ultimoExtra("bing", "top_consultas");
  const topPag = ultimoExtra("ga4", "top_paginas_7d");
  const topPagAnt = (() => { const alvo = isoDaysAgo(7); const r = [...rows].reverse().find((x) => x.site === siteSel && x.fonte === "ga4" && x.metrica === "top_paginas_7d" && x.extra && x.dia <= alvo); return r?.extra || []; })();
  const pagMov = useMemo(() => {
    if (!topPag.length || !topPagAnt.length) return [];
    const ant = Object.fromEntries(topPagAnt.map((p) => [p.p, p.v]));
    return topPag.map((p) => ({ ...p, ant: ant[p.p] ?? 0, delta: pct(p.v, ant[p.p] ?? 0) })).filter((p) => p.ant || p.v);
  }, [topPag, topPagAnt]);

  // Google Ads (via conta vinculada ao GA4): por campanha no período × anterior
  const ads = useMemo(() => {
    const agg = {};
    const acc = (r, chave) => (r.extra || []).forEach((c) => { const k = c.c; const o = (agg[k] ||= { nome: k, a: { custo: 0, cliques: 0, imp: 0, conv: 0, sessoes: 0 }, b: { custo: 0, cliques: 0, imp: 0, conv: 0, sessoes: 0 } }); ["custo", "cliques", "imp", "conv", "sessoes"].forEach((m) => { o[chave][m] += Number(c[m] || 0); }); });
    rows.filter((r) => r.site === siteSel && r.fonte === "ads" && r.metrica === "custo").forEach((r) => { if (r.dia >= ini) acc(r, "a"); else if (r.dia >= iniAnt && r.dia <= fimAnt) acc(r, "b"); });
    const lista = Object.values(agg).sort((x, y) => y.a.custo - x.a.custo);
    const tot = (k) => lista.reduce((s, c) => ({ custo: s.custo + c[k].custo, cliques: s.cliques + c[k].cliques, imp: s.imp + c[k].imp, conv: s.conv + c[k].conv }), { custo: 0, cliques: 0, imp: 0, conv: 0 });
    return { lista, a: tot("a"), b: tot("b") };
  }, [rows, siteSel, periodo]);
  const adsSerie = useMemo(() => {
    const dias = {};
    rows.filter((r) => r.site === siteSel && r.fonte === "ads" && r.dia >= ini).forEach((r) => { const d = (dias[r.dia] ||= { dia: dm(r.dia), iso: r.dia }); d[r.metrica] = Number(r.valor); });
    return Object.values(dias).sort((a, b) => a.iso.localeCompare(b.iso));
  }, [rows, siteSel, periodo]);

  // Redes sociais (Meta): Facebook e Instagram do site selecionado
  const redes = useMemo(() => {
    const m = (k, de, ate) => soma(siteSel, "meta", k, de, ate);
    const ult = (k) => ultimoVal(siteSel, "meta", k);
    const par = (k) => ({ atual: m(k, ini), ant: m(k, iniAnt, fimAnt) });
    const posts = ultimoExtra("meta", "ig_ultimos_posts");
    return { tem: ult("ig_seguidores") != null || ult("fb_seguidores") != null, igSeg: ult("ig_seguidores"), fbSeg: ult("fb_seguidores"),
      igAlcance: par("ig_alcance"), igViews: par("ig_views"), igInter: par("ig_interacoes"), igNovos: par("ig_novos_seguidores"), igPerfil: par("ig_visitas_perfil"),
      fbEng: par("fb_engajamento"), fbVis: par("fb_visitas"), fbNovos: par("fb_novos_seguidores"), posts: posts.filter((x) => x.d >= ini) };
  }, [rows, siteSel, periodo]);
  const redesSerie = useMemo(() => {
    const dias = {};
    rows.filter((r) => r.site === siteSel && r.fonte === "meta" && r.dia >= ini && (r.metrica === "ig_alcance" || r.metrica === "ig_views" || r.metrica === "fb_engajamento")).forEach((r) => { const d = (dias[r.dia] ||= { dia: dm(r.dia), iso: r.dia }); d[r.metrica] = Number(r.valor); });
    return Object.values(dias).sort((a, b) => a.iso.localeCompare(b.iso));
  }, [rows, siteSel, periodo]);

  const atendSerie = useMemo(() => {
    const dias = {};
    rows.filter((r) => r.site === "robooster" && r.fonte === "atendimento" && r.dia >= ini).forEach((r) => {
      const d = (dias[r.dia] ||= { dia: dm(r.dia), iso: r.dia }); d[r.metrica] = Number(r.valor);
    });
    return Object.values(dias).sort((a, b) => a.iso.localeCompare(b.iso));
  }, [rows, periodo]);

  const siteObj = SITES.find((s) => s.id === siteSel);
  const ultimaColeta = rows.length ? rows[rows.length - 1].dia : null;
  const vit = (m) => ultimoVal(siteSel, "vitals", m);
  const idxOk = ultimoVal(siteSel, "indexacao", "posts_indexados"), idxTot = ultimoVal(siteSel, "indexacao", "posts_total"), idxQuando = ultimo(siteSel, "indexacao", "posts_total")?.dia;
  const inow = ultimo(siteSel, "indexnow", "urls");

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Central de Análise"
        description={`Google, Bing, Analytics, IA, velocidade, indexação, atendimento e Mapa da Placa dos 4 sites. Coleta diária 07h30${ultimaColeta ? ` · dados até ${dm(ultimaColeta)}` : ""}.`}
        actions={<div className="flex gap-1">{[7, 28, 90].map((p) => (<Button key={p} size="sm" variant={periodo === p ? "default" : "outline"} onClick={() => setPeriodo(p)}>{p} dias</Button>))}</div>}
      />
      {erro && <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">Não consegui ler as métricas: {erro}</div>}
      {loading ? (<div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>) : (
        <>
          {/* Pontos de atenção */}
          <Card className="mb-6 border-amber-200">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" /> Pontos de atenção · últimos {periodo} dias contra os {periodo} anteriores</CardTitle></CardHeader>
            <CardContent>
              {alertas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum alerta pelas regras atuais.</p> : (
                <ul className="space-y-2 text-sm">
                  {alertas.map((a, i) => (<li key={i} className="flex items-start gap-2"><Sev nivel={a.nivel} /><span><b>{a.site.nome}:</b> {a.txt}</span></li>))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Resumo dos 4 sites */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 mb-6">
            {resumo.map((s) => (
              <Card key={s.id} className={`cursor-pointer transition ${siteSel === s.id ? "ring-2 ring-primary" : "hover:shadow"}`} onClick={() => setSiteSel(s.id)}>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: s.cor }} />{s.nome}</span>{s.nota != null && <span className={`text-xs px-2 py-0.5 rounded ${s.nota >= 80 ? "bg-emerald-100 text-emerald-700" : s.nota >= 60 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>vel. {s.nota}</span>}</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div><div className="text-xs text-muted-foreground">Cliques Google</div><div className="font-semibold tabular-nums">{fmt(s.gscCli.atual)} <Delta atual={s.gscCli.atual} anterior={s.gscCli.ant} /></div></div>
                  <div><div className="text-xs text-muted-foreground">Cliques Bing</div><div className="font-semibold tabular-nums">{fmt(s.bingCli.atual)} <Delta atual={s.bingCli.atual} anterior={s.bingCli.ant} /></div></div>
                  <div><div className="text-xs text-muted-foreground">Usuários (GA4)</div><div className="tabular-nums">{fmt(s.usuarios.atual)} <Delta atual={s.usuarios.atual} anterior={s.usuarios.ant} /></div></div>
                  <div><div className="text-xs text-muted-foreground">Sessões de IA</div><div className="tabular-nums">{fmt(s.ia.atual)} <Delta atual={s.ia.atual} anterior={s.ia.ant} /></div></div>
                  <div className="col-span-2 text-xs text-muted-foreground">{fmt(s.posts.atual)} post(s) no período</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Site selecionado */}
          <div className="flex items-center gap-2 mb-3"><Globe className="w-4 h-4" /><h2 className="text-lg font-semibold">{siteObj?.nome}</h2><span className="text-sm text-muted-foreground">últimos {periodo} dias</span></div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6 mb-4">
            <Num label="Cliques Google" valor={soma(siteSel, "gsc", "cliques", ini)} anterior={soma(siteSel, "gsc", "cliques", iniAnt, fimAnt)} icon={Search} />
            <Num label="Cliques Bing" valor={soma(siteSel, "bing", "cliques", ini)} anterior={soma(siteSel, "bing", "cliques", iniAnt, fimAnt)} icon={Search} />
            <Num label="Usuários" valor={soma(siteSel, "ga4", "usuarios", ini)} anterior={soma(siteSel, "ga4", "usuarios", iniAnt, fimAnt)} icon={Users} />
            <Num label="Sessões de IA" valor={ASSISTENTES.reduce((a, c) => a + soma(siteSel, "ia", c.k, ini), 0)} anterior={ASSISTENTES.reduce((a, c) => a + soma(siteSel, "ia", c.k, iniAnt, fimAnt), 0)} icon={Bot} />
            <Num label="Sessões de anúncio" valor={soma(siteSel, "ga4_canal", "anuncio", ini)} anterior={soma(siteSel, "ga4_canal", "anuncio", iniAnt, fimAnt)} icon={Megaphone} />
            <Num label="Posts publicados" valor={soma(siteSel, "wp", "posts", ini)} anterior={soma(siteSel, "wp", "posts", iniAnt, fimAnt)} />
          </div>

          {/* Altas e baixas */}
          <div className="grid gap-4 lg:grid-cols-3 mb-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" /> Em alta</CardTitle></CardHeader>
              <CardContent className="text-sm">{movers.alta.length === 0 && movers.novos.length === 0 ? <p className="text-muted-foreground">Nada subiu mais de 10%.</p> : (<ul className="space-y-1">
                {movers.alta.map((m, i) => <li key={i} className="flex justify-between gap-2"><span>{m.nome}</span><span className="tabular-nums text-emerald-700 font-medium">+{m.p.toFixed(0)}% <span className="text-muted-foreground font-normal">({fmt(m.ant)} → {fmt(m.atual)})</span></span></li>)}
                {movers.novos.map((m, i) => <li key={"n" + i} className="flex justify-between gap-2"><span>{m.nome}</span><span className="tabular-nums text-emerald-700 font-medium">novo: {fmt(m.atual)}</span></li>)}
              </ul>)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-600" /> Em baixa</CardTitle></CardHeader>
              <CardContent className="text-sm">{movers.baixa.length === 0 ? <p className="text-muted-foreground">Nada caiu mais de 10%.</p> : (<ul className="space-y-1">
                {movers.baixa.map((m, i) => <li key={i} className="flex justify-between gap-2"><span>{m.nome}</span><span className="tabular-nums text-red-700 font-medium">{m.p.toFixed(0)}% <span className="text-muted-foreground font-normal">({fmt(m.ant)} → {fmt(m.atual)})</span></span></li>)}
              </ul>)}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Gauge className="w-4 h-4" /> Velocidade no celular · indexação · IndexNow</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <div className="flex justify-between"><span>Nota PageSpeed</span><b className="tabular-nums">{fmt(vit("nota"))}</b></div>
                <div className="flex justify-between"><span>Imagem principal (LCP)</span><b className="tabular-nums">{fmt(vit("lcp_s"))} s</b></div>
                <div className="flex justify-between"><span>Pulo de layout (CLS)</span><b className="tabular-nums">{fmt(vit("cls"))}</b></div>
                <div className="flex justify-between"><span>Bloqueio (TBT)</span><b className="tabular-nums">{fmt(vit("tbt_ms"))} ms</b></div>
                <div className="flex justify-between border-t pt-1 mt-1"><span>Posts no índice do Google</span><b className="tabular-nums">{idxTot ? `${fmt(idxOk)} / ${fmt(idxTot)}` : "—"}{idxQuando && <span className="text-muted-foreground font-normal text-xs"> ({dm(idxQuando)})</span>}</b></div>
                <div className="flex justify-between"><span>IndexNow (Bing), último envio</span><b className="tabular-nums">{inow ? `${fmt(inow.valor)} URLs · HTTP ${inow.extra?.http} · ${dm(inow.dia)}` : "—"}</b></div>
              </CardContent></Card>
          </div>

          {/* Gráficos */}
          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Por dia: cliques Google × Bing, usuários, sessões de IA</CardTitle></CardHeader>
              <CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={serie} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="dia" tick={{ fontSize: 11 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 11 }} width={36} /><Tooltip /><Legend />
                <Line type="monotone" dataKey="google" name="Cliques Google" stroke="#4285f4" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="bing" name="Cliques Bing" stroke="#0a8f5c" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="usuarios" name="Usuários" stroke="#111827" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="ia" name="Sessões de IA" stroke="#c85f10" dot={false} strokeWidth={1.5} />
              </LineChart></ResponsiveContainer></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Impressões por dia: Google × Bing</CardTitle></CardHeader>
              <CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={serie} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="dia" tick={{ fontSize: 11 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 11 }} width={44} /><Tooltip /><Legend />
                <Line type="monotone" dataKey="googleImp" name="Impressões Google" stroke="#4285f4" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="bingImp" name="Impressões Bing" stroke="#0a8f5c" dot={false} strokeWidth={2} />
              </LineChart></ResponsiveContainer></CardContent></Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3 mb-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">De onde vêm as sessões (GA4)</CardTitle></CardHeader>
              <CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={canaisTot} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="n" name="Sessões" fill="#6b7280" radius={[0, 4, 4, 0]} />
              </BarChart></ResponsiveContainer></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Bot className="w-4 h-4" /> Visitas vindas de IA, por assistente</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {iaTot.length === 0 ? <p className="text-muted-foreground">Nenhuma visita de assistente de IA no período.</p> : (
                  <table className="w-full"><thead><tr className="text-xs text-muted-foreground"><th className="text-left font-normal">Assistente</th><th className="text-right font-normal">{siteObj?.nome}</th><th className="text-right font-normal">4 sites</th></tr></thead><tbody>
                    {iaTot.map((c) => <tr key={c.k} className="border-b last:border-0"><td className="py-1"><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: c.cor }} />{c.nome}</td><td className="py-1 text-right tabular-nums">{fmt(c.n)}</td><td className="py-1 text-right tabular-nums text-muted-foreground">{fmt(c.todos)}</td></tr>)}
                  </tbody></table>)}
                <p className="text-xs text-muted-foreground mt-2">Fonte da sessão no GA4. É a única medição possível de "busca em IA" hoje: o assistente cita o site e a pessoa clica.</p>
              </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">O que buscam no Bing (impressões / cliques)</CardTitle></CardHeader>
              <CardContent className="text-sm">{topBing.length === 0 ? <p className="text-muted-foreground">Sem dados do Bing ainda para este site.</p> : (
                <table className="w-full"><tbody>{topBing.slice(0, 10).map((q, i) => (<tr key={i} className="border-b last:border-0"><td className="py-1 pr-2 truncate max-w-[220px]" title={q.q}>{q.q}</td><td className="py-1 text-right tabular-nums text-muted-foreground">{fmt(q.i)} / <b className="text-foreground">{fmt(q.c)}</b></td></tr>))}</tbody></table>)}
              </CardContent></Card>
          </div>

          {redes.tem && (
            <Card className="mb-4"><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Redes sociais (Instagram e Facebook) · {periodo} dias contra os {periodo} anteriores</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mb-3">
                  <Num label="Seguidores Instagram" valor={redes.igSeg} anterior={null} />
                  <Num label="Novos seguidores IG" valor={redes.igNovos.atual} anterior={redes.igNovos.ant} />
                  <Num label="Alcance IG (contas)" valor={redes.igAlcance.atual} anterior={redes.igAlcance.ant} />
                  <Num label="Visualizações IG" valor={redes.igViews.atual} anterior={redes.igViews.ant} />
                  <Num label="Interações IG" valor={redes.igInter.atual} anterior={redes.igInter.ant} />
                  <Num label="Visitas ao perfil IG" valor={redes.igPerfil.atual} anterior={redes.igPerfil.ant} />
                  <Num label="Seguidores Facebook" valor={redes.fbSeg} anterior={null} />
                  <Num label="Engajamento Facebook" valor={redes.fbEng.atual} anterior={redes.fbEng.ant} />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="h-44"><ResponsiveContainer width="100%" height="100%"><LineChart data={redesSerie} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="dia" tick={{ fontSize: 10 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend />
                    <Line type="monotone" dataKey="ig_alcance" name="Alcance IG" stroke="#e1306c" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="ig_views" name="Visualizações IG" stroke="#f59e0b" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="fb_engajamento" name="Engajamento FB" stroke="#1877f2" dot={false} strokeWidth={1.5} />
                  </LineChart></ResponsiveContainer></div>
                  <div>{redes.posts.length === 0 ? <p className="text-muted-foreground">Sem posts no Instagram no período.</p> : (
                    <table className="w-full"><thead><tr className="text-xs text-muted-foreground"><th className="text-left font-normal">Posts recentes no Instagram</th><th className="text-right font-normal">Curtidas</th><th className="text-right font-normal">Coment.</th></tr></thead><tbody>
                      {redes.posts.slice(0, 8).map((p, i) => (<tr key={i} className="border-b last:border-0"><td className="py-1 pr-2 truncate max-w-[280px]"><a href={p.u} target="_blank" rel="noopener" className="hover:underline">{dm(p.d)} · {p.t === "VIDEO" ? "vídeo" : p.t === "CAROUSEL_ALBUM" ? "carrossel" : "imagem"} · {p.cap || "(sem legenda)"}</a></td><td className="py-1 text-right tabular-nums">{fmt(p.l)}</td><td className="py-1 text-right tabular-nums">{fmt(p.c)}</td></tr>))}
                    </tbody></table>)}</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Fonte: API da Meta com o usuário do sistema do portfólio router.66 (token sem validade). Facebook: engajamento em posts, visitas à página e novos seguidores por dia. Instagram: alcance, visualizações, interações, visitas ao perfil e novos seguidores por dia.</p>
              </CardContent></Card>
          )}

          {ads.lista.length > 0 && (
            <Card className="mb-4"><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Megaphone className="w-4 h-4" /> Campanhas do Google Ads · {periodo} dias contra os {periodo} anteriores</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                  <Num label="Cliques" valor={ads.a.cliques} anterior={ads.b.cliques} />
                  <Num label="Impressões" valor={ads.a.imp} anterior={ads.b.imp} />
                  <Num label="Taxa de clique" valor={ads.a.imp ? (ads.a.cliques / ads.a.imp) * 100 : null} anterior={ads.b.imp ? (ads.b.cliques / ads.b.imp) * 100 : null} sufixo="%" />
                  <Num label="Sessões trazidas" valor={ads.lista.reduce((s, c) => s + c.a.sessoes, 0)} anterior={ads.lista.reduce((s, c) => s + c.b.sessoes, 0)} />
                  <Num label="Conversões (eventos-chave)" valor={ads.a.conv} anterior={ads.b.conv} />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="overflow-x-auto"><table className="w-full"><thead><tr className="text-xs text-muted-foreground"><th className="text-left font-normal">Campanha</th><th className="text-right font-normal">Impressões</th><th className="text-right font-normal">Cliques</th><th className="text-right font-normal">Sessões</th><th className="text-right font-normal">Conv.</th></tr></thead><tbody>
                    {ads.lista.map((c) => (<tr key={c.nome} className="border-b last:border-0"><td className="py-1 pr-2 max-w-[260px] truncate" title={c.nome}>{c.nome}</td><td className="py-1 text-right tabular-nums">{fmt(c.a.imp)} <Delta atual={c.a.imp} anterior={c.b.imp} /></td><td className="py-1 text-right tabular-nums">{fmt(c.a.cliques)} <Delta atual={c.a.cliques} anterior={c.b.cliques} /></td><td className="py-1 text-right tabular-nums">{fmt(c.a.sessoes)}</td><td className="py-1 text-right tabular-nums">{fmt(c.a.conv)} <Delta atual={c.a.conv} anterior={c.b.conv} /></td></tr>))}
                  </tbody></table></div>
                  <div className="h-44"><ResponsiveContainer width="100%" height="100%"><BarChart data={adsSerie} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis dataKey="dia" tick={{ fontSize: 10 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend />
                    <Bar dataKey="cliques" name="Cliques por dia" fill="#f59e0b" radius={[3, 3, 0, 0]} /><Bar dataKey="conversoes" name="Conversões" fill="#6b7280" radius={[3, 3, 0, 0]} />
                  </BarChart></ResponsiveContainer></div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Fonte: conta do Google Ads vinculada ao GA4. Cliques e impressões batem com a tela do Ads; o custo NÃO chega inteiro por essa via (10/09: R$ 155 aqui contra R$ 767 no Ads em 14 dias) e por isso fica de fora até termos o relatório do próprio Ads. "Conversões" são os eventos-chave do GA4 atribuídos à campanha, não pedidos.</p>
              </CardContent></Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3 mb-4">
            <Card className="lg:col-span-1"><CardHeader className="pb-2"><CardTitle className="text-sm">Páginas mais vistas (7 dias) e variação contra a semana anterior</CardTitle></CardHeader>
              <CardContent className="text-sm">{topPag.length === 0 ? <p className="text-muted-foreground">Sem dados.</p> : (
                <table className="w-full"><tbody>{(pagMov.length ? pagMov : topPag).slice(0, 10).map((p, i) => (<tr key={i} className="border-b last:border-0"><td className="py-1 pr-2 truncate max-w-[220px]" title={p.p}>{p.p}</td><td className="py-1 text-right tabular-nums">{fmt(p.v)}{p.delta != null && <span className={`ml-1 text-xs ${p.delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>{p.delta >= 0 ? "+" : ""}{p.delta.toFixed(0)}%</span>}</td></tr>))}</tbody></table>)}
                {!pagMov.length && <p className="text-xs text-muted-foreground mt-2">A comparação semana a semana aparece a partir de 17/09, quando houver duas semanas guardadas.</p>}
              </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Atendimento WhatsApp (Robooster)</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Num label="Conversas novas" valor={soma("robooster", "atendimento", "conversas_novas", ini)} anterior={soma("robooster", "atendimento", "conversas_novas", iniAnt, fimAnt)} />
                  <Num label="Msgs recebidas" valor={soma("robooster", "atendimento", "msgs_recebidas", ini)} anterior={soma("robooster", "atendimento", "msgs_recebidas", iniAnt, fimAnt)} />
                  <Num label="1ª resposta (mediana)" valor={media("robooster", "atendimento", "primeira_resposta_min", ini)} anterior={media("robooster", "atendimento", "primeira_resposta_min", iniAnt, fimAnt)} sufixo=" min" />
                  <Num label="Sem resposta +24 h" valor={ultimoVal("robooster", "atendimento", "sem_resposta_24h")} anterior={null} />
                </div>
                <div className="h-36"><ResponsiveContainer width="100%" height="100%"><BarChart data={atendSerie} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="conversas_novas" name="Conversas novas" fill="#25d366" radius={[3, 3, 0, 0]} />
                </BarChart></ResponsiveContainer></div>
              </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Map className="w-4 h-4" /> Mapa da Placa (Saber)</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <Num label="Assinantes ativos" valor={ultimoVal("saber", "mapa", "assinantes_ativos")} anterior={null} />
                  <Num label="Pendentes / cancelados" valor={(ultimoVal("saber", "mapa", "assinantes_pendentes") ?? 0)} anterior={null} sufixo={` / ${fmt(ultimoVal("saber", "mapa", "assinantes_cancelados") ?? 0)}`} />
                  <Num label="E-mails captados (total)" valor={ultimoVal("saber", "mapa", "leads_total")} anterior={null} />
                  <Num label="Fichas no acervo" valor={ultimoVal("saber", "mapa", "acervo") ?? ultimoVal("saber", "fabrica", "acervo")} anterior={null} />
                  <Num label="Fichas produzidas no período" valor={soma("saber", "fabrica", "fichas_dia", ini)} anterior={soma("saber", "fabrica", "fichas_dia", iniAnt, fimAnt)} />
                  <Num label="Leads no período" valor={soma("saber", "leads", "ficha-gratis", ini) + soma("saber", "leads", "post", ini)} anterior={soma("saber", "leads", "ficha-gratis", iniAnt, fimAnt) + soma("saber", "leads", "post", iniAnt, fimAnt)} />
                </div>
              </CardContent></Card>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Fontes: Search Console (atrasa 2 a 3 dias) · Bing Webmaster (histórico desde a verificação de 09/09) · GA4 (usuários, canais, assistentes de IA pela origem da sessão) · PageSpeed Insights (celular, 1× ao dia) · inspeção de URLs no Google (semanal, domingo 05h) · Chatwoot (caixa WhatsApp) · Mercado Pago (assinaturas) · IndexNow. Regras dos alertas: queda ≥ 25% contra o período anterior, índice &lt; 80% dos posts, nota de velocidade &lt; 60, LCP &gt; 4 s, CLS &gt; 0,25, 1ª resposta &gt; 60 min, sem resposta &gt; 24 h, zero pagantes, fábrica parada 2 dias, cadência de posts abaixo da metade.
          </p>
        </>
      )}
    </div>
  );
}
