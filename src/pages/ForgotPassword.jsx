import React, { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, ArrowLeft, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/AuthLayout";

// 02/10/2026 — o servidor de login passou a enviar e-mail (caixa diretoria@, Hostinger).
// Antes esta página só mandava procurar o administrador. O administrador continua podendo
// definir a senha de alguém na tela de Contatos.
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.resetPasswordRequest(email.trim());
      setEnviado(true);
    } catch (err) {
      setError(/rate limit|security purposes/i.test(err.message || "") ? "Aguarde um minuto antes de pedir outro link." : "Não foi possível enviar agora. Tente de novo em instantes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={KeyRound}
      title="Esqueceu a senha?"
      subtitle="Enviamos um link para você criar uma senha nova"
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Voltar para o login
        </Link>
      }
    >
      {enviado ? (
        <div className="space-y-3 text-sm text-foreground">
          <p className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" /> Se <span className="font-medium">{email}</span> tiver acesso ao sistema, o link chega em instantes.</p>
          <p className="text-muted-foreground text-xs">O link vale por 1 hora e só pode ser usado uma vez. Confira também a caixa de spam. A senha nova vale para o ERP e para o Precificador.</p>
        </div>
      ) : (
        <>
          {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail de acesso</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <Input id="email" type="email" autoComplete="email" autoFocus placeholder="voce@robooster.com.br" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-12" required />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</> : "Enviar link"}
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
