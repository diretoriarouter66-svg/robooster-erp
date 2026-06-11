import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Save, Plus, Trash2, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../components/shared/PageHeader";

export default function ImportDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split("/");
  const importId = pathParts[pathParts.length - 1];
  const isNew = importId === "new";

  const navigate = useNavigate();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    reference: "", status: "draft", incoterm: "FOB", currency: "USD",
    exchange_rate: 5.0, total_fob_usd: 0, freight_international: 0, insurance: 0,
    ii_rate: 14, ipi_rate: 0, pis_rate: 2.1, cofins_rate: 9.65, icms_rate: 18,
    afrmm_value: 0, siscomex_fee: 214.5, customs_broker_fee: 0, storage_fee: 0,
    inland_freight: 0, other_expenses: 0, fiscal_benefit_type: "none",
    fiscal_benefit_discount: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [supps, prods] = await Promise.all([
      base44.entities.Supplier.list("-created_date", 200),
      base44.entities.Product.list("-created_date", 200),
    ]);
    setSuppliers(supps);
    setProducts(prods);

    if (!isNew) {
      const imp = await base44.entities.ImportProcess.list("-created_date", 200);
      const found = imp.find(i => i.id === importId);
      if (found) {
        setForm(prev => ({ ...prev, ...found }));
      }
      const impItems = await base44.entities.ImportItem.filter({ import_process_id: importId });
      setItems(impItems);
    }
    setLoading(false);
  };

  const addItem = () => {
    setItems([...items, { product_id: "", product_name: "", product_sku: "", quantity: 1, unit_price_fob: 0, total_fob: 0, ncm: "", weight_kg: 0 }]);
  };

  const updateItem = (index, field, value) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };

    if (field === "product_id" && value) {
      const prod = products.find(p => p.id === value);
      if (prod) {
        updated[index].product_name = prod.name;
        updated[index].product_sku = prod.sku;
        updated[index].ncm = prod.ncm || "";
        updated[index].unit_price_fob = prod.cost_fob_usd || 0;
        updated[index].weight_kg = prod.weight_kg || 0;
      }
    }

    if (field === "quantity" || field === "unit_price_fob") {
      updated[index].total_fob = (updated[index].quantity || 0) * (updated[index].unit_price_fob || 0);
    }

    setItems(updated);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculate = () => {
    const totalFobUsd = items.reduce((s, i) => s + (i.total_fob || 0), 0);
    const rate = form.exchange_rate || 5.0;
    const totalFobBrl = totalFobUsd * rate;
    const freightInt = parseFloat(form.freight_international) || 0;
    const ins = parseFloat(form.insurance) || 0;
    const cifValue = totalFobBrl + freightInt + ins;

    const iiRate = parseFloat(form.ii_rate) || 0;
    const benefitDiscount = parseFloat(form.fiscal_benefit_discount) || 0;
    const iiValue = Math.max(0, (cifValue * iiRate / 100) - benefitDiscount);
    const ipiBase = cifValue + iiValue;
    const ipiRate = parseFloat(form.ipi_rate) || 0;
    const ipiValue = ipiBase * ipiRate / 100;
    const pisRate = parseFloat(form.pis_rate) || 2.1;
    const pisValue = cifValue * pisRate / 100;
    const cofinsRate = parseFloat(form.cofins_rate) || 9.65;
    const cofinsValue = cifValue * cofinsRate / 100;
    const icmsRate = parseFloat(form.icms_rate) || 0;
    const icmsBase = cifValue + iiValue + ipiValue + pisValue + cofinsValue;
    const icmsValue = icmsRate > 0 ? icmsBase / (1 - icmsRate / 100) * (icmsRate / 100) : 0;

    const afrmm = parseFloat(form.afrmm_value) || (freightInt * 0.25);
    const totalTaxes = iiValue + ipiValue + pisValue + cofinsValue + icmsValue;
    const siscomex = parseFloat(form.siscomex_fee) || 0;
    const broker = parseFloat(form.customs_broker_fee) || 0;
    const storage = parseFloat(form.storage_fee) || 0;
    const inland = parseFloat(form.inland_freight) || 0;
    const other = parseFloat(form.other_expenses) || 0;
    const totalExpenses = afrmm + siscomex + broker + storage + inland + other;
    const totalLanded = totalFobBrl + totalTaxes + totalExpenses;

    const updatedItems = items.map(item => {
      const itemShare = totalFobUsd > 0 ? (item.total_fob || 0) / totalFobUsd : 0;
      const itemLanded = totalLanded * itemShare;
      return {
        ...item,
        total_landed_brl: Math.round(itemLanded * 100) / 100,
        unit_cost_landed_brl: item.quantity > 0 ? Math.round((itemLanded / item.quantity) * 100) / 100 : 0,
      };
    });

    setItems(updatedItems);
    setForm(prev => ({
      ...prev,
      total_fob_usd: totalFobUsd,
      total_fob_brl: Math.round(totalFobBrl * 100) / 100,
      cif_value_brl: Math.round(cifValue * 100) / 100,
      ii_value: Math.round(iiValue * 100) / 100,
      ipi_value: Math.round(ipiValue * 100) / 100,
      pis_value: Math.round(pisValue * 100) / 100,
      cofins_value: Math.round(cofinsValue * 100) / 100,
      icms_value: Math.round(icmsValue * 100) / 100,
      afrmm_value: Math.round(afrmm * 100) / 100,
      total_taxes: Math.round(totalTaxes * 100) / 100,
      total_expenses: Math.round(totalExpenses * 100) / 100,
      total_landed_cost: Math.round(totalLanded * 100) / 100,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    let processId = importId;
    const supplier = suppliers.find(s => s.id === form.supplier_id);
    const dataToSave = { ...form, supplier_name: supplier?.company_name || form.supplier_name || "" };

    if (isNew) {
      const created = await base44.entities.ImportProcess.create(dataToSave);
      processId = created.id;
    } else {
      await base44.entities.ImportProcess.update(importId, dataToSave);
    }

    // Save items
    if (!isNew) {
      const existingItems = await base44.entities.ImportItem.filter({ import_process_id: importId });
      for (const ei of existingItems) {
        await base44.entities.ImportItem.delete(ei.id);
      }
    }
    for (const item of items) {
      await base44.entities.ImportItem.create({ ...item, import_process_id: processId });
    }

    setSaving(false);
    navigate("/imports");
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
      <div className="flex items-center gap-3 mb-6">
        <Link to="/imports" className="p-2 hover:bg-muted rounded-lg"><ArrowLeft className="w-5 h-5" /></Link>
        <PageHeader title={isNew ? "Novo Processo de Importação" : `Processo ${form.reference}`} />
      </div>

      {/* Basic Info */}
      <div className="bg-card rounded-xl border border-border p-4 mb-4">
        <h3 className="font-heading font-semibold mb-3">Dados Gerais</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><Label>Referência *</Label><Input value={form.reference || ""} onChange={e => setForm({...form, reference: e.target.value})} /></div>
          <div>
            <Label>Fornecedor</Label>
            <Select value={form.supplier_id || "none"} onValueChange={v => setForm({...form, supplier_id: v === "none" ? "" : v})}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status || "draft"} onValueChange={v => setForm({...form, status: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["draft","proforma","shipped","customs","released","delivered","completed"].map(s => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Incoterm</Label>
            <Select value={form.incoterm || "FOB"} onValueChange={v => setForm({...form, incoterm: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["FOB","CIF","EXW","CFR","DDP"].map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Moeda</Label>
            <Select value={form.currency || "USD"} onValueChange={v => setForm({...form, currency: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["USD","EUR","CNY"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Cotação Câmbio</Label><Input type="number" step="0.01" value={form.exchange_rate || ""} onChange={e => setForm({...form, exchange_rate: parseFloat(e.target.value) || 0})} /></div>
          <div><Label>Nº DI</Label><Input value={form.di_number || ""} onChange={e => setForm({...form, di_number: e.target.value})} /></div>
          <div><Label>País Origem</Label><Input value={form.origin_country || ""} onChange={e => setForm({...form, origin_country: e.target.value})} /></div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-card rounded-xl border border-border p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold">Itens da Importação</h3>
          <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item</Button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum item adicionado. Clique em "Adicionar Item".</p>
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end p-3 bg-muted/30 rounded-lg">
                <div className="col-span-2">
                  <Label className="text-xs">Produto</Label>
                  <Select value={item.product_id || "manual"} onValueChange={v => updateItem(idx, "product_id", v === "manual" ? "" : v)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione ou manual" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Digitar manual</SelectItem>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!item.product_id && (
                    <Input className="mt-1 h-8 text-xs" placeholder="Nome do produto" value={item.product_name || ""} onChange={e => updateItem(idx, "product_name", e.target.value)} />
                  )}
                </div>
                <div>
                  <Label className="text-xs">Qtd</Label>
                  <Input type="number" className="h-9 text-xs" value={item.quantity || ""} onChange={e => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label className="text-xs">Preço FOB Unit.</Label>
                  <Input type="number" step="0.01" className="h-9 text-xs" value={item.unit_price_fob || ""} onChange={e => updateItem(idx, "unit_price_fob", parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label className="text-xs">Total FOB</Label>
                  <Input className="h-9 text-xs bg-muted" readOnly value={((item.quantity || 0) * (item.unit_price_fob || 0)).toFixed(2)} />
                </div>
                <div className="flex items-end">
                  <button onClick={() => removeItem(idx)} className="p-2 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Taxes & Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-heading font-semibold mb-3">Despesas de Importação</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Frete Internacional (BRL)</Label><Input type="number" step="0.01" value={form.freight_international || ""} onChange={e => setForm({...form, freight_international: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">Seguro (BRL)</Label><Input type="number" step="0.01" value={form.insurance || ""} onChange={e => setForm({...form, insurance: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">AFRMM (BRL)</Label><Input type="number" step="0.01" value={form.afrmm_value || ""} onChange={e => setForm({...form, afrmm_value: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">Taxa SISCOMEX</Label><Input type="number" step="0.01" value={form.siscomex_fee || ""} onChange={e => setForm({...form, siscomex_fee: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">Despachante</Label><Input type="number" step="0.01" value={form.customs_broker_fee || ""} onChange={e => setForm({...form, customs_broker_fee: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">Armazenagem</Label><Input type="number" step="0.01" value={form.storage_fee || ""} onChange={e => setForm({...form, storage_fee: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">Frete Interno</Label><Input type="number" step="0.01" value={form.inland_freight || ""} onChange={e => setForm({...form, inland_freight: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">Outras Despesas</Label><Input type="number" step="0.01" value={form.other_expenses || ""} onChange={e => setForm({...form, other_expenses: parseFloat(e.target.value) || 0})} /></div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-heading font-semibold mb-3">Alíquotas de Impostos</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">II (%)</Label><Input type="number" step="0.01" value={form.ii_rate || ""} onChange={e => setForm({...form, ii_rate: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">IPI (%)</Label><Input type="number" step="0.01" value={form.ipi_rate || ""} onChange={e => setForm({...form, ipi_rate: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">PIS (%)</Label><Input type="number" step="0.01" value={form.pis_rate || ""} onChange={e => setForm({...form, pis_rate: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">COFINS (%)</Label><Input type="number" step="0.01" value={form.cofins_rate || ""} onChange={e => setForm({...form, cofins_rate: parseFloat(e.target.value) || 0})} /></div>
            <div><Label className="text-xs">ICMS (%)</Label><Input type="number" step="0.01" value={form.icms_rate || ""} onChange={e => setForm({...form, icms_rate: parseFloat(e.target.value) || 0})} /></div>
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <h4 className="text-xs font-semibold mb-2">Benefício Fiscal</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={form.fiscal_benefit_type || "none"} onValueChange={v => setForm({...form, fiscal_benefit_type: v})}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    <SelectItem value="ex_tarifario">Ex-Tarifário</SelectItem>
                    <SelectItem value="acordo_comercial">Acordo Comercial</SelectItem>
                    <SelectItem value="regime_especial">Regime Especial</SelectItem>
                    <SelectItem value="drawback">Drawback</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Desconto (BRL)</Label><Input type="number" step="0.01" value={form.fiscal_benefit_discount || ""} onChange={e => setForm({...form, fiscal_benefit_discount: parseFloat(e.target.value) || 0})} /></div>
            </div>
          </div>
        </div>
      </div>

      {/* Calculate Button */}
      <div className="flex justify-center mb-4">
        <Button onClick={calculate} size="lg" variant="outline" className="gap-2">
          <Calculator className="w-5 h-5" /> Calcular Impostos e Custos
        </Button>
      </div>

      {/* Summary */}
      {form.total_landed_cost > 0 && (
        <div className="bg-card rounded-xl border-2 border-primary/20 p-4 mb-4">
          <h3 className="font-heading font-semibold mb-3">Resumo do Processo</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryItem label="FOB Total" value={formatCurrency(form.total_fob_brl)} />
            <SummaryItem label="Valor CIF" value={formatCurrency(form.cif_value_brl)} />
            <SummaryItem label="II" value={formatCurrency(form.ii_value)} sub={`${form.ii_rate}%`} />
            <SummaryItem label="IPI" value={formatCurrency(form.ipi_value)} sub={`${form.ipi_rate}%`} />
            <SummaryItem label="PIS" value={formatCurrency(form.pis_value)} sub={`${form.pis_rate}%`} />
            <SummaryItem label="COFINS" value={formatCurrency(form.cofins_value)} sub={`${form.cofins_rate}%`} />
            <SummaryItem label="ICMS" value={formatCurrency(form.icms_value)} sub={`${form.icms_rate}%`} />
            <SummaryItem label="AFRMM" value={formatCurrency(form.afrmm_value)} />
            <SummaryItem label="Total Impostos" value={formatCurrency(form.total_taxes)} highlight />
            <SummaryItem label="Total Despesas" value={formatCurrency(form.total_expenses)} />
            <SummaryItem label="Custo Landed Total" value={formatCurrency(form.total_landed_cost)} highlight />
          </div>

          {items.length > 0 && items[0].unit_cost_landed_brl > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <h4 className="text-xs font-semibold mb-2">Custo Landed por Item</h4>
              <div className="space-y-1">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm py-1">
                    <span>{item.product_name || `Item ${idx + 1}`} (x{item.quantity})</span>
                    <span className="font-medium">{formatCurrency(item.unit_cost_landed_brl)} /un</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes & Dates */}
      <div className="bg-card rounded-xl border border-border p-4 mb-4">
        <h3 className="font-heading font-semibold mb-3">Datas e Observações</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label>Data DI</Label><Input type="date" value={form.di_date || ""} onChange={e => setForm({...form, di_date: e.target.value})} /></div>
          <div><Label>Previsão Chegada</Label><Input type="date" value={form.estimated_arrival || ""} onChange={e => setForm({...form, estimated_arrival: e.target.value})} /></div>
          <div><Label>Chegada Real</Label><Input type="date" value={form.actual_arrival || ""} onChange={e => setForm({...form, actual_arrival: e.target.value})} /></div>
        </div>
        <div className="mt-3">
          <Label>Observações</Label>
          <textarea className="w-full min-h-[80px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Link to="/imports"><Button variant="outline">Cancelar</Button></Link>
        <Button onClick={handleSave} disabled={saving || !form.reference} className="gap-2">
          <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar Processo"}
        </Button>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, sub, highlight }) {
  return (
    <div className={`p-2 rounded-lg ${highlight ? "bg-primary/5 border border-primary/20" : "bg-muted/30"}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${highlight ? "text-primary" : ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}