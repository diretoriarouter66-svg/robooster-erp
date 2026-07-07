export const CONTAINER_TYPES = {
  '20ft': { label: 'Container 20ft', volume_m3: 33.2, max_weight_kg: 28000 },
  '40ft': { label: 'Container 40ft', volume_m3: 67.7, max_weight_kg: 30000 },
  '40HC': { label: 'Container 40HC', volume_m3: 76.4, max_weight_kg: 30000 },
  'LCL': { label: 'LCL (Consolidado)', volume_m3: Infinity, max_weight_kg: Infinity }
};

export function calcItemVolume(product) {
  const l = product.length_cm || 0;
  const w = product.width_cm || 0;
  const h = product.height_cm || 0;
  if (!l || !w || !h) return 0;
  return (l * w * h) / 1_000_000;
}

export function calcCubage(itens, products, containerTipo) {
  const container = CONTAINER_TYPES[containerTipo] || CONTAINER_TYPES['40HC'];
  const detalhes = (itens || []).map(item => {
    const product = products.find(p => p.id === item.product_id) || item;
    const unitVolume = calcItemVolume(product);
    const totalVolume = unitVolume * (item.qty || 0);
    const unitWeight = product.weight_kg || 0;
    const totalWeight = unitWeight * (item.qty || 0);
    return {
      product_id: item.product_id,
      product_name: item.product_name || product.name,
      sku: item.sku || product.sku,
      qty: item.qty,
      unit_volume_m3: unitVolume,
      total_volume_m3: totalVolume,
      unit_weight_kg: unitWeight,
      total_weight_kg: totalWeight
    };
  });
  const totalVolume = detalhes.reduce((s, d) => s + d.total_volume_m3, 0);
  const totalWeight = detalhes.reduce((s, d) => s + d.total_weight_kg, 0);
  const ocupacaoPct = container.volume_m3 === Infinity ? 0 : (totalVolume / container.volume_m3) * 100;
  const cabe = container.volume_m3 === Infinity || (totalVolume <= container.volume_m3 && totalWeight <= container.max_weight_kg);
  return {
    container_tipo: containerTipo,
    container_label: container.label,
    container_volume_m3: container.volume_m3,
    container_max_weight_kg: container.max_weight_kg,
    total_volume_m3: totalVolume,
    total_weight_kg: totalWeight,
    ocupacao_pct: ocupacaoPct,
    cabe,
    detalhes
  };
}

