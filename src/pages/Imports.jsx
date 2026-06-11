import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Search, Ship, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";

export default function Imports() {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const data = await base44.entities.ImportProcess.list("-created_date", 200);
    setImports(data);
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este processo de importação?")) return;
    await base44.entities.ImportProcess.delete(id);
    loadData();
  };

  const formatCurrency = (val) => {
    if (!val && val !== 0) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const filtered = imports.filter(i =>
    !search || i.reference?.toLowerCase().includes(search.toLowerCase()) ||
    i.supplier_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Processos de Importação"
        description={`${imports.length} processos cadastrados`}
        actions={
          <Link to="/imports/new">
            <Button><Plus className="w-4 h-4 mr-1" /> Novo Processo</Button>
          </Link>
        }
      />

      {imports.length === 0 ? (
        <EmptyState icon={Ship} title="Nenhum processo" description="Registre seus processos de importação com cálculo automático de impostos." actionLabel="Novo Processo" onAction={() => window.location.href = "/imports/new"} />
      ) : (
        <>
          <div className="mb-4 max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por referência ou fornecedor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Referência</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Fornecedor</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Incoterm</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">FOB</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Custo Landed</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((imp) => (
                    <tr key={imp.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{imp.reference}</p>
                        <p className="text-xs text-muted-foreground">{imp.di_number ? `DI: ${imp.di_number}` : ""}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">{imp.supplier_name || "—"}</td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell font-mono text-xs">{imp.incoterm}</td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">{formatCurrency(imp.total_fob_brl)}</td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell font-medium">{formatCurrency(imp.total_landed_cost)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={imp.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link to={`/imports/${imp.id}`} className="p-1.5 hover:bg-muted rounded-lg">
                            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                          </Link>
                          <button onClick={() => handleDelete(imp.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg">
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}