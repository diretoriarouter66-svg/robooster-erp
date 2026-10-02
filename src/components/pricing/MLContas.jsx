import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Link2, CheckCircle2, AlertTriangle } from "lucide-react";

// 02/10/2026 — conexão PRÓPRIA do ERP com o Mercado Livre, uma por conta (ROUTER 66 e SABERDAELETRÔNICA).
// Até as duas estarem conectadas aqui, a leitura de pedidos usa a conexão do precificador.
export const chamarML = async (payload) => {
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
    return { ok: false, status: 0, data: { error: `Sem conexão com a integração: ${err.message}` } };
  }
};

const ESPERADAS = [
  { id: "95663631", nome: "ROUTER 66" },
  { id: "368465914", nome: "SABERDAELETRÔNICA" },
];

export default function MLContas() {
  const [st, setSt] = useState({ carregando: true, contas: [], permissoes: null, erro: null });
  const [busy, setBusy] = useState(false);

  const checar = useCallback(async () => {
    const { ok, data } = await chamarML({ acao: "check" });
    setSt({ carregando: false, contas: data.contas || [], permissoes: data.permissoes || null, erro: ok ? (data.reason === "app_nao_configurado" ? "O aplicativo do Mercado Livre ainda não está configurado no ERP." : null) : (data.error || "Não foi possível consultar a conexão.") });
  }, []);
  useEffect(() => { checar(); }, [checar]);
  useEffect(() => {
    const h = (e) => { if (e.data?.type === "ML_AUTH_SUCCESS") checar(); };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [checar]);

  const conectar = async () => {
    setBusy(true);
    const { ok, data } = await chamarML({ acao: "authorize" });
    setBusy(false);
    if (!ok) { alert(data.error || "Erro ao iniciar a conexão."); return; }
    window.open(data.auth_url, "ml_auth", "width=520,height=680");
  };
  const desconectar = async (c) => {
    if (!confirm(`Desconectar a conta ${c.nickname || c.ml_user_id} do ERP?`)) return;
    setBusy(true);
    await chamarML({ acao: "disconnect", ml_user_id: c.ml_user_id });
    setBusy(false);
    checar();
  };

  const conectada = (id) => st.contas.find((c) => String(c.ml_user_id) === id);
  const outras = st.contas.filter((c) => !ESPERADAS.some((e) => e.id === String(c.ml_user_id)));
  const p = st.permissoes;
  const faltaPerm = p ? [!p.pedidos && "vendas e envios", !p.faturamento_escrita && "faturamento (leitura e escrita)"].filter(Boolean) : [];

  return (
    <div className="bg-card rounded-xl border border-border p-4 mb-6 text-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="font-medium flex items-center gap-2"><Link2 className="w-4 h-4 text-muted-foreground" /> Conexão do ERP com o Mercado Livre</span>
        {st.carregando ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : (
          <>
            {ESPERADAS.map((e) => {
              const c = conectada(e.id);
              return (
                <span key={e.id} className="inline-flex items-center gap-1.5">
                  {c ? <CheckCircle2 className="w-4 h-4 text-success" /> : <span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" />}
                  <span className={c ? "" : "text-muted-foreground"}>{e.nome}{c ? "" : " — não conectada"}</span>
                  {c && <button onClick={() => desconectar(c)} disabled={busy} className="text-[10px] text-muted-foreground hover:text-destructive underline">desconectar</button>}
                </span>
              );
            })}
            {outras.map((c) => (
              <span key={c.ml_user_id} className="inline-flex items-center gap-1.5 text-warning">
                <AlertTriangle className="w-4 h-4" /> {c.nickname || c.ml_user_id} (conta não esperada)
                <button onClick={() => desconectar(c)} disabled={busy} className="text-[10px] underline">desconectar</button>
              </span>
            ))}
            <Button variant="outline" size="sm" onClick={conectar} disabled={busy} className="ml-auto">
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />} Conectar uma conta
            </Button>
          </>
        )}
      </div>
      {!st.carregando && st.erro && <p className="text-destructive mt-2">{st.erro}</p>}
      {!st.carregando && faltaPerm.length > 0 && (
        <p className="text-destructive mt-2">O aplicativo do ERP no Mercado Livre está sem a permissão de {faltaPerm.join(" e de ")}. Sem ela o ERP não lê os dados do comprador nem envia a nota.</p>
      )}
      {!st.carregando && !st.erro && st.contas.length < ESPERADAS.length && (
        <p className="text-muted-foreground mt-2 text-xs">Antes de clicar em "Conectar uma conta", entre no Mercado Livre com a conta que quer ligar. Para a segunda, saia do Mercado Livre, entre com a outra conta e clique de novo. Enquanto uma conta não estiver conectada aqui, o ERP continua lendo os pedidos dela pela conexão do precificador.</p>
      )}
    </div>
  );
}