export function calcLandedCost(operation, products, config) {
  const cambio = operation.cambio || (config?.cambio_usd || 5.3);
  const itens = operation.itens || [];
  const freteIntl = operation.frete_internacional_usd || 0;
  const seguro = operation.seguro_usd || 0;
  const despesasLocais = operation.despesas_locais_usd || 0;
  const freteContainer = operation.frete_container_usd || 0;

  const itemData = itens.map(item => {
    const product = products.find(p => p.id === item.product_id) || item;
    const fobUnit = product.cost_fob_usd || 0;
    const qty = item.qty || 0;
    const fobTotal = fobUnit * qty;
    return { item, product, fobUnit, fobTotal, qty };
  });

  const totalFOB = itemData.reduce((s, i) => s + i.fobTotal, 0);

  const resultItens = itemData.map(({ item, product, fobUnit, fobTotal, qty }) => {
    const fobProp = totalFOB > 0 ? fobTotal / totalFOB : 0;
    const fobBRL = fobTotal * cambio;
    const freteRateadoBRL = (freteIntl + freteContainer) * fobProp * cambio;
    const seguroRateadoBRL = seguro * fobProp * cambio;
    const despesasRateadoBRL = despesasLocais * fobProp * cambio;

    const va = (fobTotal + (freteIntl + freteContainer) * fobProp + seguro * fobProp) * cambio + despesasLocais * fobProp * cambio;

    let iiRate = product.ii_rate || 0;
    if (item.ex_tarifario) iiRate = 0;
    const ii = va * iiRate / 100;

    const ipiRate = product.ipi_rate || 0;
    const ipi = (va + ii) * ipiRate / 100;

    const pisRate = product.pis_rate ?? 2.1;
    const pis = va * pisRate / 100;

    const cofinsRate = product.cofins_rate ?? 9.65;
    const cofins = va * cofinsRate / 100;

    const icmsRate = product.icms_rate || 18;
    let icmsBase = va + ii + ipi + pis + cofins + despesasRateadoBRL;
    if (item.beneficio_5291) {
      icmsBase = va + ii + ipi + despesasRateadoBRL;
    }
    const icms = icmsBase / (1 - icmsRate / 100) * icmsRate / 100;

    const ipiCredit = item.ipi_recuperavel ? ipi : 0;
    const totalCost = fobBRL + freteRateadoBRL + seguroRateadoBRL + despesasRateadoBRL + ii + ipi + pis + cofins + icms - ipiCredit;
    const unitLandedCost = qty > 0 ? totalCost / qty : 0;

    return {
      product_id: item.product_id,
      product_name: item.product_name || product.name,
      sku: item.sku || product.sku,
      qty,
      fob_unit_usd: fobUnit,
      fob_total_usd: fobTotal,
      fob_total_brl: fobBRL,
      frete_brl: freteRateadoBRL,
      seguro_brl: seguroRateadoBRL,
      despesas_locais_brl: despesasRateadoBRL,
      valor_aduaneiro: va,
      ii_rate: iiRate, ii,
      ipi_rate: ipiRate, ipi,
      pis_rate: pisRate, pis,
      cofins_rate: cofinsRate, cofins,
      icms_base: icmsBase, icms_rate: icmsRate, icms,
      ipi_credit: ipiCredit,
      total_cost: totalCost,
      unit_landed_cost: unitLandedCost,
      beneficio_5291: !!item.beneficio_5291,
      ex_tarifario: !!item.ex_tarifario,
      ipi_recuperavel: !!item.ipi_recuperavel
    };
  });

  return {
    cambio,
    total_fob_usd: totalFOB,
    total_fob_brl: totalFOB * cambio,
    total_frete_brl: (freteIntl + freteContainer) * cambio,
    total_seguro_brl: seguro * cambio,
    total_despesas_locais_brl: despesasLocais * cambio,
    total_ii: resultItens.reduce((s, i) => s + i.ii, 0),
    total_ipi: resultItens.reduce((s, i) => s + i.ipi, 0),
    total_pis: resultItens.reduce((s, i) => s + i.pis, 0),
    total_cofins: resultItens.reduce((s, i) => s + i.cofins, 0),
    total_icms: resultItens.reduce((s, i) => s + i.icms, 0),
    total_ipi_credit: resultItens.reduce((s, i) => s + i.ipi_credit, 0),
    total_landed: resultItens.reduce((s, i) => s + i.total_cost, 0),
    itens: resultItens
  };
}

