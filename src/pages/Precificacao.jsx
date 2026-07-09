import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search, Package, Save, Loader2, RefreshCw, Lock, Unlock, Star, Calculator } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import {
  getCustoVigente, hasCostLanded, calcImpostosPct, getMasterChannel,
  getSellerCommissionPct, calcSellerCommissionRs, calcMasterPriceFromMarkup,
  calcChannelPrice, calcChannelBreakdown, formatBRL, formatPct
} from "@/lib/pricingCalc";

export default function Precificacao() {
  const [products, setProducts] = useState([]);
  const [channels, setChannels] = useState([]);
  const [config, setConfig] = useState(null);
  const [pricings, setPricings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [search, setSearch] = useState("");
  const [recalculating, setRecalculating] = useState(false);
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState("preco");
  const [masterPriceInput, setMasterPriceInput] = useState(0);
  const [targetMargin, setTargetMargin] = useState(20);
  const [frete, setFrete] = useState(0);
  const [clientePagaFrete, setClientePagaFrete] = useState(false);
  const [sellerCommPct, setSellerCommPct] = useState(0);
  const [decoupled, setDecoupled] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [prods, chans, configs, prcs] = await Promise.all([
      base44.entities.Product.list("-created_date", 500),
      base44.entities.SalesChannel.list("-created_date", 100),
      base44.entities.ConfigTributaria.list("-created_date", 5),
      base44.entities.ProductPricing.list("-created_date", 1000),
    ]);
    setProducts(prods);
    setChannels(chans.filter(c => c.active !== false));
    setConfig(configs[0] || {});
    setPricings(prcs);
    setLoading(false);
  };

  useEffect(() => {
    if (!loading && searchParams.get("produto")) {
      const prod = products.find(p => p.id === searchParams.get("produto"));
      if (prod) openCockpit(prod);
    }
  }, [loading]);

  const openCockpit = (product) => {
    setSelectedProduct(product);
    const scPct = getSellerCommissionPct(product, config);
    setSellerCommPct(scPct);
    setMode("preco");
    setFrete(0);
    setClientePagaFrete(false);
    setDecoupled({});

    const masterCh = getMasterChannel(channels.filter(c => c.active !== false));
    const existing = pricings.find(p => p.product_id === product.id && p.channel_id === masterCh?.id);
    if (existing?.price) {
      setMasterPriceInput(existing.price);
      try {
        const notes = JSON.parse(existing.notes || "{}");
        if (notes.frete) setFrete(notes.frete);
        if (notes.cliente_paga_frete) setClientePagaFrete(true);
      } catch {}
    } else {
      setMasterPriceInput(0);
    }
    setView("cockpit");
  };

  const custo = selectedProduct ? getCustoVigente(selectedProduct) : 0;
  const usingLanded = selectedProduct ? hasCostLanded(selectedProduct) : false;
  const impostos = selectedProduct ? calcImpostosPct(config, selectedProduct) : null;
  const masterChannel = getMasterChannel(channels);
  const indiceCustoFixo = config?.indice_custo_fixo || 0;

  const calculatedMasterPrice = useMemo(() => {
    if (mode === "preco") return masterPriceInput || 0;
    return calcMasterPriceFromMarkup(targetMargin, custo, impostos?.total || 0, masterChannel?.commission_percent || 0, masterChannel?.fixed_fee || 0, sellerCommPct, clientePagaFrete ? 0 : frete);
  }, [mode, masterPriceInput, targetMargin, custo, impostos, sellerCommPct, frete, clientePagaFrete, indiceCustoFixo]);

  const sellerCommRs = useMemo(() =>
    calcSellerCommissionRs(calculatedMasterPrice, impostos?.total || 0, sellerCommPct),
  [calculatedMasterPrice, impostos, sellerCommPct]);

  const masterBreakdown = useMemo(() => {
    if (!masterChannel || !impostos) return null;
    return calcChannelBreakdown(calculatedMasterPrice, masterChannel, custo, impostos.total, sellerCommRs, frete, clientePagaFrete, indiceCustoFixo);
  }, [calculatedMasterPrice, masterChannel, custo, impostos, sellerCommRs, frete, clientePagaFrete, indiceCustoFixo]);

  const channelResults = useMemo(() => {
    if (!masterBreakdown || !impostos) return [];
    const margemBrutaAlvo = masterBreakdown.margemBruta;
    const freteEff = clientePagaFrete ? 0 : frete;
    return channels.map(ch => {
      const isMaster = ch.id === masterChannel?.id;
      const isDecoupled = decoupled[ch.id] != null;
      const price = isMaster
        ? calculatedMasterPrice
        : isDecoupled
          ? decoupled[ch.id]
          : calcChannelPrice(margemBrutaAlvo, ch, custo, impostos.total, sellerCommRs, freteEff);
      const breakdown = calcChannelBreakdown(price, ch, custo, impostos.total, sellerCommRs, frete, clientePagaFrete, indiceCustoFixo);
      return { channel: ch, isMaster, isDecoupled, price, breakdown };
    });
  }, [masterBreakdown, channels, masterChannel, calculatedMasterPrice, decoupled, custo, impostos, sellerCommRs, frete, clientePagaFrete, indiceCustoFixo]);

  const handleSave = async () => {
    setSaving(true);
    const notesData = JSON.stringify({ frete, cliente_paga_frete: clientePagaFrete });
    for (const result of channelResults) {
      const existing = pricings.find(p => p.product_id === selectedProduct.id && p.channel_id === result.channel.id);
      const data = { product_id: selectedProduct.id, channel_id: result.channel.id, price: Math.round(result.price * 100) / 100, notes: notesData };
      if (existing) await base44.entities.ProductPricing.update(existing.id, data);
      else await base44.entities.ProductPricing.create(data);
    }
    setSaving(false);
    setView("list");
    loadData();
  };

  const handleRecalcAll = async () => {
    if (!confirm("Recalcular todos os preços existentes usando a regra do canal Master? Preços manuais de canais não-Master serão sobrescritos.")) return;
    setRecalculating(true);
    const masterCh = getMasterChannel(channels);
    const productsWithPricing = products.filter(p => pricings.some(pr => pr.product_id === p.id));

    for (const product of productsWithPricing) {
      const custoProd = getCustoVigente(product);
      const impProd = calcImpostosPct(config, product);
      const scPct = getSellerCommissionPct(product, config);
      const masterPricing = pricings.find(p => p.product_id === product.id && p.channel_id === masterCh?.id);
      if (!masterPricing?.price) continue;

      let freteProd = 0, clientePaga = false;
      try {
        const notes = JSON.parse(masterPricing.notes || "{}");
        freteProd = notes.frete || 0;
        clientePaga = notes.cliente_paga_frete || false;
      } catch {}
      const freteEff = clientePaga ? 0 : freteProd;
      const scRs = calcSellerCommissionRs(masterPricing.price, impProd.total, scPct);
      const masterBd = calcChannelBreakdown(masterPricing.price, masterCh, custoProd, impProd.total, scRs, freteProd, clientePaga, config.indice_custo_fixo || 0);
      const margemBrutaAlvo = masterBd.margemBruta;

      const updates = [];
      for (const ch of channels) {
        const isMaster = ch.id === masterCh?.id;
        const price = isMaster ? masterPricing.price : calcChannelPrice(margemBrutaAlvo, ch, custoProd, impProd.total, scRs, freteEff);
        const existing = pricings.find(p => p.product_id === product.id && p.channel_id === ch.id);
        if (existing) updates.push({ id: existing.id, price });
      }
      if (updates.length) await base44.entities.ProductPricing.bulkUpdate(updates);
    }
    setRecalculating(false);
    loadData();
  };

  const toggleDecouple = (channelId) => {
    setDecoupled(prev => {
      const next = { ...prev };
      if (next[channelId] != null) delete next[channelId];
      else {
        const result = channelResults.find(r => r.channel.id === channelId);
        next[channelId] = result?.price || 0;
      }
      return next;
    });
  };

  const setDecoupledPrice = (channelId, val) => {
    setDecoupled(prev => ({ ...prev, [channelId]: val }));
  };

  const filtered = products.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()));
  const masterPriceMap = useMemo(() => {
    const mCh = getMasterChannel(channels);
    const map = {};
    if (mCh) pricings.filter(p => p.channel_id === mCh.id).forEach(p => { map[p.product_id] = p.price; });
    return map;
  }, [channels, pricings]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (view === "list") return (
    <div>
      <PageHeader title="Cockpit de Precificação" description={`${products.length} produtos · ${pricings.length} preços cadastrados`}
        actions={<Button variant="outline" onClick={handleRecalcAll} disabled={recalculating}><RefreshCw className={`w-4 h-4 mr-1 ${recalculating ? "animate-spin" : ""}`} /> Recalcular Todos os Preços</Button>} />

      {products.length === 0 ? (
        <EmptyState icon={Calculator} title="Nenhum produto cadastrado" description="Cadastre produtos para precificá-los." />
      ) : (
        <>
          <div className="mb-4 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produto</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">SKU</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Custo Vigente</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Origem do Custo</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Preço Master</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const custoP = getCustoVigente(p);
                    const isLanded = hasCostLanded(p);
                    return (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs">{p.sku}</td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">{formatBRL(custoP)}</td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          <span className={`text-xs ${isLanded ? "text-primary" : "text-muted-foreground"}`}>{isLanded ? "Importação" : "Manual"}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{formatBRL(masterPriceMap[p.id])}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" onClick={() => openCockpit(p)}><Calculator className="w-3.5 h-3.5 mr-1" /> Precificar</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // COCKPIT VIEW
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={() => setView("list")}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
        <div>
          <h1 className="text-xl font-heading font-bold">{selectedProduct?.name}</h1>
          <p className="text-xs text-muted-foreground">SKU: {selectedProduct?.sku}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Controles */}
        <div className="space-y-4">
          {/* Custo e Impostos */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Custo e Impostos</h3>
            {custo <= 0 && (
              <div className="mb-3 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive font-medium">
                Produto sem custo definido — a precificação não funciona sem custo. Informe o "Custo do Produto (R$)" no cadastro do produto ou marque uma importação como Realizada.
              </div>
            )}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Custo do Produto</span>
                <span className="font-medium">{formatBRL(custo)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground -mt-1">{usingLanded ? "Origem: Importação realizada" : "Origem: Custo manual"}</div>
              <div className="border-t border-border pt-2 mt-2">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">PIS s/ Venda</span><span>{formatPct(impostos.pis)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">COFINS s/ Venda</span><span>{formatPct(impostos.cofins)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">ICMS</span><span>{formatPct(impostos.icms)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">IRPJ Efetivo</span><span>{formatPct(impostos.irpjEfetivo)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">CSLL Efetiva</span><span>{formatPct(impostos.csllEfetiva)}</span></div>
                <div className="flex justify-between font-semibold border-t border-border mt-1 pt-1"><span>Total Impostos</span><span className="text-primary">{formatPct(impostos.total)}</span></div>
              </div>
              <div className="flex justify-between text-xs border-t border-border pt-2"><span className="text-muted-foreground">Comissão Vendedor</span><span>{formatPct(sellerCommPct)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Custo Fixo Alocado</span><span>{formatBRL(indiceCustoFixo * custo)}</span></div>
            </div>
          </div>

          {/* Modo de Cálculo */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Modo de Cálculo</h3>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setMode("preco")} className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium ${mode === "preco" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Preço de Venda</button>
              <button onClick={() => setMode("margem")} className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium ${mode === "margem" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Markup s/ Custo (%)</button>
            </div>
            {mode === "preco" ? (
              <div>
                <Label>Preço do Canal Master (R$)</Label>
                <Input type="number" step="0.01" value={masterPriceInput || ""} onChange={e => setMasterPriceInput(parseFloat(e.target.value) || 0)} placeholder="0,00" />
                <p className="text-[10px] text-muted-foreground mt-1">Digite o preço do canal "{masterChannel?.name}" e os demais canais serão calculados automaticamente</p>
              </div>
            ) : (
              <div>
                <Label>Markup sobre o Custo (%)</Label>
                <div className="flex gap-2">
                  <Input type="number" step="0.1" value={targetMargin || ""} onChange={e => setTargetMargin(parseFloat(e.target.value) || 0)} placeholder="80" />
                  <button type="button" onClick={() => { if (calculatedMasterPrice > 0) { setMasterPriceInput(Math.round(calculatedMasterPrice * 100) / 100); setMode("preco"); } }} className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground whitespace-nowrap">Calcular</button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Ex.: 80 = preço com 80% de acréscimo sobre o custo, já cobrindo impostos e comissões. Clique em Calcular para aplicar ao canal Master.</p>
                {calculatedMasterPrice > 0 ? (
                  <div className="mt-2 px-3 py-2 bg-primary/5 rounded-lg text-sm flex justify-between">
                    <span className="text-muted-foreground">Preço Master calculado</span>
                    <span className="font-semibold text-primary">{formatBRL(calculatedMasterPrice)}</span>
                  </div>
                ) : (
                  targetMargin > 0 && (
                    <div className="mt-2 px-3 py-2 bg-destructive/10 rounded-lg text-xs text-destructive">
                      Configuração inválida: impostos + comissões consomem 100% ou mais do preço. Revise a Config. Tributária e as comissões.
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* Frete e Comissão */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Frete e Comissão</h3>
            <div className="space-y-3">
              <div>
                <Label>Frete (R$)</Label>
                <Input type="number" step="0.01" value={frete || ""} onChange={e => setFrete(parseFloat(e.target.value) || 0)} placeholder="0,00" disabled={clientePagaFrete} />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setClientePagaFrete(!clientePagaFrete)} className={`px-2 py-1 rounded text-xs font-medium ${clientePagaFrete ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {clientePagaFrete ? "Sim" : "Não"}
                </button>
                <Label className="cursor-pointer" onClick={() => setClientePagaFrete(!clientePagaFrete)}>Cliente paga o frete</Label>
              </div>
              <div>
                <Label>Comissão do Vendedor (%)</Label>
                <Input type="number" step="0.1" value={sellerCommPct || ""} onChange={e => setSellerCommPct(parseFloat(e.target.value) || 0)} />
                <p className="text-[10px] text-muted-foreground mt-0.5">Calculada sobre o preço à vista líquido de impostos</p>
              </div>
              {sellerCommRs > 0 && (
                <div className="text-xs flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Comissão Vendedor (R$)</span><span>{formatBRL(sellerCommRs)}</span></div>
              )}
            </div>
          </div>

          <Button className="w-full" onClick={handleSave} disabled={saving || calculatedMasterPrice <= 0}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar Preços
          </Button>
        </div>

        {/* RIGHT: Tabela de Canais */}
        <div className="lg:col-span-2">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Composição por Canal</h3>
            {masterBreakdown && (
              <div className="mb-3 px-3 py-2 bg-muted/30 rounded-lg flex justify-between text-sm">
                <span className="text-muted-foreground">Margem Bruta Alvo (Master)</span>
                <span className={`font-semibold ${masterBreakdown.margemBruta >= 0 ? "text-success" : "text-destructive"}`}>{formatBRL(masterBreakdown.margemBruta)} ({formatPct(masterBreakdown.margemBrutaPct)})</span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground whitespace-nowrap">
                    <th className="text-left py-2 px-1">Canal</th>
                    <th className="text-right py-2 px-1">Preço</th>
                    <th className="text-right py-2 px-1">Custo</th>
                    <th className="text-right py-2 px-1">Impostos</th>
                    <th className="text-right py-2 px-1 hidden sm:table-cell">Com. Canal</th>
                    <th className="text-right py-2 px-1 hidden sm:table-cell">Com. Vendedor</th>
                    <th className="text-right py-2 px-1 hidden md:table-cell">Frete</th>
                    <th className="text-right py-2 px-1 font-semibold">M. Bruta</th>
                    <th className="text-right py-2 px-1 hidden lg:table-cell">Custo Fixo</th>
                    <th className="text-right py-2 px-1 font-semibold">M. Líquida</th>
                    <th className="text-right py-2 px-1 hidden lg:table-cell">Markup</th>
                    <th className="text-center py-2 px-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {channelResults.map(({ channel: ch, isMaster, isDecoupled, price, breakdown: bd }) => (
                    <tr key={ch.id} className="border-b border-border/50">
                      <td className="py-2 px-1">
                        <div className="flex items-center gap-1">
                          {isMaster && <Star className="w-3 h-3 text-warning fill-warning" />}
                          <div>
                            <p className="font-medium">{ch.name}</p>
                            <p className="text-[9px] text-muted-foreground">{ch.commission_percent || 0}% comiss{ch.fixed_fee ? ` + ${formatBRL(ch.fixed_fee)}` : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-1 text-right">
                        {isMaster ? (
                          <span className="font-medium">{formatBRL(price)}</span>
                        ) : isDecoupled ? (
                          <Input type="number" step="0.01" className="h-7 w-24 text-right text-xs ml-auto" value={price || ""} onChange={e => setDecoupledPrice(ch.id, parseFloat(e.target.value) || 0)} />
                        ) : (
                          <span className="text-muted-foreground">{formatBRL(price)}</span>
                        )}
                      </td>
                      <td className="py-2 px-1 text-right text-muted-foreground">{formatBRL(bd.custo)}</td>
                      <td className="py-2 px-1 text-right text-muted-foreground">{formatBRL(bd.impostos)}</td>
                      <td className="py-2 px-1 text-right text-muted-foreground hidden sm:table-cell">{formatBRL(bd.comissaoCanal)}</td>
                      <td className="py-2 px-1 text-right text-muted-foreground hidden sm:table-cell">{formatBRL(bd.sellerCommission)}</td>
                      <td className="py-2 px-1 text-right text-muted-foreground hidden md:table-cell">{bd.frete > 0 ? formatBRL(bd.frete) : "—"}</td>
                      <td className={`py-2 px-1 text-right font-medium ${bd.margemBruta >= 0 ? "" : "text-destructive"}`}>
                        {formatBRL(bd.margemBruta)}<br /><span className="text-[9px]">{formatPct(bd.margemBrutaPct)}</span>
                      </td>
                      <td className="py-2 px-1 text-right text-muted-foreground hidden lg:table-cell">{formatBRL(bd.custoFixoAlocado)}</td>
                      <td className={`py-2 px-1 text-right font-bold ${bd.margemLiquida >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatBRL(bd.margemLiquida)}<br /><span className="text-[9px]">{formatPct(bd.margemLiquidaPct)}</span>
                      </td>
                      <td className="py-2 px-1 text-right hidden lg:table-cell text-muted-foreground">{formatPct(bd.markup)}</td>
                      <td className="py-2 px-1 text-center">
                        {!isMaster && (
                          <button onClick={() => toggleDecouple(ch.id)} className="p-1 hover:bg-muted rounded" title={isDecoupled ? "Recalcular automaticamente" : "Editar manualmente"}>
                            {isDecoupled ? <Lock className="w-3 h-3 text-primary" /> : <Unlock className="w-3 h-3 text-muted-foreground" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}