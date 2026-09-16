import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  KeyRound, Search, Eye, EyeOff, Copy, Check, ExternalLink,
  Lock, Unlock, ShieldAlert, Plus, Pencil, Trash2, Files, Building2 } from
"lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CredencialForm from "@/components/cofre/CredencialForm";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from
"@/components/ui/alert-dialog";

// Cofre de acessos — substitui o app "Controle de Acessos" do Base44.
//
// Segurança: quem vê o quê é decidido pelo RLS no Postgres, NÃO por esta tela.
// Um colaborador simplesmente não recebe as credenciais master na resposta.
// O `nivelMaster` daqui serve só para ajustar a interface (mostrar o cadeado,
// permitir editar), nunca como controle de acesso.

const CAMPOS_SECRETOS = [
{ key: "password", label: "Senha" },
{ key: "api_key", label: "Chave de API" },
{ key: "pin", label: "PIN" },
{ key: "security_code", label: "Código de segurança" },
{ key: "two_factor_secret", label: "2FA" }];


const CAMPOS_ABERTOS = [
{ key: "username", label: "Usuário" },
{ key: "email", label: "E-mail" },
{ key: "recovery_email", label: "E-mail de recuperação" },
{ key: "recovery_phone", label: "Telefone de recuperação" }];


function CampoCopiavel({ label, valor, secreto = false }) {
  const [visivel, setVisivel] = useState(false);
  const [copiado, setCopiado] = useState(false);
  if (!valor) return null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* clipboard indisponível (http/permissão) — ignora silenciosamente */
    }
  };

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 w-44 shrink-0">{label}</span>
      <span className="flex-1 text-sm font-mono break-all">
        {secreto && !visivel ? "••••••••••••" : valor}
      </span>
      {secreto &&
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setVisivel((v) => !v)}
      aria-label={visivel ? "Ocultar" : "Mostrar"}>
          {visivel ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
      }
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copiar} aria-label="Copiar">
        {copiado ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>);

}

