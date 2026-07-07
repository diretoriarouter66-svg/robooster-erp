import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Package, Users, Truck, ShoppingCart,
  FileText, DollarSign, BarChart3, ChevronDown,
  ChevronRight, Settings, LogOut, Menu, X, Warehouse,
  Ship, Calculator, SlidersHorizontal } from
"lucide-react";
import { base44 } from "@/api/base44Client";

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
  { icon: Truck, label: "Fornecedores", path: "/suppliers" },
  { icon: Users, label: "Clientes", path: "/customers" }]

},

{
  label: "Comercial",
  items: [
  { icon: FileText, label: "Pedidos de Compra", path: "/purchase-orders" },
  { icon: ShoppingCart, label: "Pedidos de Venda", path: "/sale-orders" },
  { icon: Warehouse, label: "Estoque", path: "/stock" }]

},
{
  label: "Importação",
  items: [
  { icon: Ship, label: "Simulador", path: "/import-simulator" },
  { icon: Calculator, label: "DRE", path: "/dre" },
  { icon: SlidersHorizontal, label: "Config. Tributária", path: "/config-tributaria" }]

},
{
  label: "Financeiro",
  items: [
  { icon: DollarSign, label: "Financeiro", path: "/financial" },
  { icon: BarChart3, label: "Relatórios", path: "/reports" }]

}];


export default function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
          <img src="https://media.base44.com/images/public/6a2b4465744531a689b598cb/1e5673928_RoboosterTurbo2-Editado.png" alt="Robooster" className="w-full h-full object-contain" />
        </div>
        {!collapsed &&
      <div>
            <h1 className="font-heading font-bold text-sm text-sidebar-foreground">Gestor Robooster</h1>
            <p className="text-[10px] text-sidebar-foreground/50">Gestão de Negócio</p>
          </div>
      }
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {menuGroups.map((group) =>
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
                {group.items.map((item) => {
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