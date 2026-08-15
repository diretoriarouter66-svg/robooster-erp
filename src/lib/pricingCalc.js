export function getCustoVigente(product) {
  if (product.cost_landed_brl != null && product.cost_landed_brl > 0) return product.cost_landed_brl;
  return product.custo_manual_brl || 0;
}

export function hasCostLanded(product) {
  return product.cost_landed_brl != null && product.cost_landed_brl > 0;
}

import { isSimples, simplesEfetivaPct } from "@/lib/taxEngine";

/**
 * Impostos sobre a venda, por regime:
 * — SIMPLES (padrão): DAS pela alíquota efetiva do Anexo I (RBT12 na config).
 *   O DAS engloba ICMS/PIS/COFINS/IRPJ/CSLL — a alíquota de ICMS do canal é ignorada.
 * — LUCRO PRESUMIDO: PIS + COFINS + ICMS (canal ou produto) + IRPJ/CSLL sobre presunção.
 */
export function calcImpostosPct(config, product, channel) {
  if (isSimples(config)) {
    const das = simplesEfetivaPct(config?.rbt12 || 0);
    return { regime: "simples", pis: 0, cofins: 0, icms: 0, irpjEfetivo: 0, csllEfetiva: 0, das, total: das };
  }
  const pis = config?.pis_venda || 0;
  const cofins = config?.cofins_venda || 0;
  const icmsProduto = product?.beneficio_5291 ? 8.8 : (product?.icms_rate || 0);
  const icms = (channel?.aliq_icms_venda != null && channel?.aliq_icms_venda !== "") ? channel.aliq_icms_venda : icmsProduto;
  const irpjEfetivo = (config?.presuncao_irpj || 0) * (config?.aliq_irpj || 0) / 100;
  const csllEfetiva = (config?.presuncao_csll || 0) * (config?.aliq_csll || 0) / 100;
  return { regime: "presumido", pis, cofins, icms, irpjEfetivo, csllEfetiva, das: 0, total: pis + cofins + icms + irpjEfetivo + csllEfetiva };
}

export function getMasterChannel(channels) {
  if (!channels?.length) return null;
  return channels.find(c => c.is_master)
    || channels.find(c => (c.commission_percent || 0) === 0 && (c.fixed_fee || 0) === 0)
    || channels[0];
}

export function getSellerCommissionPct(product, config) {
  return product?.seller_commission_percent ?? config?.comissao_vendedor_padrao ?? 0;
}

export function calcSellerCommissionRs(masterPrice, impostosPctTotal, sellerCommissionPct) {
  return masterPrice * (1 - impostosPctTotal / 100) * (sellerCommissionPct / 100);
}

export function calcMasterPriceFromMargin(targetMargemLiquidaPct, custo, impostosPctTotal, sellerCommissionPct, frete, indiceCustoFixo) {
  const denom = 1 - impostosPctTotal / 100 - (1 - impostosPctTotal / 100) * (sellerCommissionPct / 100) - targetMargemLiquidaPct / 100;
  if (denom <= 0) return 0;
  return (custo * (1 + indiceCustoFixo) + frete) / denom;
}

/**
 * Markup sobre o Custo (%) — fórmula fiel ao Precificador original (MasterPricingCockpit):
 * denominator = 1 - T - CC - ((1 - T) * SC)
 * idealPrice = (PC * (1 + markup) + CF + S) / denominator
 */
export function calcMasterPriceFromMarkup(markupPct, custo, impostosPctTotal, channelCommissionPct, channelFixedFee, sellerCommissionPct, frete) {
  const T = impostosPctTotal / 100;
  const CC = (channelCommissionPct || 0) / 100;
  const SC = (sellerCommissionPct || 0) / 100;
  const denom = 1 - T - CC - (1 - T) * SC;
  if (denom <= 0) return 0;
  return (custo * (1 + markupPct / 100) + (channelFixedFee || 0) + (frete || 0)) / denom;
}

export function calcChannelPrice(margemBrutaAlvo, channel, custo, impostosPctTotal, sellerCommissionRs, frete) {
  const denom = 1 - impostosPctTotal / 100 - (channel.commission_percent || 0) / 100;
  if (denom <= 0) return 0;
  return (margemBrutaAlvo + custo + (channel.fixed_fee || 0) + frete + sellerCommissionRs) / denom;
}

export function calcChannelBreakdown(price, channel, custo, impostosPctTotal, sellerCommissionRs, frete, clientePagaFrete, indiceCustoFixo) {
  const freteEff = clientePagaFrete ? 0 : (frete || 0);
  const impostos = price * impostosPctTotal / 100;
  const comissaoCanal = price * (channel.commission_percent || 0) / 100;
  const margemBruta = price - custo - impostos - comissaoCanal - sellerCommissionRs - freteEff;
  const margemBrutaPct = price > 0 ? (margemBruta / price) * 100 : 0;
  const custoFixoAlocado = indiceCustoFixo * custo;
  const margemLiquida = margemBruta - custoFixoAlocado;
  const margemLiquidaPct = price > 0 ? (margemLiquida / price) * 100 : 0;
  const markup = custo > 0 ? ((price - custo) / custo) * 100 : 0;
  return {
    price, custo, impostos, comissaoCanal, sellerCommission: sellerCommissionRs,
    frete: freteEff, margemBruta, margemBrutaPct, custoFixoAlocado, margemLiquida, margemLiquidaPct, markup
  };
}

export function formatBRL(val) {
  if (val == null || isNaN(val)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}
export function formatPct(val) {
  if (val == null || isNaN(val)) return "—";
  return `${val.toFixed(2)}%`;
}