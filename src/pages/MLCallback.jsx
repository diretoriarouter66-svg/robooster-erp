import React, { useEffect, useState } from "react";
import { supabase } from "@/api/base44Client";

// Popup de retorno do OAuth do Mercado Livre: troca o code pelo token via edge
// function e avisa a janela que abriu (Precificação) por postMessage.
export default function MLCallback() {
  const [msg, setMsg] = useState("Conectando ao Mercado Livre...");

  useEffect(() => {
    (async () => {
      const code = new URLSearchParams(window.location.search).get("code");
      if (!code) { setMsg("Código de autorização ausente — feche e tente de novo."); return; }
      try {
        const { data: sessao } = await supabase.auth.getSession();
        const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ml`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${sessao?.session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ acao: "callback", code }),
        });
        const resp = await r.json();
        if (!r.ok) { setMsg(`Erro: ${resp.error || "falha na conexão"}`); return; }
        setMsg("✅ Conectado! Pode fechar esta janela.");
        if (window.opener) window.opener.postMessage({ type: "ML_AUTH_SUCCESS" }, "*");
        setTimeout(() => window.close(), 1200);
      } catch (err) {
        setMsg(`Erro: ${err.message}`);
      }
    })();
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="text-4xl mb-3">🛒</div>
        <p className="text-sm">{msg}</p>
      </div>
    </div>
  );
}
