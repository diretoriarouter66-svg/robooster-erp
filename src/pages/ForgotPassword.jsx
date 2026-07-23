import React from "react";
import { Link } from "react-router-dom";
import { KeyRound, ArrowLeft } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

// A recuperação por e-mail está desativada de propósito: o servidor não envia
// e-mails (sem SMTP) e os acessos são gerenciados pelo administrador na tela
// de Contatos. Esta página só orienta — prometer um e-mail que nunca chega
// deixaria a pessoa esperando para sempre.
export default function ForgotPassword() {
  return (
    <AuthLayout
      icon={KeyRound}
      title="Esqueceu a senha?"
      subtitle="A redefinição é feita pelo administrador"
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Voltar para o login
        </Link>
      }
    >
      <div className="space-y-3 text-sm text-foreground">
        <p>
          Por segurança, este sistema não envia e-mails de redefinição de senha.
        </p>
        <p>
          Fale com o <span className="font-medium">administrador do sistema</span> (diretoria)
          e peça uma nova senha — ele define uma senha nova para o seu e-mail na
          tela de Contatos, na hora.
        </p>
        <p className="text-muted-foreground text-xs">
          Assim que receber a senha nova, volte ao login e entre normalmente.
        </p>
      </div>
    </AuthLayout>
  );
}
