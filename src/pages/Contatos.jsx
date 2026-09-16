import React, { useState, useEffect } from "react";
import { base44, supabase } from "@/api/base44Client";
import { Users, Search, Plus, Pencil, Trash2, Settings2, KeyRound, Activity } from "lucide-react";
import TimelineCliente from "../components/contatos/TimelineCliente";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";

// Tipos que trabalham na empresa => podem entrar no ERP.
const TIPOS_COM_LOGIN = ["Colaborador", "Diretor", "Contador", "Técnico"];

const TIPO_CORES = {
  "Cliente": "bg-primary/10 text-primary",
  "Fornecedor": "bg-success/10 text-success",
  "Despachante Aduaneiro": "bg-warning/10 text-warning",
  "Contador": "bg-purple-100 text-purple-700",
  "Transportador": "bg-blue-100 text-blue-700",
  "Técnico": "bg-orange-100 text-orange-700",
};

export default function Contatos() {
  const [contatos, setContatos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("Todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tiposDialogOpen, setTiposDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [timelineContato, setTimelineContato] = useState(null);
  const [form, setForm] = useState({});
  const [novoTipo, setNovoTipo] = useState("");
  const [senhaAcesso, setSenhaAcesso] = useState("");
  const [avisoAcesso, setAvisoAcesso] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [c, t] = await Promise.all([
      base44.entities.Contato.list("-created_date", 1000),
      base44.entities.TipoContato.list("nome", 100),
    ]);
    setContatos(c || []);
    // TODOS os tipos ficam no estado (senão desativado some do "Gerenciar Tipos"
    // e o Reativar fica inacessível); as telas filtram os ativos onde precisa.
    setTipos(t || []);
    setLoading(false);
  };
  const tiposAtivos = tipos.filter(x => x.ativa !== false);

  const openNew = () => {
    setEditing(null);
    setForm({ person_type: "PJ", status: "active", country: "Brasil", currency: "BRL", tipos: [] });
    setSenhaAcesso("");
    setAvisoAcesso(null);
    setDialogOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({ ...c, tipos: c.tipos || [] });
    setSenhaAcesso("");   // nunca pré-carrega senha
    setAvisoAcesso(null);
    setDialogOpen(true);
  };

  const toggleTipo = (nome) => {
    setForm(prev => {
      const atual = prev.tipos || [];
      return { ...prev, tipos: atual.includes(nome) ? atual.filter(t => t !== nome) : [...atual, nome] };
    });
  };

  const precisaLogin = (form.tipos || []).some((t) => TIPOS_COM_LOGIN.includes(t));

  const [savingContato, setSavingContato] = useState(false);
  const handleSave = async () => {
    if (savingContato) return;
    if (!form.name?.trim()) { alert("Informe o nome / razão social."); return; }
    if (!form.tipos?.length) { alert("Selecione pelo menos um tipo (Cliente, Fornecedor...)."); return; }
    if (senhaAcesso && senhaAcesso.length < 8) { alert("A senha de acesso precisa ter ao menos 8 caracteres."); return; }
    if (senhaAcesso && !form.email?.trim()) { alert("Informe o e-mail: é com ele que a pessoa faz login."); return; }

    setSavingContato(true);
    const data = { ...form };
    delete data.user_id; // quem define o vínculo é a função no servidor
    let salvo;
    try {
      salvo = editing
        ? await base44.entities.Contato.update(editing.id, data)
        : await base44.entities.Contato.create(data);
    } catch (err) {
      alert(`Não foi possível salvar o contato: ${err.message}`);
      setSavingContato(false);
      return;
    }

    // Login só é criado quando o master digita uma senha. A criação acontece numa
    // função no servidor (a chave-mestra não pode existir no navegador).
    if (senhaAcesso) {
      try {
        const { data: sessao } = await supabase.auth.getSession();
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/criar-acesso`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${sessao?.session?.access_token ?? ""}`,
            },
            body: JSON.stringify({
              contato_id: salvo?.id || editing?.id,
              email: form.email.trim(),
              password: senhaAcesso,
              nome: form.name.trim(),
            }),
          }
        );
        const r = await resp.json();
        if (!resp.ok) { alert(`Contato salvo, mas o acesso não foi criado: ${r.error}`); }
        else { setAvisoAcesso(r.criado ? "Acesso criado." : "Senha atualizada."); }
      } catch (e) {
        alert(`Contato salvo, mas o acesso não foi criado: ${e.message}`);
      }
    }
    setSenhaAcesso("");
    setDialogOpen(false);
    setSavingContato(false);
    loadData();
  };

  const handleDelete = async (c) => {
    if (!confirm(`Excluir o contato "${c.name}"?`)) return;
    try {
      await base44.entities.Contato.delete(c.id);
    } catch (err) {
      alert(`Não foi possível excluir o contato: ${err.message}`);
    }
    loadData();
  };

  const [addingTipo, setAddingTipo] = useState(false);
  const handleAddTipo = async () => {
    if (addingTipo) return;
    const nome = novoTipo.trim();
    if (!nome) return;
    if (tipos.some(t => t.nome.toLowerCase() === nome.toLowerCase())) { alert("Este tipo já existe."); return; }
    setAddingTipo(true);
    try { await base44.entities.TipoContato.create({ nome, ativa: true }); setNovoTipo(""); await loadData(); }
    finally { setAddingTipo(false); }
  };

  const handleToggleTipoAtivo = async (t) => {
    await base44.entities.TipoContato.update(t.id, { ativa: t.ativa === false });
    const all = await base44.entities.TipoContato.list("nome", 100);
    setTipos(all || []);
  };

  const f = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const [buscandoCep, setBuscandoCep] = useState(false);
  const buscarCep = async (cepRaw) => {
    const cep = (cepRaw || "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setForm(prev => ({
          ...prev,
          address: d.logradouro || prev.address,
          neighborhood: d.bairro || prev.neighborhood,
          city: d.localidade || prev.city,
          state: d.uf || prev.state,
          country: "Brasil",
        }));
      }
    } catch { /* serviço fora do ar — preenchimento manual segue funcionando */ }
    setBuscandoCep(false);
  };

  /* Pedido da Larissa (28/08/2026): digitou o CNPJ, puxa o cadastro inteiro.
     A fonte é a base pública da Receita Federal via BrasilAPI (sem chave, com CORS).
     Inscrição Estadual NÃO vem daí — consulta de IE exige convênio por estado —
     então o campo continua manual. Nunca sobrescreve o que já foi digitado. */
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const buscarCnpj = async (docRaw) => {
    const cnpj = (docRaw || "").replace(/\D/g, "");
    if (cnpj.length !== 14) return;
    setBuscandoCnpj(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (res.ok) {
        const d = await res.json();
        const fone = (d.ddd_telefone_1 || "").replace(/\D/g, "");
        setForm(prev => ({
          ...prev,
          person_type: "PJ",
          name: prev.name || d.razao_social || "",
          trade_name: prev.trade_name || d.nome_fantasia || "",
          email: prev.email || (d.email ? String(d.email).toLowerCase() : ""),
          phone: prev.phone || fone,
          zip_code: prev.zip_code || (d.cep ? String(d.cep).replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2") : ""),
          address: prev.address || d.logradouro || "",
          address_number: prev.address_number || (d.numero ? String(d.numero) : ""),
          neighborhood: prev.neighborhood || d.bairro || "",
          city: prev.city || d.municipio || "",
          state: prev.state || d.uf || "",
          country: "Brasil",
        }));
      }
    } catch { /* API fora do ar — preenchimento manual segue funcionando */ }
    setBuscandoCnpj(false);
  };

  /* IE pela SEFAZ (CNPJá, plano de 50 consultas/mês — 28/08/2026): por isso NÃO é
     automática — só gasta crédito quando alguém CLICA no botão. Preenche a IE do
     estado do contato (ou a primeira habilitada) e ajusta o "Contribuinte ICMS". */
  const [buscandoIe, setBuscandoIe] = useState(false);
  const [avisoIe, setAvisoIe] = useState("");
  const buscarIe = async () => {
    const cnpj = (form.document || "").replace(/\D/g, "");
    if (cnpj.length !== 14) { setAvisoIe("Preencha um CNPJ válido primeiro."); return; }
    setBuscandoIe(true); setAvisoIe("");
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/consultar-ie`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${sessao?.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ cnpj }),
      });
      const d = await r.json();
      if (!r.ok) { setAvisoIe(d.error || `Erro ${r.status}.`); }
      else {
        const regs = d.registrations || [];
        const doEstado = regs.find(x => x.state === form.state && x.enabled) || regs.find(x => x.enabled) || regs[0];
        if (!doEstado) {
          setForm(prev => ({ ...prev, contribuinte_icms: "nao_contribuinte" }));
          setAvisoIe("Nenhuma IE encontrada — marcado como Não contribuinte.");
        } else {
          setForm(prev => ({
            ...prev,
            state_registration: doEstado.number || prev.state_registration,
            contribuinte_icms: doEstado.enabled ? "contribuinte" : prev.contribuinte_icms,
            state: prev.state || doEstado.state,
          }));
          setAvisoIe(`IE ${doEstado.number} (${doEstado.state}) — ${doEstado.enabled ? "habilitada" : "NÃO habilitada"}${doEstado.status ? " · " + doEstado.status : ""}${regs.length > 1 ? ` · +${regs.length - 1} outra(s) UF` : ""}`);
        }
      }
    } catch { setAvisoIe("Serviço fora do ar — preencha manualmente."); }
    setBuscandoIe(false);
  };

  const filtered = contatos.filter(c => {
    const matchTipo = filtroTipo === "Todos" || (c.tipos || []).includes(filtroTipo);
    const q = search.toLowerCase();
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.trade_name?.toLowerCase().includes(q) || c.document?.includes(q) || c.city?.toLowerCase().includes(q);
    return matchTipo && matchSearch;
  });

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Contatos"
        description="Clientes, fornecedores, despachantes, contadores — todos num cadastro só"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTiposDialogOpen(true)}><Settings2 className="w-4 h-4 mr-1" /> Gerenciar Tipos</Button>
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo Contato</Button>
          </div>
        }
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {["Todos", ...tiposAtivos.map(t => t.nome)].map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${filtroTipo === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
            {t} {t !== "Todos" && <span className="opacity-70">({contatos.filter(c => (c.tipos || []).includes(t)).length})</span>}
          </button>
        ))}
        <div className="ml-auto max-w-xs relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar nome, CNPJ, cidade..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum contato" description="Cadastre o primeiro contato ou ajuste o filtro." />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome / Razão Social</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipos</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">CPF/CNPJ</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Cidade</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Telefone</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className={`border-b border-border last:border-0 hover:bg-muted/20 ${c.status === "inactive" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3"><span className="font-medium">{c.name}</span>{c.credito_aprovado && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success" title="Crédito pré-aprovado — pode comprar faturado">💳 Crédito OK</span>}{c.trade_name && c.trade_name !== c.name && <span className="block text-xs text-muted-foreground">{c.trade_name}</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(c.tipos || []).map(t => <span key={t} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${TIPO_CORES[t] || "bg-muted text-muted-foreground"}`}>{t}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell font-mono text-xs">{c.document || "—"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">{c.city || "—"}{c.country && c.country !== "Brasil" ? ` · ${c.country}` : ""}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs">{c.whatsapp || c.phone || "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setTimelineContato(c)} title="Atividade do cliente (pedidos, máquinas, WhatsApp, site)" className="p-1.5 hover:bg-primary/10 rounded-lg"><Activity className="w-4 h-4 text-primary" /></button>
                      <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-muted rounded-lg"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-4 h-4 text-destructive" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar Contato" : "Novo Contato"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="mb-2 block">Tipos (selecione um ou mais)</Label>
              <div className="flex gap-2 flex-wrap">
                {tiposAtivos.map(t => (
                  <button key={t.id} type="button" onClick={() => toggleTipo(t.nome)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${(form.tipos || []).includes(t.nome) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}>
                    {t.nome}
                  </button>
                ))}
              </div>
            </div>

            {precisaLogin && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <Label className="mb-0">Acesso ao ERP</Label>
                  {form.user_id && <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">já tem login</span>}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Este contato trabalha na empresa e pode entrar no ERP. O login é o <b>e-mail</b> preenchido abaixo.
                  {form.user_id ? " Digite uma senha nova só se quiser trocar a atual." : " Deixe a senha em branco se ainda não quiser dar acesso."}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">{form.user_id ? "Nova senha" : "Senha de acesso"}</Label>
                    <Input type="password" autoComplete="new-password" value={senhaAcesso}
                      onChange={(e) => setSenhaAcesso(e.target.value)} placeholder="mínimo 8 caracteres" />
                  </div>
                </div>
                <p className="text-[11px] text-warning">
                  Atenção: hoje quem entra no ERP enxerga todos os módulos (financeiro, DRE, importação).
                  O cofre de senhas é a única área com acesso restrito.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2"><Label>Nome / Razão Social *</Label><Input value={form.name || ""} onChange={f("name")} /></div>
              <div>
                <Label>Pessoa</Label>
                <Select value={form.person_type || "PJ"} onValueChange={v => setForm({ ...form, person_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="PJ">Jurídica</SelectItem><SelectItem value="PF">Física</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Nome Fantasia</Label><Input value={form.trade_name || ""} onChange={f("trade_name")} /></div>
              <div>
                <Label>{form.person_type === "PF" ? "CPF" : "CNPJ / Tax ID"} {buscandoCnpj && <span className="text-[10px] text-primary">buscando na Receita...</span>}</Label>
                <Input value={form.document || ""} onChange={f("document")} onBlur={e => form.person_type !== "PF" && buscarCnpj(e.target.value)} />
                {form.person_type !== "PF" && <p className="text-[10px] text-muted-foreground mt-1">Digite o CNPJ e saia do campo: razão social, fantasia, endereço e telefone preenchem sozinhos (base da Receita). A Inscrição Estadual continua manual.</p>}
              </div>
              <div>
                <Label>Contribuinte ICMS</Label>
                <Select value={form.contribuinte_icms || "contribuinte"} onValueChange={v => setForm({ ...form, contribuinte_icms: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contribuinte">Contribuinte ICMS</SelectItem>
                    <SelectItem value="isento">Isento de IE</SelectItem>
                    <SelectItem value="nao_contribuinte">Não contribuinte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Inscrição Estadual</Label>
                <div className="flex gap-1">
                  <Input value={form.state_registration || ""} onChange={f("state_registration")} placeholder={form.contribuinte_icms === "isento" ? "ISENTO" : ""} />
                  {form.person_type !== "PF" && (
                    <Button type="button" variant="outline" size="sm" className="shrink-0 h-9" disabled={buscandoIe} onClick={buscarIe} title="Consulta o cadastro de contribuintes (gasta 1 crédito da CNPJá — use quando precisar)">
                      {buscandoIe ? "..." : "Buscar IE"}
                    </Button>
                  )}
                </div>
                {avisoIe && <p className="text-[10px] mt-1 text-muted-foreground">{avisoIe}</p>}
              </div>
              <div><Label>Inscrição Municipal</Label><Input value={form.municipal_registration || ""} onChange={f("municipal_registration")} /></div>
              <div><Label>Pessoa de Contato</Label><Input value={form.contact_name || ""} onChange={f("contact_name")} placeholder="Ex: Cindy" /></div>
              <div><Label>E-mail</Label><Input value={form.email || ""} onChange={f("email")} /></div>
              <div><Label>Telefone</Label><Input value={form.phone || ""} onChange={f("phone")} /></div>
              <div><Label>WhatsApp</Label><Input value={form.whatsapp || ""} onChange={f("whatsapp")} /></div>
              <div>
                <Label>CEP {buscandoCep && <span className="text-[10px] text-primary">buscando...</span>}</Label>
                <Input value={form.zip_code || ""} onChange={e => { f("zip_code")(e); buscarCep(e.target.value); }} onBlur={e => buscarCep(e.target.value)} placeholder="00000-000" />
                <p className="text-[10px] text-muted-foreground mt-1">Endereço preenche sozinho ao digitar o CEP.</p>
              </div>
              <div className="sm:col-span-2"><Label>Endereço</Label><Input value={form.address || ""} onChange={f("address")} /></div>
              <div><Label>Número</Label><Input value={form.address_number || ""} onChange={f("address_number")} /></div>
              <div><Label>Complemento</Label><Input value={form.address_complement || ""} onChange={f("address_complement")} /></div>
              <div><Label>Bairro</Label><Input value={form.neighborhood || ""} onChange={f("neighborhood")} /></div>
              <div><Label>Cidade</Label><Input value={form.city || ""} onChange={f("city")} /></div>
              <div><Label>UF</Label><Input value={form.state || ""} onChange={f("state")} maxLength={2} /></div>
              <div><Label>País</Label><Input value={form.country || "Brasil"} onChange={f("country")} /></div>
              <div>
                <Label>Moeda padrão</Label>
                <Select value={form.currency || "BRL"} onValueChange={v => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["BRL", "USD", "EUR", "CNY"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Condições de Pagamento</Label><Input value={form.payment_terms || ""} onChange={f("payment_terms")} placeholder="Ex: À vista, 30/60 dias" /></div>
              <div>
                <Label>Situação</Label>
                <Select value={form.status || "active"} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Ativo</SelectItem><SelectItem value="inactive">Inativo</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={!!form.credito_aprovado}
                onChange={e => setForm(prev => ({ ...prev, credito_aprovado: e.target.checked }))} />
              <span className="text-sm">
                <b>Crédito pré-aprovado</b>
                <span className="block text-[11px] text-muted-foreground">Cliente já passou por análise de crédito — pode comprar faturado sem nova avaliação.</span>
              </span>
            </label>
            <div><Label>Observações</Label><textarea className="w-full min-h-[60px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none" value={form.notes || ""} onChange={f("notes")} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={savingContato}>{savingContato ? "Salvando..." : "Salvar"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={tiposDialogOpen} onOpenChange={(o) => { setTiposDialogOpen(o); if (!o) loadData(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tipos de Contato</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">Adicione ou desative tipos. Tipos desativados deixam de aparecer nos cadastros, mas os contatos existentes não são alterados.</p>
          <div className="flex gap-2 mt-2">
            <Input value={novoTipo} onChange={e => setNovoTipo(e.target.value)} placeholder="Novo tipo (ex: Parceiro)" onKeyDown={e => e.key === "Enter" && handleAddTipo()} />
            <Button onClick={handleAddTipo}><Plus className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-1 mt-3 max-h-[300px] overflow-y-auto">
            {[...tipos].map(t => (
              <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30">
                <span className={`text-sm font-medium ${t.ativa === false ? "line-through text-muted-foreground" : ""}`}>{t.nome}</span>
                <button onClick={() => handleToggleTipoAtivo(t)} className="text-xs text-primary hover:underline">{t.ativa === false ? "Reativar" : "Desativar"}</button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <TimelineCliente contato={timelineContato} open={!!timelineContato} onClose={() => setTimelineContato(null)} />
    </div>
  );
}
