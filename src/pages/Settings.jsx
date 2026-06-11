import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Save, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "../components/shared/PageHeader";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader title="Configurações" description="Configurações do sistema" />

      <div className="max-w-2xl space-y-6">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-heading font-semibold">Dados do Usuário</h3>
              <p className="text-xs text-muted-foreground">Informações da conta</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Nome</Label>
              <Input value={user?.full_name || ""} readOnly className="bg-muted" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={user?.email || ""} readOnly className="bg-muted" />
            </div>
            <div>
              <Label>Perfil</Label>
              <Input value={user?.role || ""} readOnly className="bg-muted" />
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-heading font-semibold mb-3">Sobre o Sistema</h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Sistema:</span> ImportERP</p>
            <p><span className="text-muted-foreground">Versão:</span> 1.0.0</p>
            <p className="text-muted-foreground text-xs mt-3">
              ERP sob medida para gestão de importação e revenda. Módulos: Cadastros, Importação, Precificação, Comercial, Financeiro e Relatórios.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}