export function calcDRE(operation, vendas, config, socios, mixGeo, meses, comissaoPerc, saldoCredorICMS) {
  const landedResult = operation.resultado_importacao || {};
  const landedItens = landedResult.itens || [];

  const vendasData = (vendas || []).map(v => {
    const landed = landedItens.find(l => l.product_id === v.product_id) || {};
    const custoUnit = landed.unit_landed_cost || 0;
    const icmsCreditUnit = landed.qty > 0 ? (landed.icms || 0) / landed.qty : 0;
    return {
      product_id: v.product_id,
      product_name: v.product_name,
      sku: v.sku,
      qty: v.qty,
      preco_venda: v.preco_venda || 0,
      custo_landed_unit: custoUnit,
      custo_landed_total: custoUnit * v.qty,
      receita_total: (v.preco_venda || 0) * v.qty,
      icms_credit_unit: icmsCreditUnit,
      icms_credit_total: icmsCreditUnit * v.qty,
      icms_rate: landed.icms_rate || 18
    };
  });

  const receitaBruta = vendasData.reduce((s, v) => s + v.receita_total, 0);
  const pctInterna = mixGeo?.interna ?? 100;
  const pctInterestadual = mixGeo?.interestadual ?? 0;
  const icmsInterestadualConfig = config?.icms_interestadual_importado || 4;

  const icmsVenda = vendasData.reduce((s, v) => {
    const interna = v.receita_total * (pctInterna / 100) * (v.icms_rate / 100);
    const interestadual = v.receita_total * (pctInterestadual / 100) * (icmsInterestadualConfig / 100);
    return s + interna + interestadual;
  }, 0);

  const icmsCredit = vendasData.reduce((s, v) => s + v.icms_credit_total, 0);
  const icmsDevido = Math.max(0, icmsVenda - icmsCredit - (saldoCredorICMS || 0));

  const pisVenda = receitaBruta * (config?.pis_venda || 0.65) / 100;
  const cofinsVenda = receitaBruta * (config?.cofins_venda || 3) / 100;
  const receitaLiquida = receitaBruta - icmsDevido - pisVenda - cofinsVenda;
  const cmv = vendasData.reduce((s, v) => s + v.custo_landed_total, 0);
  const lucroBruto = receitaLiquida - cmv;

  const despesasFixas = (config?.despesas_fixas || []).reduce((s, d) => s + (d.valor || 0), 0) * meses;
  const comissao = receitaBruta * (comissaoPerc || 0) / 100;
  const resultadoOp = lucroBruto - despesasFixas - comissao;

  const baseIRPJ = receitaBruta * (config?.presuncao_irpj || 8) / 100;
  const baseCSLL = receitaBruta * (config?.presuncao_csll || 12) / 100;
  const irpjNormal = baseIRPJ * (config?.aliq_irpj || 15) / 100;
  const adicionalLimite = config?.adicional_irpj_limite || 60000;
  const adicionalIRPJ = baseIRPJ > adicionalLimite ? (baseIRPJ - adicionalLimite) * (config?.adicional_irpj_aliq || 10) / 100 : 0;
  const irpjTotal = irpjNormal + adicionalIRPJ;
  const csll = baseCSLL * (config?.aliq_csll || 9) / 100;
  const lucroLiquido = resultadoOp - irpjTotal - csll;
  const margemPct = receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0;

  const irrfPerc = config?.irrf_dividendos || 10;
  const irrfPiso = config?.irrf_piso_residente || 50000;

  const sociosDist = (socios || []).map(s => {
    const participacao = s.percentual_participacao || 0;
    const dividendosBrutos = lucroLiquido * participacao / 100;
    const dividendosMensal = dividendosBrutos / meses;
    let irrf = 0;
    if (s.residente_fiscal_brasil !== false && dividendosMensal > irrfPiso) {
      irrf = (dividendosMensal - irrfPiso) * irrfPerc / 100 * meses;
    } else if (s.residente_fiscal_brasil === false) {
      irrf = dividendosBrutos * irrfPerc / 100;
    }
    return {
      nome: s.nome,
      participacao,
      residente: s.residente_fiscal_brasil !== false,
      dividendos_brutos: dividendosBrutos,
      irrf,
      dividendos_liquidos: dividendosBrutos - irrf
    };
  });

  return {
    receita_bruta: receitaBruta,
    icms_venda: icmsVenda, icms_credit: icmsCredit, saldo_credor_inicial: saldoCredorICMS || 0, icms_devido: icmsDevido,
    pis_venda: pisVenda, cofins_venda: cofinsVenda,
    receita_liquida: receitaLiquida, cmv, lucro_bruto: lucroBruto,
    despesas_fixas: despesasFixas, comissao, resultado_operacional: resultadoOp,
    base_irpj: baseIRPJ, base_csll: baseCSLL,
    irpj_normal: irpjNormal, adicional_irpj: adicionalIRPJ, irpj_total: irpjTotal, csll,
    lucro_liquido: lucroLiquido, margem_pct: margemPct, meses,
    socios: sociosDist, vendas_detalhe: vendasData
  };
}

export function formatBRL(val) {
  if (val == null || isNaN(val)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}
export function formatUSD(val) {
  if (val == null || isNaN(val)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}
export function formatPct(val) {
  if (val == null || isNaN(val)) return "—";
  return `${val.toFixed(1)}%`;
}
export function formatNumber(val, decimals = 2) {
  if (val == null || isNaN(val)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val);
}