import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Coins, Package, Boxes, Star, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import PageHeader from "../components/shared/PageHeader";
import {
  getCustoVigente, calcImpostosPct, calcSellerCommissionRs,
  getSellerCommissionPct, calcChannelBreakdown, getMasterChannel, formatBRL, formatPct
} from "@/lib/pricingCalc";

// Estoque & Caixa — espelho do InventoryDashboard + InventoryAnalysis do
// precificador unificado, com uma diferença: aqui as margens são calculadas
// AO VIVO pelo motor do ERP (calcChannelBreakdown), nunca lidas de cache.
// "Entrada em caixa" = lucro líquido + custo recuperado (o que volta pro caixa
// depois de vender todo o estoque naquele canal).

export default function EstoqueCaixa() {
  const [products, setProducts] = useState([]);
  const [channels, setChannels] = useState([]);
  const [pricings, setPricings] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [prods, chans, prcs, cfgs] = await Promise.all([
        base44.entities.Product.list("-created_date", 1000),
        base44.entities.SalesChannel.list("-created_date", 100),
        base44.entities.ProductPricing.list("-created_date", 2000),
        base44.entities.ConfigTributaria.list("-created_date", 5),
      ]);
      setProducts(prods || []);
      setChannels((chans || []).filter(c => c.active !== false));
      setPricings(prcs || []);
      setConfig(cfgs?.[0] || {});
      setLoading(false);
    })();
  }, []);

  const indiceCustoFixo = config?.indice_custo_fixo || 0;

  // ==== Totais gerais do estoque (a preço de custo) ====
  const geral = useMemo(() => {
    let custoTotal = 0, unidades = 0, comEstoque = 0;
    const linhas = [];
    for (const p of products) {
      const qty = p.stock_quantity || 0;
      const custo = getCustoVigente(p);
      const valor = qty * custo;
      if (qty > 0) {
        comEstoque++;
        unidades += qty;
        custoTotal += valor;
        linhas.push({ id: p.id, sku: p.sku, nome: p.name, qty, custo, valor, produto: p });
      }
    }
    linhas.sort((a, b) => b.valor - a.valor);
    return { custoTotal, unidades, comEstoque, linhas };
  }, [products]);

  // ==== Projeção por canal: vender TODO o estoque por aquele canal ====
  const porCanal = useMemo(() => {
    if (!config) return [];
    // Comissão do vendedor: MESMA régua do cockpit — calculada sobre o preço do
    // canal MASTER (à vista) e reutilizada em todos os canais.
    const masterCh = getMasterChannel(channels); // mesma resolução do cockpit
    return channels.map(ch => {
      let receita = 0, lucroBruto = 0, lucroLiquido = 0, impostos = 0,
        comCanal = 0, comVendedor = 0, frete = 0, custoFixo = 0, custoEstoque = 0, itens = 0;
      for (const p of products) {
        const qty = p.stock_quantity || 0;
        if (qty <= 0) continue;
        const pricing = pricings.find(pr => pr.product_id === p.id && pr.channel_id === ch.id);
        if (!pricing?.price) continue;
        const custo = getCustoVigente(p);
        const imp = calcImpostosPct(config, p, ch);
        let freteProd = 0, clientePaga = false;
        try { const n = JSON.parse(pricing.notes || "{}"); freteProd = n.frete || 0; clientePaga = n.cliente_paga_frete || false; } catch {}
        const scPct = getSellerCommissionPct(p, config);
        const masterPricing = masterCh ? pricings.find(pr => pr.product_id === p.id && pr.channel_id === masterCh.id) : null;
        const temPrecoMaster = (masterPricing?.price || 0) > 0;
        const impMaster = masterCh ? calcImpostosPct(config, p, masterCh) : imp;
        const scRs = calcSellerCommissionRs(temPrecoMaster ? masterPricing.price : pricing.price, (temPrecoMaster ? impMaster : imp).total, scPct);
        const bd = calcChannelBreakdown(pricing.price, ch, custo, imp.total, scRs, freteProd, clientePaga, indiceCustoFixo);
        receita += qty * pricing.price;
        lucroBruto += qty * bd.margemBruta;
        lucroLiquido += qty * bd.margemLiquida;
        impostos += qty * bd.impostos;
        comCanal += qty * bd.comissaoCanal;
        comVendedor += qty * bd.sellerCommission;
        frete += qty * (clientePaga ? 0 : freteProd);
        custoFixo += qty * bd.custoFixoAlocado;
        custoEstoque += qty * custo;
        itens++;
      }
      const deducoes = impostos + comCanal + comVendedor + frete + custoFixo;
      const caixa = lucroLiquido + custoEstoque;
      return {
        canal: ch, receita, lucroBruto, lucroLiquido, impostos, comCanal, comVendedor, frete, custoFixo,
        custoEstoque, deducoes, caixa, itens,
        brutaPct: receita > 0 ? (lucroBruto / receita) * 100 : 0,
        liquidaPct: receita > 0 ? (lucroLiquido / receita) * 100 : 0,
      };
    }).filter(c => c.itens > 0);
  }, [channels, products, pricings, config, indiceCustoFixo]);

  const linhasFiltradas = geral.linhas.filter(l => !search || l.nome?.toLowerCase().includes(search.toLowerCase()) || l.sku?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div>
      <PageHeader title="Estoque & Caixa" description="Quanto vale o estoque a custo — e quanto entra no caixa vendendo tudo, canal por canal" />

      {/* HERO: custo do estoque + receita por canal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="rounded-xl bg-sidebar text-sidebar-foreground p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-sidebar-foreground/60 text-xs uppercase tracking-wider"><Boxes className="w-4 h-4" /> Custo total do estoque</div>
          <p className="text-3xl font-heading font-bold mt-2">{formatBRL(geral.custoTotal)}</p>
          <p className="text-xs text-sidebar-foreground/60 mt-1">{geral.unidades} unidades · {geral.comEstoque} produtos com estoque (de {products.length})</p>
        </div>
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Receita total vendendo tudo, por canal</p>
          {porCanal.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto com estoque tem preço salvo nos canais — passe no Cockpit de Precificação primeiro.</p>
          ) : (
            <div className="space-y-2">
              {porCanal.map(c => (
                <div key={c.canal.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">{c.canal.is_master && <Star className="w-3 h-3 text-warning fill-warning" />}{c.canal.name} <span className="text-[10px] text-muted-foreground">({c.itens} produtos)</span></span>
                  <span className="font-semibold">{formatBRL(c.receita)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* UM CARD POR CANAL */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        {porCanal.map(c => (
          <div key={c.canal.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading font-semibold text-sm flex items-center gap-1.5">
                {c.canal.is_master && <Star className="w-3.5 h-3.5 text-warning fill-warning" />}{c.canal.name}
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{c.canal.commission_percent || 0}%{c.canal.fixed_fee ? ` + ${formatBRL(c.canal.fixed_fee)}` : ""}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg bg-muted/30 p-2"><p className="text-muted-foreground">Receita total</p><p className="font-semibold text-sm">{formatBRL(c.receita)}</p></div>
              <div className="rounded-lg bg-muted/30 p-2"><p className="text-muted-foreground">Lucro bruto</p><p className="font-semibold text-sm">{formatBRL(c.lucroBruto)}</p><p className="text-[10px] text-muted-foreground">{formatPct(c.brutaPct)}</p></div>
              <div className="rounded-lg bg-muted/30 p-2"><p className="text-muted-foreground">Lucro líquido</p><p className={`font-semibold text-sm ${c.lucroLiquido >= 0 ? "" : "text-destructive"}`}>{formatBRL(c.lucroLiquido)}</p><p className="text-[10px] text-muted-foreground">{formatPct(c.liquidaPct)}</p></div>
              <div className="rounded-lg bg-success/10 border border-success/20 p-2"><p className="text-success/80">💰 Entra em caixa</p><p className="font-bold text-sm text-success">{formatBRL(c.caixa)}</p></div>
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-1">Deduções</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
              <div className="rounded bg-destructive/5 p-1.5"><p className="text-muted-foreground">Impostos</p><p className="font-medium">{formatBRL(c.impostos)}</p></div>
              <div className="rounded bg-destructive/5 p-1.5"><p className="text-muted-foreground">Com. canal</p><p className="font-medium">{formatBRL(c.comCanal)}</p></div>
              <div className="rounded bg-destructive/5 p-1.5"><p className="text-muted-foreground">Com. vendedor</p><p className="font-medium">{formatBRL(c.comVendedor)}</p></div>
              {c.frete > 0 && <div className="rounded bg-destructive/5 p-1.5"><p className="text-muted-foreground">Frete</p><p className="font-medium">{formatBRL(c.frete)}</p></div>}
              <div className="rounded bg-destructive/5 p-1.5"><p className="text-muted-foreground">Custo fixo</p><p className="font-medium">{formatBRL(c.custoFixo)}</p></div>
              <div className="rounded bg-destructive/10 p-1.5"><p className="text-muted-foreground">Total deduções</p><p className="font-semibold">{formatBRL(c.deducoes)}</p></div>
            </div>
          </div>
        ))}
      </div>

      {/* ANÁLISE POR PRODUTO — o que tem mais dinheiro parado */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-semibold">Valor em estoque por produto</h3>
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar produto ou SKU..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8" />
        </div>
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">SKU</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produto</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qtd</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Custo unit.</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor total</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">% do estoque</th>
            </tr></thead>
            <tbody>
              {linhasFiltradas.map((l, ix) => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{ix + 1}</td>
                  <td className="px-4 py-2.5 font-mono text-xs hidden sm:table-cell">{l.sku}</td>
                  <td className="px-4 py-2.5 font-medium">{l.nome}</td>
                  <td className="px-4 py-2.5 text-right">{l.qty}</td>
                  <td className="px-4 py-2.5 text-right hidden md:table-cell">{formatBRL(l.custo)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{formatBRL(l.valor)}</td>
                  <td className="px-4 py-2.5 text-right hidden lg:table-cell text-muted-foreground">{geral.custoTotal > 0 ? `${((l.valor / geral.custoTotal) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-muted/30 font-semibold">
              <td className="px-4 py-3" colSpan={3}>TOTAL GERAL</td>
              <td className="px-4 py-3 text-right">{geral.unidades}</td>
              <td className="px-4 py-3 hidden md:table-cell"></td>
              <td className="px-4 py-3 text-right">{formatBRL(geral.custoTotal)}</td>
              <td className="px-4 py-3 hidden lg:table-cell"></td>
            </tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
