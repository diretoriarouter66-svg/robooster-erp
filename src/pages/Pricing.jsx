import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Calculator, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/shared/PageHeader";

export default function Pricing() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({
    cost_fob_usd: 0, exchange_rate: 5.0, ii_rate: 14, ipi_rate: 0,
    pis_rate: 2.1, cofins_rate: 9.65, icms_rate: 18,
    freight_percent: 5, other_costs_percent: 3,
    desired_margin: 30, marketplace_fee: 16,
  });
  const [result, setResult] = useState(null);

  useEffect(() => {
    base44.entities.Product.list("-created_date", 200).then(p => {
      setProducts(p);
      setLoading(false);
    });
  }, []);

  const selectProduct = (id) => {
    setSelectedId(id);
    const p = products.find(pr => pr.id === id);
    if (p) {
      setForm(prev => ({ ...prev, cost_fob_usd: p.cost_fob_usd || 0 }));
    }
  };

  const calculate = () => {
    const fobBrl = form.cost_fob_usd * form.exchange_rate;
    const freightCost = fobBrl * (form.freight_percent / 100);
    const insuranceCost = fobBrl * 0.01;
    const cifValue = fobBrl + freightCost + insuranceCost;

    const iiValue = cifValue * (form.ii_rate / 100);
    const ipiValue = (cifValue + iiValue) * (form.ipi_rate / 100);
    const pisValue = cifValue * (form.pis_rate / 100);
    const cofinsValue = cifValue * (form.cofins_rate / 100);
    const icmsBase = cifValue + iiValue + ipiValue + pisValue + cofinsValue;
    const icmsValue = form.icms_rate > 0 ? icmsBase / (1 - form.icms_rate / 100) * (form.icms_rate / 100) : 0;

    const totalTaxes = iiValue + ipiValue + pisValue + cofinsValue + icmsValue;
    const otherCosts = cifValue * (form.other_costs_percent / 100);
    const landedCost = cifValue + totalTaxes + otherCosts;

    const directSalePrice = landedCost / (1 - form.desired_margin / 100);
    const marketplacePrice = landedCost / (1 - (form.desired_margin + form.marketplace_fee) / 100);

    setResult({
      fobBrl: round(fobBrl),
      cifValue: round(cifValue),
      iiValue: round(iiValue),
      ipiValue: round(ipiValue),
      pisValue: round(pisValue),
      cofinsValue: round(cofinsValue),
      icmsValue: round(icmsValue),
      totalTaxes: round(totalTaxes),
      otherCosts: round(otherCosts),
      landedCost: round(landedCost),
      directSalePrice: round(directSalePrice),
      marketplacePrice: round(marketplacePrice),
      directMargin: round(directSalePrice - landedCost),
      marketplaceMargin: round(marketplacePrice - landedCost - marketplacePrice * form.marketplace_fee / 100),
    });
  };

  const round = (v) => Math.round(v * 100) / 100;

  const formatCurrency = (val) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);

  const saveToProduct = async () => {
    if (!selectedId || !result) return;
    await base44.entities.Product.update(selectedId, {
      cost_landed_brl: result.landedCost,
      sale_price: result.directSalePrice,
      markup_percent: form.desired_margin,
    });
    alert("Preço atualizado no produto!");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader title="Precificador" description="Calcule o preço de venda ideal para seus produtos importados" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold mb-3">Dados do Produto</h3>
            <div className="space-y-3">
              <div>
                <Label>Selecionar Produto (opcional)</Label>
                <Select value={selectedId || "none"} onValueChange={v => v !== "none" ? selectProduct(v) : setSelectedId("")}>
                  <SelectTrigger><SelectValue placeholder="Selecione ou calcule manualmente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Cálculo manual</SelectItem>
                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Custo FOB (USD)</Label><Input type="number" step="0.01" value={form.cost_fob_usd || ""} onChange={e => setForm({...form, cost_fob_usd: parseFloat(e.target.value) || 0})} /></div>
                <div><Label>Cotação Câmbio</Label><Input type="number" step="0.01" value={form.exchange_rate || ""} onChange={e => setForm({...form, exchange_rate: parseFloat(e.target.value) || 0})} /></div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold mb-3">Alíquotas e Custos</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">II (%)</Label><Input type="number" step="0.01" value={form.ii_rate} onChange={e => setForm({...form, ii_rate: parseFloat(e.target.value) || 0})} /></div>
              <div><Label className="text-xs">IPI (%)</Label><Input type="number" step="0.01" value={form.ipi_rate} onChange={e => setForm({...form, ipi_rate: parseFloat(e.target.value) || 0})} /></div>
              <div><Label className="text-xs">PIS (%)</Label><Input type="number" step="0.01" value={form.pis_rate} onChange={e => setForm({...form, pis_rate: parseFloat(e.target.value) || 0})} /></div>
              <div><Label className="text-xs">COFINS (%)</Label><Input type="number" step="0.01" value={form.cofins_rate} onChange={e => setForm({...form, cofins_rate: parseFloat(e.target.value) || 0})} /></div>
              <div><Label className="text-xs">ICMS (%)</Label><Input type="number" step="0.01" value={form.icms_rate} onChange={e => setForm({...form, icms_rate: parseFloat(e.target.value) || 0})} /></div>
              <div><Label className="text-xs">Frete + Seguro (%)</Label><Input type="number" step="0.01" value={form.freight_percent} onChange={e => setForm({...form, freight_percent: parseFloat(e.target.value) || 0})} /></div>
              <div><Label className="text-xs">Outros Custos (%)</Label><Input type="number" step="0.01" value={form.other_costs_percent} onChange={e => setForm({...form, other_costs_percent: parseFloat(e.target.value) || 0})} /></div>
              <div><Label className="text-xs">Margem Desejada (%)</Label><Input type="number" step="0.01" value={form.desired_margin} onChange={e => setForm({...form, desired_margin: parseFloat(e.target.value) || 0})} /></div>
              <div className="col-span-2"><Label className="text-xs">Taxa Marketplace (%)</Label><Input type="number" step="0.01" value={form.marketplace_fee} onChange={e => setForm({...form, marketplace_fee: parseFloat(e.target.value) || 0})} /></div>
            </div>
          </div>

          <Button onClick={calculate} size="lg" className="w-full gap-2">
            <Calculator className="w-5 h-5" /> Calcular Preço
          </Button>
        </div>

        {result && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl border-2 border-primary/20 p-4">
              <h3 className="font-heading font-semibold mb-3">Resultado</h3>
              <div className="space-y-2">
                <ResultRow label="FOB em BRL" value={formatCurrency(result.fobBrl)} />
                <ResultRow label="Valor CIF" value={formatCurrency(result.cifValue)} />
                <div className="border-t border-border pt-2 mt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Impostos</p>
                  <ResultRow label="II" value={formatCurrency(result.iiValue)} small />
                  <ResultRow label="IPI" value={formatCurrency(result.ipiValue)} small />
                  <ResultRow label="PIS" value={formatCurrency(result.pisValue)} small />
                  <ResultRow label="COFINS" value={formatCurrency(result.cofinsValue)} small />
                  <ResultRow label="ICMS" value={formatCurrency(result.icmsValue)} small />
                  <ResultRow label="Total Impostos" value={formatCurrency(result.totalTaxes)} highlight />
                </div>
                <ResultRow label="Outros Custos" value={formatCurrency(result.otherCosts)} />
                <ResultRow label="Custo Landed" value={formatCurrency(result.landedCost)} highlight />
              </div>
            </div>

            <div className="bg-success/5 rounded-xl border-2 border-success/20 p-4">
              <h3 className="font-heading font-semibold mb-3 text-success">Preços Sugeridos</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-card rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Venda Direta</p>
                  <p className="text-2xl font-heading font-bold text-success mt-1">{formatCurrency(result.directSalePrice)}</p>
                  <p className="text-xs text-muted-foreground">Margem: {formatCurrency(result.directMargin)}</p>
                </div>
                <div className="bg-card rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Marketplace</p>
                  <p className="text-2xl font-heading font-bold text-primary mt-1">{formatCurrency(result.marketplacePrice)}</p>
                  <p className="text-xs text-muted-foreground">Margem líq.: {formatCurrency(result.marketplaceMargin)}</p>
                </div>
              </div>
            </div>

            {selectedId && (
              <Button onClick={saveToProduct} variant="outline" className="w-full gap-2">
                <Save className="w-4 h-4" /> Salvar Preço no Produto
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({ label, value, highlight, small }) {
  return (
    <div className={`flex items-center justify-between py-1 ${highlight ? "font-bold text-primary" : ""} ${small ? "text-xs" : "text-sm"}`}>
      <span className={highlight ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}