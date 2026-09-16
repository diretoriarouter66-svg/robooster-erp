import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ExternalLink, Loader2, Users } from "lucide-react";

// Análise de concorrência por produto — espelho do precificador unificado:
// uma linha por concorrente (nome, preço, praça, mídia), nível de anúncio
// derivado da quantidade de plataformas. Aqui liga direto no product_id.
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const PLATAFORMAS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "google_ads", label: "Google Ads" },
  { value: "tiktok", label: "TikTok" },
  { value: "mercado_livre", label: "Mercado Livre" },
  { value: "site", label: "Site próprio" },
];
const nivelAnuncio = (n) => n <= 0 ? null : n <= 2 ? { nivel: "baixo", label: "Baixo", cor: "bg-success/10 text-success" } : n <= 4 ? { nivel: "medio", label: "Médio", cor: "bg-warning/10 text-warning" } : { nivel: "alto", label: "Alto", cor: "bg-destructive/10 text-destructive" };

const formatBRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export default function CompetitorSection({ productId, precoProprio }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await base44.entities.CompetitorAnalysis.filter({ product_id: productId }, "-created_date", 100).catch(() => []);
      setRows(data || []);
      setLoading(false);
    })();
  }, [productId]);

  const setRow = (ix, campo, valor) => setRows(prev => prev.map((r, i) => i === ix ? { ...r, [campo]: valor } : r));
  const togglePlataforma = (ix, p) => setRows(prev => prev.map((r, i) => {
    if (i !== ix) return r;
    const atual = r.ads_platforms || [];
    return { ...r, ads_platforms: atual.includes(p) ? atual.filter(x => x !== p) : [...atual, p] };
  }));

  const addRow = () => {
    setRows(prev => [...prev, { product_id: productId, company_name: "", competitor_price: "", product_type: "identico", ads_platforms: [], _novo: true }]);
    setAberto(rows.length);
  };

  const removeRow = async (ix) => {
    const r = rows[ix];
    if (r.id && !confirm(`Remover o concorrente "${r.company_name}"?`)) return;
    if (r.id) await base44.entities.CompetitorAnalysis.delete(r.id).catch(() => {});
    setRows(prev => prev.filter((_, i) => i !== ix));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const r of rows) {
        if (!r.company_name?.trim()) continue;
        const n = (r.ads_platforms || []).length;
        const data = {
          product_id: productId,
          company_name: r.company_name.trim(),
          competitor_price: parseFloat(r.competitor_price) || null,
          city: r.city || null, state: r.state || null,
          whatsapp: r.whatsapp || null, website: r.website || null,
          product_type: r.product_type || "identico",
          similar_model_description: r.product_type === "similar" ? (r.similar_model_description || null) : null,
          ads_platforms: r.ads_platforms || [],
          ad_level: nivelAnuncio(n)?.nivel || null,
          observations: r.observations || null,
        };
        if (r.id) await base44.entities.CompetitorAnalysis.update(r.id, data);
        else {
          const salvo = await base44.entities.CompetitorAnalysis.create(data);
          r.id = salvo?.id;
        }
      }
      setRows(prev => prev.filter(r => r.company_name?.trim()));
      alert("Concorrência salva.");
    } catch (err) {
      alert(`Erro ao salvar concorrência: ${err.message}`);
    }
    setSaving(false);
  };

  const precos = rows.map(r => parseFloat(r.competitor_price) || 0).filter(v => v > 0);
  const media = precos.length ? precos.reduce((a, b) => a + b, 0) / precos.length : 0;
  const menor = precos.length ? Math.min(...precos) : 0;
  const altoCount = rows.filter(r => (r.ads_platforms || []).length > 4).length;

  if (loading) return <div className="bg-card rounded-xl border border-border p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="bg-card rounded-xl border border-border p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-heading font-semibold text-sm">Análise de Concorrência</h3>
          {rows.length > 0 && <span className="text-xs text-muted-foreground">({rows.length} concorrente{rows.length > 1 ? "s" : ""}{altoCount > 0 ? ` · ${altoCount} com alto volume de anúncios` : ""})</span>}
        </div>
        <Button variant="outline" size="sm" onClick={addRow}><Plus className="w-3.5 h-3.5 mr-1" /> Concorrente</Button>
      </div>

      {precos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
          <div className="rounded-lg bg-muted/30 p-2"><p className="text-muted-foreground">Menor preço concorrente</p><p className="font-semibold">{formatBRL(menor)}</p></div>
          <div className="rounded-lg bg-muted/30 p-2"><p className="text-muted-foreground">Média dos concorrentes</p><p className="font-semibold">{formatBRL(media)}</p></div>
          <div className="rounded-lg bg-muted/30 p-2">
            <p className="text-muted-foreground">Seu preço vs média</p>
            <p className={`font-semibold ${precoProprio > 0 && media > 0 ? (precoProprio <= media ? "text-success" : "text-warning") : ""}`}>
              {precoProprio > 0 && media > 0 ? `${(((precoProprio - media) / media) * 100).toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>
      )}

      {rows.length === 0 && <p className="text-xs text-muted-foreground">Nenhum concorrente cadastrado — clique em "+ Concorrente" para mapear o mercado deste produto.</p>}

      <div className="space-y-2">
        {rows.map((r, ix) => {
          const na = nivelAnuncio((r.ads_platforms || []).length);
          const expandido = aberto === ix;
          return (
            <div key={r.id || `novo-${ix}`} className="border border-border rounded-lg">
              <button type="button" onClick={() => setAberto(expandido ? null : ix)} className="w-full flex items-center justify-between px-3 py-2 text-left">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{r.company_name || "Novo concorrente"}</span>
                  {parseFloat(r.competitor_price) > 0 && <span className="text-primary font-semibold">{formatBRL(parseFloat(r.competitor_price))}</span>}
                  {r.city && <span className="text-xs text-muted-foreground">{r.city}{r.state ? `/${r.state}` : ""}</span>}
                  {na && <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${na.cor}`}>Anúncios: {na.label} ({(r.ads_platforms || []).length}/6)</span>}
                  {r.product_type === "similar" && <span className="px-2 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground">Similar</span>}
                </div>
                <span className="text-xs text-muted-foreground">{expandido ? "▲" : "▼"}</span>
              </button>
              {expandido && (
                <div className="px-3 pb-3 border-t border-border/50 pt-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="col-span-2"><Label className="text-xs">Nome fantasia *</Label><Input value={r.company_name || ""} onChange={e => setRow(ix, "company_name", e.target.value)} /></div>
                    <div><Label className="text-xs">Preço (R$)</Label><Input type="number" step="0.01" value={r.competitor_price ?? ""} onChange={e => setRow(ix, "competitor_price", e.target.value)} /></div>
                    <div className="flex items-end justify-end"><button type="button" onClick={() => removeRow(ix)} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg"><Trash2 className="w-4 h-4" /></button></div>
                    <div><Label className="text-xs">Cidade</Label><Input value={r.city || ""} onChange={e => setRow(ix, "city", e.target.value)} /></div>
                    <div>
                      <Label className="text-xs">UF</Label>
                      <Select value={r.state || "none"} onValueChange={v => setRow(ix, "state", v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">—</SelectItem>{UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">WhatsApp</Label><Input value={r.whatsapp || ""} onChange={e => setRow(ix, "whatsapp", e.target.value)} placeholder="15 99999-9999" /></div>
                    <div>
                      <Label className="text-xs">Site {r.website && <a href={r.website} target="_blank" rel="noopener noreferrer" className="inline-block align-middle ml-1"><ExternalLink className="w-3 h-3 text-primary" /></a>}</Label>
                      <Input value={r.website || ""} onChange={e => setRow(ix, "website", e.target.value)} placeholder="https://" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <Label className="text-xs mb-0">Produto:</Label>
                    {[["identico", "Idêntico"], ["similar", "Similar"]].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="radio" checked={(r.product_type || "identico") === v} onChange={() => setRow(ix, "product_type", v)} /> {l}
                      </label>
                    ))}
                    {r.product_type === "similar" && <Input className="h-7 text-xs flex-1" value={r.similar_model_description || ""} onChange={e => setRow(ix, "similar_model_description", e.target.value)} placeholder="Qual modelo similar?" />}
                  </div>
                  <div className="mt-3">
                    <Label className="text-xs">Onde anuncia</Label>
                    <div className="flex gap-2 flex-wrap mt-1">
                      {PLATAFORMAS.map(p => (
                        <button key={p.value} type="button" onClick={() => togglePlataforma(ix, p.value)}
                          className={`px-2 py-1 rounded-full text-[10px] font-medium border ${(r.ads_platforms || []).includes(p.value) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3"><Label className="text-xs">Observações</Label><textarea className="w-full min-h-[50px] px-3 py-2 rounded-lg border border-input bg-background text-xs resize-none" value={r.observations || ""} onChange={e => setRow(ix, "observations", e.target.value)} /></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {rows.length > 0 && (
        <div className="flex justify-end mt-3">
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null} Salvar Concorrência</Button>
        </div>
      )}
    </div>
  );
}
