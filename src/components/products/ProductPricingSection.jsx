import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

const formatBRL = (val) => {
  if (val == null || isNaN(val)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
};

export default function ProductPricingSection({ productId, costLandedBrl }) {
  const [channels, setChannels] = useState([]);
  const [pricings, setPricings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (productId) loadPricing();
    else setLoading(false);
  }, [productId]);

  const loadPricing = async () => {
    setLoading(true);
    const [chans, prcs] = await Promise.all([
      base44.entities.SalesChannel.filter({ active: true }),
      base44.entities.ProductPricing.filter({ product_id: productId }),
    ]);
    setChannels(chans);
    setPricings(prcs);
    setLoading(false);
  };

  const getPricing = (channelId) => pricings.find(p => p.channel_id === channelId);

  const handleFieldChange = (channelId, field, value) => {
    setPricings(prev => {
      const existing = prev.find(p => p.channel_id === channelId);
      if (existing) {
        return prev.map(p => p.channel_id === channelId ? { ...p, [field]: value } : p);
      }
      return [...prev, { product_id: productId, channel_id: channelId, price: 0, price_promotional: 0, [field]: value }];
    });
  };

  const saveField = async (channelId) => {
    const pricing = pricings.find(p => p.channel_id === channelId);
    if (!pricing) return;
    if (pricing.id) {
      await base44.entities.ProductPricing.update(pricing.id, { price: pricing.price || 0, price_promotional: pricing.price_promotional });
    } else {
      const created = await base44.entities.ProductPricing.create({ product_id: productId, channel_id: channelId, price: pricing.price || 0, price_promotional: pricing.price_promotional });
      setPricings(prev => prev.map(p => p.channel_id === channelId ? created : p));
    }
  };

  const calcMargin = (price, channel) => {
    if (!price || price <= 0) return null;
    const commission = price * (channel.commission_percent || 0) / 100;
    const cost = (costLandedBrl || 0) + commission + (channel.fixed_fee || 0);
    return ((price - cost) / price) * 100;
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  if (!channels.length) return <p className="text-sm text-muted-foreground text-center py-4">Nenhum canal de venda ativo. Cadastre canais na página "Canais de Venda".</p>;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Canal</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Preço (R$)</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs hidden sm:table-cell">Promocional</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs hidden sm:table-cell">Margem</th>
          </tr>
        </thead>
        <tbody>
          {channels.map(ch => {
            const pricing = getPricing(ch.id) || {};
            const price = pricing.price || 0;
            const margin = calcMargin(price, ch);
            return (
              <tr key={ch.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <p className="font-medium text-xs">{ch.name}</p>
                  <p className="text-[10px] text-muted-foreground">{ch.commission_percent || 0}% comiss{ch.fixed_fee ? ` + ${formatBRL(ch.fixed_fee)}` : ""}</p>
                </td>
                <td className="px-3 py-2">
                  <Input type="number" step="0.01" className="h-8 w-28 text-right text-xs ml-auto" value={price || ""} onChange={e => handleFieldChange(ch.id, "price", parseFloat(e.target.value) || 0)} onBlur={() => saveField(ch.id)} placeholder="0,00" />
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  <Input type="number" step="0.01" className="h-8 w-28 text-right text-xs ml-auto" value={pricing.price_promotional || ""} onChange={e => handleFieldChange(ch.id, "price_promotional", parseFloat(e.target.value) || 0)} onBlur={() => saveField(ch.id)} placeholder="0,00" />
                </td>
                <td className="px-3 py-2 text-right hidden sm:table-cell">
                  {margin != null ? (
                    <span className={`text-xs font-medium ${margin >= 0 ? "text-success" : "text-destructive"}`}>{margin.toFixed(1)}%</span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}