import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Users, Search, Plus, Pencil, Trash2, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";

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
  const [form, setForm] = useState({});
  const [novoTipo, setNovoTipo] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [c, t] = await Promise.all([
      base44.entities.Contato.list("-created_date", 500),
      base44.entities.TipoContato.list("nome", 100),
    ]);
    setContatos(c || []);
    setTipos((t || []).filter(x => x.ativa !== false));
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ person_type: "PJ", status: "active", country: "Brasil", currency: "BRL", tipos: [] });
    setDialogOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({ ...c, tipos: c.tipos || [] });
    setDialogOpen(true);
  };

  const toggleTipo = (nome) => {
    setForm(prev => {
      const atual = prev.tipos || [];
      return { ...prev, tipos: atual.includes(nome) ? atual.filter(t => t !== nome) : [...atual, nome] };
    });
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { alert("Informe o nome / razão social."); return; }
    if (!form.tipos?.length) { alert("Selecione pelo menos um tipo (Cliente, Fornecedor...)."); return; }
    const data = { ...form };
    if (editing) await base44.entities.Contato.update(editing.id, data);
    else await base44.entities.Contato.create(data);
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (c) => {
    if (!confirm(`Excluir o contato "${c.name}"?`)) return;
    await base44.entities.Contato.delete(c.id);
    loadData();
  };

  const handleAddTipo = async () => {
    const nome = novoTipo.trim();
    if (!nome) return;
    if (tipos.some(t => t.nome.toLowerCase() === nome.toLowerCase())) { alert("Este tipo já existe."); return; }
    await base44.entities.TipoContato.create({ nome, ativa: true });
    setNovoTipo("");
    loadData();
  };

  const handleToggleTipoAtivo = async (t) => {
    await base44.entities.TipoContato.update(t.id, { ativa: !t.ativa });
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
        {["Todos", ...tipos.map(t => t.nome)].map(t => (
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
                    <td className="px-4 py-3"><span className="font-medium">{c.name}</span>{c.trade_name && c.trade_name !== c.name && <span className="block text-xs text-muted-foreground">{c.trade_name}</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(c.tipos || []).map(t => <span key={t} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${TIPO_CORES[t] || "bg-muted text-muted-foreground"}`}>{t}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell font-mono text-xs">{c.document || "—"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">{c.city || "—"}{c.country && c.country !== "Brasil" ? ` · ${c.country}` : ""}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs">{c.whatsapp || c.phone || "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
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
                {tipos.map(t => (
                  <button key={t.id} type="button" onClick={() => toggleTipo(t.nome)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${(form.tipos || []).includes(t.nome) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}>
                    {t.nome}
                  </button>
                ))}
              </div>
            </div>

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
              <div><Label>{form.person_type === "PF" ? "CPF" : "CNPJ / Tax ID"}</Label><Input value={form.document || ""} onChange={f("document")} /></div>
              <div><Label>Inscrição Estadual</Label><Input value={form.state_registration || ""} onChange={f("state_registration")} /></div>
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
            <div><Label>Observações</Label><textarea className="w-full min-h-[60px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none" value={form.notes || ""} onChange={f("notes")} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
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
    </div>
  );
}