export default function Acessos() {
  const [credenciais, setCredenciais] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState("");
  const [empresa, setEmpresa] = useState("todas");
  const [aberta, setAberta] = useState(null);
  const [nivelMaster, setNivelMaster] = useState(false);
  const [form, setForm] = useState({ aberto: false, credencial: null, modo: "novo" });
  const [excluindo, setExcluindo] = useState(null);
  const [empresasCad, setEmpresasCad] = useState([]);   // cadastro (cofre_empresas)
  const [empDialogOpen, setEmpDialogOpen] = useState(false);
  const [novaEmpresa, setNovaEmpresa] = useState("");
  const [renomeando, setRenomeando] = useState(null);   // { id, nome, novoNome }
  const [empBusy, setEmpBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const lista = await base44.entities.Credential.list("service_name");
        setCredenciais(lista || []);
        base44.entities.CofreEmpresa.list("nome", 100).then((e) => setEmpresasCad(e || [])).catch(() => {});
        // Nível do usuário: se esta consulta falhar, a tela some com os botões de
        // master — então o erro precisa aparecer, não ser engolido.
        try {
          const membros = await base44.entities.CofreMembro.list("created_date");
          setNivelMaster((membros || []).some((m) => m.nivel === "master"));
        } catch (e) {
          setErro("Não consegui confirmar seu nível de acesso: " + (e?.message || "erro"));
        }
      } catch (e) {
        setErro(e?.message || "Não foi possível carregar o cofre.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  // Filtros: nascem do CADASTRO de empresas; valores legados que ainda não
  // foram para o cadastro continuam aparecendo (para nenhuma credencial sumir).
  const empresas = useMemo(() => {
    const doCadastro = empresasCad.filter((e) => e.ativa !== false).map((e) => e.nome);
    const legadas = Array.from(new Set(credenciais.map((c) => c.company).filter(Boolean)))
      .filter((n) => !empresasCad.some((e) => e.nome === n));
    return ["todas", ...[...doCadastro, ...legadas].sort((a, b) => a.localeCompare(b))];
  }, [credenciais, empresasCad]);

  const categorias = useMemo(
    () => Array.from(new Set(credenciais.map((c) => c.category).filter(Boolean))).sort(),
    [credenciais]
  );

  const usosPorEmpresa = useMemo(() => {
    const m = {};
    credenciais.forEach((c) => { if (c.company) m[c.company] = (m[c.company] || 0) + 1; });
    return m;
  }, [credenciais]);

  const recarregarEmpresas = async () => {
    const e = await base44.entities.CofreEmpresa.list("nome", 100).catch(() => []);
    setEmpresasCad(e || []);
  };

  const addEmpresa = async () => {
    const nome = novaEmpresa.trim();
    if (!nome) return;
    if (empresasCad.some((e) => e.nome.toLowerCase() === nome.toLowerCase())) { alert("Esta empresa já está cadastrada."); return; }
    setEmpBusy(true);
    try { await base44.entities.CofreEmpresa.create({ nome, ativa: true }); setNovaEmpresa(""); await recarregarEmpresas(); }
    catch (e) { alert(`Não foi possível cadastrar: ${e.message}`); }
    setEmpBusy(false);
  };

  // Renomear em CASCATA: muda o cadastro e TODAS as credenciais que usam o nome
  // antigo — é assim que "MRS" e "MRS CORPORATION S A" viram uma coisa só.
  const renomearEmpresa = async () => {
    const { id, nome, novoNome } = renomeando || {};
    const novo = (novoNome || "").trim();
    if (!novo || novo === nome) { setRenomeando(null); return; }
    const afetadas = credenciais.filter((c) => c.company === nome);
    if (!confirm(`Renomear "${nome}" para "${novo}"?\n${afetadas.length} credencial(is) serão atualizadas junto.${empresasCad.some(e => e.nome === novo) ? "\n\nJá existe uma empresa com o nome novo — as duas serão FUNDIDAS." : ""}`)) return;
    setEmpBusy(true);
    try {
      for (const c of afetadas) await base44.entities.Credential.update(c.id, { company: novo });
      const jaExiste = empresasCad.find((e) => e.nome === novo);
      if (jaExiste) await base44.entities.CofreEmpresa.delete(id);
      else await base44.entities.CofreEmpresa.update(id, { nome: novo });
      setCredenciais((cs) => cs.map((c) => c.company === nome ? { ...c, company: novo } : c));
      if (empresa === nome) setEmpresa(novo);
      await recarregarEmpresas();
      setRenomeando(null);
    } catch (e) { alert(`Não foi possível renomear: ${e.message}`); }
    setEmpBusy(false);
  };

  const excluirEmpresa = async (emp) => {
    const usos = usosPorEmpresa[emp.nome] || 0;
    if (usos > 0) { alert(`${usos} credencial(is) usam "${emp.nome}". Renomeie (fundindo em outra) em vez de excluir.`); return; }
    if (!confirm(`Excluir a empresa "${emp.nome}" do cadastro?`)) return;
    await base44.entities.CofreEmpresa.delete(emp.id).catch((e) => alert(`Não foi possível excluir: ${e.message}`));
    if (empresa === emp.nome) setEmpresa("todas");
    await recarregarEmpresas();
  };

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return credenciais.filter((c) => {
      if (empresa !== "todas" && c.company !== empresa) return false;
      if (!termo) return true;
      return [c.service_name, c.category, c.company, c.username, c.email].
      some((v) => (v || "").toLowerCase().includes(termo));
    });
  }, [credenciais, busca, empresa]);

  const alternarLiberacao = async (cred) => {
    const novo = !cred.is_master;
    const antes = credenciais;
    setCredenciais((cs) => cs.map((c) => c.id === cred.id ? { ...c, is_master: novo } : c));
    try {
      await base44.entities.Credential.update(cred.id, { is_master: novo });
    } catch (e) {
      setCredenciais(antes); // o banco recusou (não é master) — desfaz
      setErro("Não foi possível alterar. Só o acesso master pode liberar credenciais.");
    }
  };

  const salvar = async (dados, modo) => {
    const limpo = { ...dados };
    delete limpo.created_date; delete limpo.updated_date; delete limpo.created_by;
    if (modo === "editar") {
      const id = limpo.id; delete limpo.id;
      const atualizado = await base44.entities.Credential.update(id, limpo);
      setCredenciais((cs) => cs.map((c) => c.id === id ? { ...c, ...atualizado } : c));
    } else {
      delete limpo.id;
      const criado = await base44.entities.Credential.create(limpo);
      setCredenciais((cs) => [...cs, criado].sort((a, b) =>
      (a.service_name || "").localeCompare(b.service_name || "")));
    }
  };

  const excluir = async () => {
    const alvo = excluindo;
    setExcluindo(null);
    const antes = credenciais;
    setCredenciais((cs) => cs.filter((c) => c.id !== alvo.id));
    try {
      await base44.entities.Credential.delete(alvo.id);
    } catch (e) {
      setCredenciais(antes);
      setErro("Não foi possível excluir. Só o acesso master pode.");
    }
  };

  if (carregando) {
    return <div className="p-8 text-slate-500">Abrindo o cofre…</div>;
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-orange-100">
          <KeyRound className="h-5 w-5 text-orange-700" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">Controle de Acessos</h1>
          <p className="text-sm text-slate-500">
            {credenciais.length} {credenciais.length === 1 ? "credencial disponível" : "credenciais disponíveis"} para você
            {nivelMaster && " · acesso master"}
          </p>
        </div>
        {nivelMaster &&
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEmpDialogOpen(true)} className="gap-2">
            <Building2 className="h-4 w-4" />Empresas
          </Button>
          <Button onClick={() => setForm({ aberto: true, credencial: null, modo: "novo" })} className="gap-2">
            <Plus className="h-4 w-4" />Nova credencial
          </Button>
        </div>
        }
      </div>

      {erro &&
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{erro}</span>
        </div>
      }

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input className="pl-9" placeholder="Buscar por serviço, usuário, e-mail…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {empresas.map((emp) =>
        <Button key={emp} size="sm" variant={empresa === emp ? "default" : "outline"}
        onClick={() => setEmpresa(emp)} className="capitalize">
            {emp}
          </Button>
        )}
      </div>

      {filtradas.length === 0 &&
      <Card><CardContent className="p-8 text-center text-slate-500">
          Nenhuma credencial encontrada.
        </CardContent></Card>
      }

      <div className="grid gap-2">
        {filtradas.map((c) =>
        <Card key={c.id} className="overflow-hidden">
            <button
            onClick={() => setAberta(aberta === c.id ? null : c.id)}
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900 truncate">{c.service_name}</span>
                  {c.is_master ?
                <Badge variant="outline" className="gap-1 text-orange-700 border-orange-200 bg-orange-50">
                      <Lock className="h-3 w-3" />master
                    </Badge> :

                <Badge variant="outline" className="gap-1 text-green-700 border-green-200 bg-green-50">
                      <Unlock className="h-3 w-3" />liberada
                    </Badge>
                }
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {[c.company, c.category].filter(Boolean).join(" · ")}
                  {c.username ? ` — ${c.username}` : ""}
                </div>
              </div>
            </button>

            {aberta === c.id &&
          <CardContent className="pt-0 pb-4 px-4 border-t bg-slate-50/60">
                <div className="pt-3">
                  {CAMPOS_ABERTOS.map((f) =>
              <CampoCopiavel key={f.key} label={f.label} valor={c[f.key]} />
              )}
                  {CAMPOS_SECRETOS.map((f) =>
              <CampoCopiavel key={f.key} label={f.label} valor={c[f.key]} secreto />
              )}
                  {c.access_link &&
              <div className="flex items-center gap-2 py-1.5">
                      <span className="text-xs text-slate-500 w-44 shrink-0">Link de acesso</span>
                      <a href={c.access_link} target="_blank" rel="noopener noreferrer"
                className="text-sm text-orange-700 hover:underline flex items-center gap-1 break-all">
                        {c.access_link}<ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </div>
              }
                  {c.expiry_date &&
              <div className="flex items-center gap-2 py-1.5">
                      <span className="text-xs text-slate-500 w-44 shrink-0">Expira/renova</span>
                      <span className="text-sm">{c.expiry_date}</span>
                    </div>
              }
                  {c.access_info &&
              <div className="mt-3 pt-3 border-t">
                      <span className="text-xs text-slate-500">Observações</span>
                      <pre className="mt-1 text-sm whitespace-pre-wrap font-sans text-slate-700">{c.access_info}</pre>
                    </div>
              }
                  {nivelMaster &&
              <div className="mt-4 pt-3 border-t flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-xs text-slate-500">
                        {c.is_master ?
                  "Só você e a Roberta veem esta credencial." :
                  "Liberada: os colaboradores do cofre veem esta credencial."}
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => alternarLiberacao(c)}>
                          {c.is_master ? "Liberar p/ colaboradores" : "Voltar para master"}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => setForm({ aberto: true, credencial: c, modo: "editar" })}>
                          <Pencil className="h-3.5 w-3.5" />Editar
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => setForm({ aberto: true, credencial: c, modo: "duplicar" })}>
                          <Files className="h-3.5 w-3.5" />Duplicar
                        </Button>
                        <Button size="sm" variant="outline"
                  className="gap-1.5 text-red-700 hover:text-red-800 hover:bg-red-50"
                  onClick={() => setExcluindo(c)}>
                          <Trash2 className="h-3.5 w-3.5" />Excluir
                        </Button>
                      </div>
                    </div>
              }
                </div>
              </CardContent>
          }
          </Card>
        )}
      </div>

      <CredencialForm
        aberto={form.aberto}
        credencial={form.credencial}
        modo={form.modo}
        onFechar={() => setForm({ aberto: false, credencial: null, modo: "novo" })}
        onSalvar={salvar}
        empresas={empresasCad.filter((e) => e.ativa !== false).map((e) => e.nome)}
        categorias={categorias} />

      {/* Cadastro de empresas do cofre */}
      <Dialog open={empDialogOpen} onOpenChange={setEmpDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Empresas do cofre</DialogTitle></DialogHeader>
          <p className="text-xs text-slate-500 -mt-1">
            Estas são as opções do campo "Empresa" e os filtros do topo. Renomear
            atualiza TODAS as credenciais junto — renomeie para um nome já existente
            para fundir duplicatas (ex.: "MRS CORPORATION S A" → "MRS").
          </p>
          <div className="flex gap-2 mt-2">
            <Input value={novaEmpresa} onChange={(e) => setNovaEmpresa(e.target.value)}
              placeholder="Nova empresa (ex: Panamá)" onKeyDown={(e) => e.key === "Enter" && !empBusy && addEmpresa()} />
            <Button onClick={addEmpresa} disabled={empBusy}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-1 mt-3 max-h-[320px] overflow-y-auto">
            {empresasCad.map((emp) => (
              <div key={emp.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50">
                {renomeando?.id === emp.id ? (
                  <>
                    <Input className="h-8 text-sm" value={renomeando.novoNome} autoFocus
                      onChange={(e) => setRenomeando((r) => ({ ...r, novoNome: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && !empBusy && renomearEmpresa()} />
                    <Button size="sm" onClick={renomearEmpresa} disabled={empBusy}>OK</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRenomeando(null)}>✕</Button>
                  </>
                ) : (
                  <>
                    <span className={`text-sm font-medium ${emp.ativa === false ? "line-through text-slate-400" : ""}`}>
                      {emp.nome} <span className="text-[10px] text-slate-400">({usosPorEmpresa[emp.nome] || 0})</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setRenomeando({ id: emp.id, nome: emp.nome, novoNome: emp.nome })}
                        className="text-xs text-orange-700 hover:underline px-1">renomear</button>
                      <button onClick={async () => { await base44.entities.CofreEmpresa.update(emp.id, { ativa: emp.ativa === false }); if (emp.ativa !== false && empresa === emp.nome) setEmpresa("todas"); recarregarEmpresas(); }}
                        className="text-xs text-slate-500 hover:underline px-1">{emp.ativa === false ? "reativar" : "desativar"}</button>
                      <button onClick={() => excluirEmpresa(emp)} className="text-xs text-red-600 hover:underline px-1">excluir</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{excluindo?.service_name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A credencial sai do cofre para todo mundo. Esta ação não tem desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={excluir}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>);

}
