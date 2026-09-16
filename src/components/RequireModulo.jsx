import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { usePermissoes } from "@/hooks/usePermissoes";

// Guarda de rota por módulo. O menu já esconde o que o usuário não vê, mas a
// URL digitada na mão precisa da mesma regra — e o RLS no banco fecha o resto.
export default function RequireModulo({ modulo, children }) {
  const { carregando, pode } = usePermissoes();

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!pode(modulo)) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <ShieldAlert className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="font-heading font-bold text-lg">Área restrita</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Seu perfil de acesso não inclui esta tela. Se você precisa dela para
          trabalhar, peça a liberação ao Mauricio.
        </p>
        <Link to="/" className="mt-4 text-sm text-primary hover:underline">← Voltar ao Dashboard</Link>
      </div>
    );
  }

  return children;
}
