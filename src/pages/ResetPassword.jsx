import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44, supabase, HASH_INICIAL } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

// 02/10/2026 — reescrita para o link de recuperação do Supabase Auth: o link do e-mail abre esta
// página já com uma sessão de recuperação (tokens no # da URL, lidos pelo supabase-js).
// A versão antiga esperava ?token= (formato do Base44) e recusava todo link.
export default function ResetPassword() {
  const [estado, setEstado] = useState("carregando"); // carregando | pronto | invalido
  const [motivo, setMotivo] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const h = new URLSearchParams(String(HASH_INICIAL || window.location.hash || "").replace(/^#/, ""));
    if (h.get("error") || h.get("error_code")) {
      setMotivo(h.get("error_code") === "otp_expired" ? "Este link já foi usado ou passou de 1 hora." : "Este link não é válido.");
      setEstado("invalido");
      return;
    }
    let vivo = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (vivo && session) setEstado("pronto"); });
    supabase.auth.getSession().then(({ data }) => { if (vivo && data?.session) setEstado("pronto"); });
    const t = setTimeout(() => { if (vivo) setEstado((s) => (s === "carregando" ? "invalido" : s)); }, 6000);
    return () => { vivo = false; clearTimeout(t); sub?.subscription?.unsubscribe?.(); };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) { setError("Use pelo menos 8 caracteres."); return; }
    if (newPassword !== confirmPassword) { setError("As duas senhas não são iguais."); return; }
    setLoading(true);
    try {
      await base44.auth.resetPassword({ newPassword });
      window.location.href = import.meta.env.BASE_URL || "/";
    } catch (err) {
      setError(/different from the old/i.test(err.message || "") ? "A senha nova precisa ser diferente da anterior." : "Não foi possível gravar a senha. Peça um link novo e tente de novo.");
    } finally {
      setLoading(false);
    }
  };

  if (estado === "carregando") {
    return <AuthLayout icon={Lock} title="Nova senha" subtitle="Conferindo o link..."><div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></AuthLayout>;
  }

  if (estado === "invalido") {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Link inválido"
        subtitle={motivo || "Não foi possível confirmar este link"}
        footer={<Link to="/forgot-password" className="text-primary font-medium hover:underline">Pedir um link novo</Link>}
      >
        <p className="text-sm text-foreground text-center">Cada link serve uma vez só e vale por 1 hora. Peça outro e abra o e-mail mais recente.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={Lock} title="Nova senha" subtitle="Ela vale para o ERP e para o Precificador">
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nova senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input id="password" type="password" autoComplete="new-password" autoFocus placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Repita a nova senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input id="confirm" type="password" autoComplete="new-password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gravando...</> : "Gravar nova senha"}
        </Button>
      </form>
    </AuthLayout>
  );
}
