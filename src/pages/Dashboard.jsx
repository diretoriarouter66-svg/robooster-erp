import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Package, Users, ShoppingCart, DollarSign, AlertTriangle, TrendingUp, Truck } from "lucide-react";
import StatCard from "../components/shared/StatCard";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    const [products, customers, suppliers, orders, financial] = await Promise.all([
      base44.entities.Product.list("-created_date", 200),
      base44.entities.Customer.list("-created_date", 200),
      base44.entities.Supplier.list("-created_date", 200),
      base44.entities.SaleOrder.list("-created_date", 10),
      base44.entities.FinancialEntry.list("-created_date", 200),
    ]);

    const activeProducts = products.filter(p => p.status === "active");
    const lowStockProducts = activeProducts.filter(p => p.stock_quantity <= p.min_stock && p.min_stock > 0);

    const pendingReceivables = financial
      .filter(f => f.type === "receivable" && f.status === "pending")
      .reduce((sum, f) => sum + (f.amount || 0), 0);

    const pendingPayables = financial
      .filter(f => f.type === "payable" && f.status === "pending")
      .reduce((sum, f) => sum + (f.amount || 0), 0);

    setStats({
      totalProducts: activeProducts.length,
      totalCustomers: customers.length,
      totalSuppliers: suppliers.length,
      pendingReceivables,
      pendingPayables,
      lowStockCount: lowStockProducts.length,
      totalOrders: orders.length,
    });
    setRecentOrders(orders.slice(0, 5));
    setLowStock(lowStockProducts.slice(0, 5));
    setLoading(false);
  };

  const formatCurrency = (val) => {
    if (!val && val !== 0) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Visão geral do seu negócio" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Package} label="Produtos Ativos" value={stats?.totalProducts || 0} color="primary" />
        <StatCard icon={Users} label="Clientes" value={stats?.totalCustomers || 0} color="primary" />
        <StatCard icon={Truck} label="Fornecedores" value={stats?.totalSuppliers || 0} color="primary" />
        <StatCard icon={ShoppingCart} label="Pedidos Recentes" value={stats?.totalOrders || 0} color="success" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-2 gap-3 mb-6">
        <StatCard icon={TrendingUp} label="A Receber" value={formatCurrency(stats?.pendingReceivables)} color="success" />
        <StatCard icon={DollarSign} label="A Pagar" value={formatCurrency(stats?.pendingPayables)} color="destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-semibold text-sm">Últimos Pedidos</h3>
            <Link to="/sale-orders" className="text-xs text-primary hover:underline">Ver todos</Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum pedido ainda</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="text-sm font-medium">{order.order_number || `#${order.id.slice(0,6)}`}</p>
                    <p className="text-xs text-muted-foreground">{order.customer_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatCurrency(order.total)}</p>
                    <StatusBadge status={order.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {lowStock.length > 0 && (
          <div className="bg-card rounded-xl border border-destructive/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <h3 className="font-heading font-semibold text-sm">Alerta de Estoque Baixo</h3>
            </div>
            <div className="space-y-2">
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-destructive/5">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-destructive">{p.stock_quantity}</p>
                    <p className="text-[10px] text-muted-foreground">mín: {p.min_stock}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}