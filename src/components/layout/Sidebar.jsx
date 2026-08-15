import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Package, Users, Truck, ShoppingCart, Factory,
  FileText, DollarSign, BarChart3, ChevronDown,
  ChevronRight, Settings, LogOut, Menu, X, Warehouse,
  Ship, Calculator, SlidersHorizontal, Store, Tag, Percent, Target, Container, KeyRound } from
"lucide-react";
import { base44 } from "@/api/base44Client";

// Módulo de cada item — precisa bater com o mapa de public.permissoes.
// Isto é só para a tela não oferecer o que o banco vai negar; a segurança de
// verdade é o RLS no Postgres.
const MODULO_DO_ITEM = {
  "/": null,                       // Dashboard: sempre visível
  "/products": "produtos",
  "/contatos": "contatos",
  "/sales-channels": "comercial",
  "/categorias": "produtos",
  "/purchase-orders": "comercial",
  "/sale-orders": "comercial",
  "/base-instalada": "comercial",
  "/precificacao": "comercial",
  "/stock": "estoque",
  "/import-simulator": "importacao",
  "/dre": "financeiro",
  "/breakeven": "financeiro",
  "/container": "importacao",
  "/config-tributaria": "config",
  "/financial": "financeiro",
  "/reports": "financeiro",
  "/acessos": "cofre",             // o cofre tem regra própria (cofre_membros)
};

const menuGroups = [
{
  label: "Principal",
  items: [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" }]

},
{
  label: "Cadastros",
  items: [
  { icon: Package, label: "Produtos", path: "/products" },
  
  { icon: Users, label: "Contatos", path: "/contatos" },
  { icon: Store, label: "Canais de Venda", path: "/sales-channels" },
  { icon: Tag, label: "Categorias", path: "/categorias" }]

},

{
  label: "Comercial",
  items: [
  { icon: FileText, label: "Pedidos de Compra", path: "/purchase-orders" },
  { icon: ShoppingCart, label: "Pedidos de Venda", path: "/sale-orders" },
  { icon: Factory, label: "Base Instalada", path: "/base-instalada" },
  { icon: Percent, label: "Precificação", path: "/precificacao" },
  { icon: Warehouse, label: "Estoque", path: "/stock" }]

},
{
  label: "Importação",
  items: [
  { icon: Ship, label: "Simulador", path: "/import-simulator" },
  { icon: Calculator, label: "DRE", path: "/dre" },
  { icon: Target, label: "Break-even", path: "/breakeven" },
  { icon: Container, label: "Container", path: "/container" },
  { icon: SlidersHorizontal, label: "Config. Tributária", path: "/config-tributaria" }]

},
{
  label: "Financeiro",
  items: [
  { icon: DollarSign, label: "Financeiro", path: "/financial" },
  { icon: BarChart3, label: "Relatórios", path: "/reports" }]

},
{
  label: "Empresa",
  items: [
  { icon: KeyRound, label: "Controle de Acessos", path: "/acessos" }]

}];


export default function Sidebar() {
  const location = useLocation();
  const [permitidos, setPermitidos] = React.useState(null); // null = ainda carregando
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import("@/api/base44Client");
        const [{ data: perm, error: errPerm }, { data: membro }] = await Promise.all([
          supabase.rpc("meus_modulos"),
          supabase.from("cofre_membros").select("nivel"),
        ]);
        // Se a consulta de permissões falhar, NÃO escondemos o menu: o RLS do
        // Postgres é quem protege de verdade. Esconder tudo já trancou o master
        // fora do ERP uma vez (PostgREST sem a função no cache de schema).
        if (errPerm) { setPermitidos("todos"); return; }
        const mods = new Set((perm || []).map((r) => r.modulo));
        if ((membro || []).length > 0) mods.add("cofre");
        setPermitidos(mods);
      } catch {
        setPermitidos("todos");
      }
    })();
  }, []);

  const podeVerItem = (path) => {
    const mod = MODULO_DO_ITEM[path];
    if (!mod) return true;                       // Dashboard
    if (permitidos === null) return true;        // carregando: não pisca o menu
    if (permitidos === "todos") return true;     // falha na consulta: banco protege
    return permitidos.has(mod);
  };
  const [expandedGroups, setExpandedGroups] = useState(
    menuGroups.reduce((acc, g) => ({ ...acc, [g.label]: true }), {})
  );

  const toggleGroup = (label) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleLogout = () => {
    base44.auth.logout("/login");
  };

  const navContent =
  <div className="flex flex-col h-full">
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center bg-white">
          <img src="/logo.png" alt="Robooster" className="w-full h-full object-contain" />
        </div>
        {!collapsed &&
      <div>
            <h1 className="font-heading font-bold text-sm text-sidebar-foreground">Gestor Robooster</h1>
            <p className="text-[10px] text-sidebar-foreground/50">Gestão de Negócio</p>
          </div>
      }
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {menuGroups.filter((g) => g.items.some((i) => podeVerItem(i.path))).map((group) =>
      <div key={group.label}>
            {!collapsed &&
        <button
          onClick={() => toggleGroup(group.label)}
          className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors">
          
                {group.label}
                {expandedGroups[group.label] ?
          <ChevronDown className="w-3 h-3" /> :

          <ChevronRight className="w-3 h-3" />
          }
              </button>
        }
            {(collapsed || expandedGroups[group.label]) &&
        <div className="space-y-0.5">
                {group.items.filter((item) => podeVerItem(item.path)).map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150 ${
                isActive ?
                "bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm" :
                "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"}`
                }
                title={collapsed ? item.label : undefined}>
                
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>);

          })}
              </div>
        }
          </div>
      )}
      </nav>

      <div className="p-2 border-t border-sidebar-border space-y-0.5">
        <Link
        to="/settings"
        className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors">
        
          <Settings className="w-4 h-4" />
          {!collapsed && <span>Configurações</span>}
        </Link>
        <button
        onClick={handleLogout}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-destructive/20 hover:text-destructive transition-colors">
        
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </div>;


  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-card shadow-md border border-border">
        
        <Menu className="w-5 h-5" />
      </button>

      {mobileOpen &&
      <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div
          className="w-64 h-full bg-sidebar"
          onClick={(e) => e.stopPropagation()}>
          
            <button
            onClick={() => setMobileOpen(false)}
            className="absolute top-3 right-3 p-1 text-sidebar-foreground/50 hover:text-sidebar-foreground">
            
              <X className="w-5 h-5" />
            </button>
            {navContent}
          </div>
        </div>
      }

      <aside
        className={`hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 ${
        collapsed ? "w-16" : "w-60"}`
        }>
        
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-7 z-10 w-6 h-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:bg-accent transition-colors">
          
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <Menu className="w-3 h-3" />}
        </button>
        {navContent}
      </aside>
    </>);

}