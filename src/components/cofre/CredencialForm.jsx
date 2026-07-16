import React, { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from
"@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

// Formulário de credencial (criar / editar / duplicar).
// Só aparece para quem é master — e, mesmo que aparecesse, o banco recusa a
// escrita de quem não é (trigger INSTEAD OF verifica eh_master()).

const CAMPOS = [
{ key: "service_name", label: "Serviço", req: true },
{ key: "company", label: "Empresa", placeholder: "Robooster, Router, Saber, MRS, Pessoal" },
{ key: "category", label: "Categoria" },
{ key: "access_link", label: "Link de acesso", type: "url" },
{ key: "username", label: "Usuário" },
{ key: "email", label: "E-mail" },
{ key: "password", label: "Senha", secreto: true },
{ key: "api_key", label: "Chave de API", secreto: true },
{ key: "pin", label: "PIN", secreto: true },
{ key: "security_code", label: "Código de segurança", secreto: true },
{ key: "two_factor_secret", label: "2FA (segredo)", secreto: true },
{ key: "recovery_email", label: "E-mail de recuperação" },
{ key: "recovery_phone", label: "Telefone de recuperação" },
{ key: "expiry_date", label: "Expira/renova em", type: "date" }];


export default function CredencialForm({ aberto, credencial, modo, onFechar, onSalvar }) {
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (!aberto) return;
    const base = credencial ? { ...credencial } : { is_master: true };
    if (modo === "duplicar") {
      delete base.id;
      delete base.legacy_id;
      base.service_name = `${base.service_name || ""} (cópia)`;
    }
    setForm(base);
    setErro(null);
  }, [aberto, credencial, modo]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (!form.service_name?.trim()) {
      setErro("Dê um nome ao serviço.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(form, modo);
      onFechar();
    } catch (e) {
      setErro(e?.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const titulo =
  modo === "editar" ? "Editar credencial" :
  modo === "duplicar" ? "Duplicar credencial" : "Nova credencial";

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Campos secretos são gravados criptografados no banco.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          {CAMPOS.map((c) =>
          <div key={c.key} className={c.key === "service_name" ? "sm:col-span-2" : ""}>
              <Label htmlFor={c.key} className="text-xs text-slate-600">
                {c.label}{c.req && <span className="text-orange-600"> *</span>}
              </Label>
              <Input
              id={c.key}
              type={c.type || (c.secreto ? "password" : "text")}
              autoComplete="off"
              placeholder={c.placeholder}
              value={form[c.key] ?? ""}
              onChange={(e) => set(c.key, e.target.value)} />
            </div>
          )}

          <div className="sm:col-span-2">
            <Label htmlFor="access_info" className="text-xs text-slate-600">Observações</Label>
            <Textarea
              id="access_info" rows={4}
              value={form.access_info ?? ""}
              onChange={(e) => set("access_info", e.target.value)} />
          </div>

          <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3 bg-slate-50">
            <div>
              <div className="text-sm font-medium">Somente master</div>
              <div className="text-xs text-slate-500">
                {form.is_master ?
                "Só você e a Roberta enxergam esta credencial." :
                "Liberada: os colaboradores do cofre também enxergam."}
              </div>
            </div>
            <Switch
              checked={!!form.is_master}
              onCheckedChange={(v) => set("is_master", v)} />
          </div>
        </div>

        {erro &&
        <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-sm text-amber-800">
            {erro}
          </div>
        }

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);

}
