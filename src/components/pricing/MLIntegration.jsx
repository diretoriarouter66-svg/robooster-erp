import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ShoppingCart, Upload, Eye } from "lucide-react";

// Conexão + sincronização de preços com o Mercado Livre — espelho do
// precificador unificado: prévia (dry run) sempre antes do envio real.
const chamarML = async (payload) => {
  try {
    const { data: sessao } = await supabase.auth.getSession();
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ml`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${sessao?.session?.access_token ?? ""}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch (err) {
    // rede/edge fora do ar: devolve erro tratável em vez de travar a tela em loading
    return { ok: false, status: 0, data: { error: `Sem conexão com a integração: ${err.message}` } };
  }
};

const formatBRL = (v) => v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function MLIntegration() {
  const [status, setStatus] = useState({ carregando: true, connected: false, nickname: null, reason: null });
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [resultado, setResultado] = useState(null);

  const checar = useCallback(async () => {
    const { data } = await chamarML({ acao: "check" });
    setStatus({ carregando: false, connected: !!data.connected, nickname: data.nickname, reason: data.reason });
  }, []);

  useEffect(() => { checar(); }, [checar]);

  useEffect(() => {
    const handler = (e) => { if (e.data?.type === "ML_AUTH_SUCCESS") checar(); };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [checar]);

  const conectar = async () => {
    setBusy(true);
    const { ok, data } = await chamarML({ acao: "authorize" });
    setBusy(false);
    if (!ok) { alert(data.error || "Erro ao iniciar a conexão."); return; }
    window.open(data.auth_url, "ml_auth", "width=520,height=680");
  };

  const desconectar = async () => {
    if (!confirm("Desconectar a conta do Mercado Livre?")) return;
    setBusy(true);
    await chamarML({ acao: "disconnect" });
    setBusy(false);
    checar();
  };

  const abrirPrevia = async () => {
    setModalOpen(true);
    setResultado(null);
    setPreview(null);
    setPreviewLoading(true);
    const { ok, status: st, data } = await chamarML({ acao: "sync", dry_run: true });
    setPreviewLoading(false);
    if (!ok) {
      if (st === 401) { alert("Conexão com o ML expirou — conecte de novo."); setModalOpen(false); checar(); return; }
      alert(data.error || "Erro na prévia.");
      setModalOpen(false);
      return;
    }
    setPreview(data);
  };

  const enviar = async (onlySkus = null) => {
    const alvo = onlySkus ? `o SKU ${onlySkus[0]}` : `${preview?.aMudar ?? "?"} anúncios`;
    if (!confirm(`Enviar os preços para ${alvo} no Mercado Livre AGORA?\n\nIsso altera o preço público dos anúncios.`)) return;
    setSending(true);
    const { ok, data } = await chamarML({ acao: "sync", ...(onlySkus ? { only_skus: onlySkus } : {}) });
    setSending(false);
    if (!ok) { alert(data.error || "Erro no envio."); return; }
    setResultado(data);
    const { data: pv } = await chamarML({ acao: "sync", dry_run: true });
    setPreview(pv);
  };

  if (status.carregando) return <Button variant="outline" disabled><Loader2 className="w-4 h-4 mr-1 animate-spin" /> ML</Button>;

  if (!status.connected) {
    return (
      <Button variant="outline" onClick={conectar} disabled={busy} title={status.reason === "app_nao_configurado" ? "App do ML ainda não configurado — peça ao Mauricio" : "Conectar a conta do Mercado Livre"}>
        {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-1" />} Conectar Mercado Livre
      </Button>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button variant="outline" onClick={abrirPrevia}>
          <ShoppingCart className="w-4 h-4 mr-1" /> Sincronizar ML
          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success">{status.nickname || "conectado"}</span>
        </Button>
        <button onClick={desconectar} className="text-[10px] text-muted-foreground hover:text-destructive underline px-1" title="Desconectar conta">sair</button>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Sincronizar preços com o Mercado Livre</DialogTitle></DialogHeader>

          {previewLoading && <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Lendo os anúncios da conta e comparando os preços...</div>}

          {preview && (
            <>
              <div className="flex gap-2 flex-wrap text-xs">
                <span className="px-2 py-1 rounded-full bg-muted">{preview.totalAnuncios} anúncios na conta</span>
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">{preview.aMudar} vão mudar</span>
                {preview.semPreco > 0 && <span className="px-2 py-1 rounded-full bg-warning/10 text-warning">{preview.semPreco} sem preço configurado</span>}
                {preview.naoEncontrados > 0 && <span className="px-2 py-1 rounded-full bg-destructive/10 text-destructive">{preview.naoEncontrados} SKU não achado no ML</span>}
              </div>

              <div className="overflow-x-auto mt-3 border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="text-left px-2 py-2">SKU / Produto</th>
                    <th className="text-left px-2 py-2">Anúncio</th>
                    <th className="text-right px-2 py-2">Preço atual</th>
                    <th className="text-right px-2 py-2">Preço novo</th>
                    <th className="text-left px-2 py-2">Situação</th>
                    <th className="px-2 py-2"></th>
                  </tr></thead>
                  <tbody>
                    {(preview.preview || []).map((r, i) => (
                      <tr key={i} className={`border-b border-border/50 last:border-0 ${r.muda ? "bg-primary/5" : ""}`}>
                        <td className="px-2 py-1.5"><span className="font-mono">{r.sku}</span><br /><span className="text-muted-foreground">{r.product_name}</span></td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.item_id || "—"}<br />{r.listing_type_id || ""}</td>
                        <td className="px-2 py-1.5 text-right">{formatBRL(r.preco_atual)}</td>
                        <td className={`px-2 py-1.5 text-right font-medium ${r.muda ? "text-primary" : ""}`}>{formatBRL(r.preco_novo)}</td>
                        <td className="px-2 py-1.5">{r.motivo}</td>
                        <td className="px-2 py-1.5 text-right">
                          {r.muda && <button onClick={() => enviar([r.sku])} disabled={sending} className="text-[10px] text-primary hover:underline whitespace-nowrap">testar envio</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {resultado && (
                <div className={`mt-3 rounded-lg p-3 text-sm ${resultado.failed ? "bg-warning/10 border border-warning/30" : "bg-success/10 border border-success/30"}`}>
                  ✅ {resultado.updated} anúncio(s) atualizado(s){resultado.failed ? ` · ${resultado.failed} falha(s)` : ""}
                  {(resultado.failures || []).map((f, i) => <p key={i} className="text-xs text-destructive mt-1">{f.sku}: {f.reason}</p>)}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={abrirPrevia} disabled={previewLoading || sending}><Eye className="w-4 h-4 mr-1" /> Atualizar prévia</Button>
                <Button onClick={() => enviar(null)} disabled={sending || !preview.aMudar}>
                  {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Enviar tudo ({preview.aMudar})
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
