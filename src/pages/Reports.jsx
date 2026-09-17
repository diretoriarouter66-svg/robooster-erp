import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { BarChart3, TrendingUp, Package, DollarSign } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import PageHeader from "../components/shared/PageHeader";
import StatCard from "../components/shared/StatCard";

const COLORS = ["hsl(221,83%,53%)", "hsl(160,60%,45%)", "hsl(30,80%,55%)", "hsl(280,65%,60%)", "hsl(340,75%,55%)"];

// Mesma régua do pedido de venda: só conta como venda o que foi faturado.
const STATUS_VENDA = ["invoiced", "shipped", "delivered"];

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [data, setData] = useState({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setErro(null);
    try {
      const [products, orders, financial] = await Promise.all([
        base44.entities.Product.list("-created_date", 1000),
        base44.entities.SaleOrder.list("-created_date", 1000),
        base44.entities.FinancialEntry.list("-created_date", 1000),
      ]);

      const vendas = orders.filter(o => STATUS_VENDA.includes(o.status));

      const totalSales = vendas.reduce((s, o) => s + (o.total || 0), 0);
      const totalInventoryValue = products.reduce((s, p) => s + ((p.stock_quantity || 0) * (p.cost_landed_brl || 0)), 0);
      const totalPaid = financial.filter(f => f.status === "paid" && f.type === "payable").reduce((s, f) => s + (f.amount || 0), 0);
      const totalReceived = financial.filter(f => f.status === "paid" && f.type === "receivable" && f.category !== "transferencia").reduce((s, f) => s + (f.amount || 0), 0);

      const channels = {};
      vendas.forEach(o => {
        const ch = o.channel || "direct";
        channels[ch] = (channels[ch] || 0) + (o.total || 0);
      });
      const salesByChannel = Object.entries(channels).map(([name, value]) => ({ name, value: Math.round(value) }));

      const productSales = {};
      vendas.forEach(o => {
        (o.items || []).forEach(item => {
          const name = item.name || "Outros";
          productSales[name] = (productSales[name] || 0) + ((item.quantity || 0) * (item.unit_price || 0));
        });
      });
      const topProducts = Object.entries(productSales)
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      setData({ totalSales, totalInventoryValue, totalPaid, totalReceived, salesByChannel, topProducts, ordersCount: vendas.length });
    } catch (err) {
      setErro(err.message || "Erro ao carregar os relatórios.");
    }
    setLoading(false);
  };

  const formatCurrency = (val) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  if (erro) {
    return (
      <div>
        <PageHeader title="Relatórios" description="Visão analítica do negócio" />
        <div className="bg-destructive/10 text-destructive rounded-xl border border-destructive/20 p-4 text-sm">
          Não foi possível carregar os relatórios: {erro}
          <button onClick={() => { setLoading(true); loadData(); }} className="ml-2 underline font-medium">Tentar de novo</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Relatórios" description="Visão analítica do negócio — vendas consideram pedidos faturados, enviados ou entregues" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={TrendingUp} label="Total Vendas" value={formatCurrency(data.totalSales)} color="success" />
        <StatCard icon={DollarSign} label="Total Recebido" value={formatCurrency(data.totalReceived)} color="success" />
        <StatCard icon={Package} label="Valor em Estoque" value={formatCurrency(data.totalInventoryValue)} color="primary" />
        <StatCard icon={DollarSign} label="Total Pago" value={formatCurrency(data.totalPaid)} color="destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-heading font-semibold mb-4">Vendas por Canal</h3>
          {data.salesByChannel?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={data.salesByChannel} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${formatCurrency(value)}`}>
                  {data.salesByChannel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados de vendas ainda</p>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-heading font-semibold mb-4">Top Produtos (Faturamento)</h3>
          {data.topProducts?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.topProducts} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={v => `R$ ${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="value" fill="hsl(221,83%,53%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados de vendas ainda</p>
          )}
        </div>
      </div>
    </div>
  );
}