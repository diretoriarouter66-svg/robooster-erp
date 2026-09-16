/**
 * ROBOOSTER ERP — Motor de Cálculo de Importação e Revenda (Lucro Presumido 2026)
 * Portado integralmente do app SimPort/Lucro Presumido (calcEngine.js validado).
 * NÃO ALTERAR A MATEMÁTICA DESTE ARQUIVO — é a fonte única de verdade dos cálculos.
 *
 * REGIME SIMPLES NACIONAL (15/08/2026): adicionado como CAMADA, sem tocar nas
 * fórmulas do Presumido — quando config.regime === 'simples':
 *  · importação: NENHUM crédito (ICMS-imp, IPI, PIS/COFINS-imp viram custo);
 *  · venda: DAS único pela alíquota efetiva do Anexo I (lib/taxEngine.js).
 *
 * Inclui adaptadores no final: produtoFromProduct() e configParaMotor()
 * para converter as entidades do ERP (Product, ConfigTributaria) ao formato do motor.
 */

import { simplesEfetivaPct } from "@/lib/taxEngine";

// ============================================================
// A) CUSTO DE IMPORTAÇÃO
// ============================================================

export function calcularCustoImportacao(produto, quantidade, operacao, rateio, config, dataCompetencia = "2026-01-01", pctDeclarado = 1.0) {
  const regime = selecionarRegime(dataCompetencia);
  if (regime === 'CBS') {
    return calcularCustoImportacaoCBS(produto, quantidade, operacao, rateio, config);
  }

  /* DOIS CÂMBIOS (regra 18/08/2026): a mercadoria foi paga no câmbio das REMESSAS
   * (operacao.cambio, médio ponderado) — é o custo do fornecedor. Mas a carga chega
   * 30-40 dias depois, e IMPOSTOS + FRETE são calculados no dólar da CHEGADA/DI
   * (operacao.cambio_chegada). Sem cambio_chegada informado, usa o das remessas. */
  const cambio = operacao.cambio;
  const cambio_di = parseFloat(operacao.cambio_chegada) || cambio;

  // FOB total em BRL — valor REAL pago ao fornecedor (câmbio das remessas)
  const fob_total_usd = produto.fob_unitario_usd * quantidade;
  const fob_total_brl = fob_total_usd * cambio;

  // Frete e seguro rateados em BRL — pagos na chegada (câmbio da DI)
  const frete_rateado_brl = rateio.frete_rateado_usd * cambio_di;
  const seguro_rateado_brl = (rateio.seguro_rateado_usd || 0) * cambio_di;

  // Valor Aduaneiro: se o produto traz FOB DECLARADO próprio (por item da operação),
  // o VA usa o declarado + frete/seguro REAIS (como na DI). Senão, cai no modo
  // estimativa antiga (percentual global). VA declarado usa o câmbio da CHEGADA.
  const va_real = fob_total_brl + frete_rateado_brl + seguro_rateado_brl;
  let va;
  if (produto.nao_declarado) {
    // item que NÃO aparece na invoice (acompanha a máquina): sem VA, sem impostos,
    // sem rateios — o custo dele é só o preço real × câmbio.
    va = 0;
  } else if (produto.fob_declarado_unitario_usd !== undefined && produto.fob_declarado_unitario_usd !== null) {
    const fob_declarado_brl = produto.fob_declarado_unitario_usd * quantidade * cambio_di;
    va = fob_declarado_brl + frete_rateado_brl + seguro_rateado_brl;
  } else {
    va = va_real * pctDeclarado;
  }

  // II — zerado se ex-tarifário vigente
  const exTarifarioVigente = produto.ex_tarifario && isExTarifarioValido(produto.ex_tarifario_validade, dataCompetencia);
  const aliq_ii = exTarifarioVigente ? 0 : produto.aliq_ii / 100;
  const ii = va * aliq_ii;

  // IPI
  const aliq_ipi = produto.aliq_ipi / 100;
  const ipi = (va + ii) * aliq_ipi;

  // PIS/COFINS importação — base = VA somente (Lei 10.865/2004)
  const aliq_pis_imp = produto.aliq_pis_imp / 100;
  const aliq_cofins_imp = produto.aliq_cofins_imp / 100;
  const pis_imp = va * aliq_pis_imp;
  const cofins_imp = va * aliq_cofins_imp;

  // Despesas aduaneiras rateadas em BRL
  const despesas_brl = rateio.despesas_rateadas_usd * cambio;
  const desconto_brl = (rateio.desconto_rateado_usd || 0) * cambio;

  // ICMS importação — base NÃO inclui despesas aduaneiras
  const aliq_icms_efetiva = produto.beneficio_5291 ? 0.088 : produto.aliq_icms / 100;
  const base_icms_antes = va + ii + ipi + pis_imp + cofins_imp;
  const base_icms = base_icms_antes / (1 - aliq_icms_efetiva);
  const icms_imp = base_icms * aliq_icms_efetiva;

  // CUSTO_FORMACAO_PRECO usa VA REAL, impostos calculados sobre VA declarado
  const ipi_no_custo = produto.ipi_recuperavel ? 0 : ipi;
  const custo_formacao_preco = va_real + ii + ipi_no_custo + pis_imp + cofins_imp + despesas_brl - desconto_brl;

  // DESEMBOLSO_CAIXA = CUSTO_FORMACAO_PRECO + ICMS_imp + [IPI se recuperável]
  const ipi_desembolso = produto.ipi_recuperavel ? ipi : 0;
  const desembolso_caixa = custo_formacao_preco + icms_imp + ipi_desembolso;

  // Créditos gerados
  const credito_icms = icms_imp;
  const credito_ipi = produto.ipi_recuperavel ? ipi : 0;

  // Economia de ex-tarifário
  let economia_ex_tarifario = null;
  if (exTarifarioVigente) {
    const ii_cheio = va * (produto.aliq_ii / 100);
    const base_icms_cheio_antes = va + ii_cheio + ipi + pis_imp + cofins_imp;
    const base_icms_cheio = base_icms_cheio_antes / (1 - aliq_icms_efetiva);
    const icms_cheio = base_icms_cheio * aliq_icms_efetiva;
    const economia_ii = ii_cheio;
    const economia_icms = icms_cheio - icms_imp;
    economia_ex_tarifario = {
      economia_ii: arred(economia_ii),
      economia_icms: arred(economia_icms),
      economia_total: arred(economia_ii + economia_icms),
    };
  }

  const resultado = {
    quantidade,
    cambio_mercadoria: cambio,
    cambio_di,
    fob_total_usd: arred(fob_total_usd),
    fob_total_brl: arred(fob_total_brl),
    frete_rateado_brl: arred(frete_rateado_brl),
    seguro_rateado_brl: arred(seguro_rateado_brl),
    va_real: arred(va_real),
    va: arred(va),
    pct_declarado: va_real > 0 ? arred(va / va_real) : 1,
    ii: arred(ii),
    ipi: arred(ipi),
    pis_imp: arred(pis_imp),
    cofins_imp: arred(cofins_imp),
    despesas_brl: arred(despesas_brl),
    desconto_brl: arred(desconto_brl),
    aliq_icms_efetiva,
    base_icms: arred(base_icms),
    icms_imp: arred(icms_imp),
    custo_formacao_preco: arred(custo_formacao_preco),
    desembolso_caixa: arred(desembolso_caixa),
    custo_unitario_formacao: arred(custo_formacao_preco / quantidade),
    custo_unitario_desembolso: arred(desembolso_caixa / quantidade),
    credito_icms: arred(credito_icms),
    credito_ipi: arred(credito_ipi),
    ex_tarifario_vigente: exTarifarioVigente,
    economia_ex_tarifario,
  };

  // SIMPLES: nada se recupera — ICMS-imp e IPI (mesmo "recuperável") entram no custo.
  if ((config?.regime || "") === "simples") {
    const custoSimples = custo_formacao_preco + icms_imp + (produto.ipi_recuperavel ? ipi : 0);
    resultado.custo_formacao_preco = arred(custoSimples);
    resultado.desembolso_caixa = arred(custoSimples);
    resultado.custo_unitario_formacao = arred(custoSimples / quantidade);
    resultado.custo_unitario_desembolso = arred(custoSimples / quantidade);
    resultado.credito_icms = 0;
    resultado.credito_ipi = 0;
    resultado.regime = "simples";
  }

  return resultado;
}

/**
 * Rateios: frete por volume (m³); despesas locais e seguro por valor FOB.
 */
export const CAIXA_PECAS_PADRAO = { c_mm: 600, l_mm: 400, a_mm: 400, qtd: 1 };

/* Peças com embalagem_consolidada viajam TODAS dentro de uma caixa única:
 * o volume individual delas não existe — o que ocupa espaço (e paga frete por m³)
 * é a caixa consolidada. O volume da caixa é repartido entre as peças por valor FOB. */
/* Volume unitário de um produto (m³): soma TODOS os volumes/caixas dele.
 * produto.volumes (quando existe) é a lista completa das caixas por unidade. */
function volumeUnitarioM3(produto) {
  if (Array.isArray(produto.volumes) && produto.volumes.length) {
    return produto.volumes.reduce((s, v) => s + ((v.c_mm || 0) * (v.l_mm || 0) * (v.a_mm || 0)) / 1e9, 0);
  }
  return (produto.caixa_c_mm * produto.caixa_l_mm * produto.caixa_a_mm) / 1e9;
}

function volumesEfetivos(itens, operacao) {
  const caixa = operacao?.caixa_pecas || CAIXA_PECAS_PADRAO;
  const qtdCaixas = Math.max(1, parseInt(caixa.qtd, 10) || 1);
  const caixaVol = qtdCaixas * ((caixa.c_mm || 0) * (caixa.l_mm || 0) * (caixa.a_mm || 0)) / 1e9;
  const consolidados = itens.filter(i => i.produto.embalagem_consolidada);
  const fobConsolidado = consolidados.reduce((s, i) => s + i.produto.fob_unitario_usd * i.quantidade, 0);
  return itens.map(i => {
    if (i.produto.embalagem_consolidada) {
      if (!consolidados.length) return 0;
      const fobItem = i.produto.fob_unitario_usd * i.quantidade;
      return fobConsolidado > 0 ? caixaVol * (fobItem / fobConsolidado) : caixaVol / consolidados.length;
    }
    return volumeUnitarioM3(i.produto) * i.quantidade;
  });
}

export function calcularRateios(itens, operacao) {
  const conta = (i) => !i.produto.nao_declarado; // não declarado não participa dos rateios
  const totalFobUsd = itens.reduce((s, i) => s + (conta(i) ? i.produto.fob_unitario_usd * i.quantidade : 0), 0);
  // Desconto do fornecedor rateia por valor REAL entre TODOS os itens (inclusive
  // não declarados): é dinheiro que deixou de ser pago, abate custo — nunca imposto.
  const totalFobRealTodos = itens.reduce((s, i) => s + i.produto.fob_unitario_usd * i.quantidade, 0);
  const vols = volumesEfetivos(itens, operacao);
  const totalVolM3 = vols.reduce((s, v, ix) => s + (conta(itens[ix]) ? v : 0), 0);

  return itens.map((item, _idx) => {
    const fobRealItem = item.produto.fob_unitario_usd * item.quantidade;
    const desconto_rateado_usd = totalFobRealTodos > 0
      ? ((operacao.desconto_fornecedor_usd || 0) * fobRealItem / totalFobRealTodos)
      : 0;
    if (!conta(item)) {
      return { produto_id: item.produto.id || item.produto.nome, frete_rateado_usd: 0, despesas_rateadas_usd: 0, seguro_rateado_usd: 0, desconto_rateado_usd };
    }
    const fobUsd = fobRealItem;
    const volM3 = vols[_idx];

    const frete_rateado_usd = totalVolM3 > 0
      ? (operacao.frete_internacional_usd * volM3 / totalVolM3)
      : 0;
    // Despesas locais são pagas em REAIS (despachante, porto, armazenagem):
    // despesas_locais_brl tem prioridade; despesas_locais_usd é legado.
    const despesasTotaisUsd = (operacao.despesas_locais_brl !== undefined && operacao.despesas_locais_brl !== null && operacao.despesas_locais_brl !== "")
      ? (parseFloat(operacao.despesas_locais_brl) || 0) / (operacao.cambio || 1)
      : (operacao.despesas_locais_usd || 0);
    const despesas_rateadas_usd = totalFobUsd > 0
      ? (despesasTotaisUsd * fobUsd / totalFobUsd)
      : 0;
    const seguro_rateado_usd = totalFobUsd > 0
      ? ((operacao.seguro_usd || 0) * fobUsd / totalFobUsd)
      : 0;

    return {
      produto_id: item.produto.id || item.produto.nome,
      frete_rateado_usd,
      despesas_rateadas_usd,
      seguro_rateado_usd,
      desconto_rateado_usd,
    };
  });
}

export function calcularOperacaoImportacao(itens, operacao, config, dataCompetencia = "2026-01-01", pctDeclarado = 1.0) {
  const rateios = calcularRateios(itens, operacao);

  const resultados = itens.map((item, idx) => {
    const resultado = calcularCustoImportacao(
      item.produto, item.quantidade, operacao, rateios[idx], config, dataCompetencia, pctDeclarado
    );
    return { ...resultado, produto: item.produto };
  });

  const totais = {
    fob_total_brl: somarCampo(resultados, 'fob_total_brl'),
    va: somarCampo(resultados, 'va'),
    ii: somarCampo(resultados, 'ii'),
    ipi: somarCampo(resultados, 'ipi'),
    pis_imp: somarCampo(resultados, 'pis_imp'),
    cofins_imp: somarCampo(resultados, 'cofins_imp'),
    despesas_brl: somarCampo(resultados, 'despesas_brl'),
    desconto_brl: somarCampo(resultados, 'desconto_brl'),
    icms_imp: somarCampo(resultados, 'icms_imp'),
    custo_formacao_preco: somarCampo(resultados, 'custo_formacao_preco'),
    desembolso_caixa: somarCampo(resultados, 'desembolso_caixa'),
    credito_icms: somarCampo(resultados, 'credito_icms'),
    credito_ipi: somarCampo(resultados, 'credito_ipi'),
  };

  const economia_total = resultados.reduce((s, r) => {
    if (r.economia_ex_tarifario) return s + r.economia_ex_tarifario.economia_total;
    return s;
  }, 0);

  return { resultados, totais, economia_ex_tarifario_total: arred(economia_total) };
}

// ============================================================
// B) IMPOSTOS SOBRE A VENDA
// ============================================================

export function calcularImpostosVenda(vendas, config, saldoCredorIcms = 0, saldoCredorIpi = 0, dataCompetencia = "2026-01-01", mixGeografico = null) {
  if ((config?.regime || "") === "simples") {
    return calcularImpostosVendaSimples(vendas, config);
  }
  const regime = selecionarRegime(dataCompetencia);
  if (regime === 'CBS') {
    return calcularImpostosVendaCBS(vendas, config, saldoCredorIcms, saldoCredorIpi);
  }

  const receita = vendas.reduce((s, v) => s + v.preco_unitario * v.quantidade, 0);

  const pis_venda = receita * config.pis_venda;
  const cofins_venda = receita * config.cofins_venda;

  let icms_debito = 0;
  let detalheIcms = [];
  let detalheIcmsPorFaixa = null;

  if (mixGeografico) {
    const { pct_sp, pct_sul_sudeste, pct_norte_ne_co_es } = mixGeografico;

    let debito_sp = 0, debito_ss = 0, debito_nne = 0;
    let difal_sp = 0, difal_ss = 0, difal_nne = 0;

    detalheIcms = vendas.map(v => {
      const rec = v.preco_unitario * v.quantidade;
      const exVigente = v.produto.ex_tarifario && isExTarifarioValido(v.produto.ex_tarifario_validade, dataCompetencia);

      const aliq_sp = v.produto.beneficio_5291 ? 0.088 : v.produto.aliq_icms / 100;
      let aliq_ss, aliq_nne;
      if (exVigente) {
        aliq_ss  = 0.088;   // 12% × carga reduzida Conv. 52/91 → 8,8%
        aliq_nne = 0.0514;  // 7% × carga reduzida Conv. 52/91 → 5,14%
      } else {
        aliq_ss  = config.icms_interestadual_importado; // 0.04
        aliq_nne = config.icms_interestadual_importado; // 0.04
      }

      const d_sp  = rec * pct_sp  * aliq_sp;
      const d_ss  = rec * pct_sul_sudeste  * aliq_ss;
      const d_nne = rec * pct_norte_ne_co_es * aliq_nne;

      debito_sp  += d_sp;
      debito_ss  += d_ss;
      debito_nne += d_nne;

      const difal_aliq_sp  = 0;
      const difal_aliq_ss  = exVigente ? 0 : 0.048;
      const difal_aliq_nne = exVigente ? 0.0366 : 0.048;
      const df_sp  = rec * pct_sp  * difal_aliq_sp;
      const df_ss  = rec * pct_sul_sudeste  * difal_aliq_ss;
      const df_nne = rec * pct_norte_ne_co_es * difal_aliq_nne;
      difal_sp  += df_sp;
      difal_ss  += df_ss;
      difal_nne += df_nne;

      return {
        produto_nome: v.produto.nome,
        ex_tarifario_vigente: exVigente,
        receita: arred(rec),
        debito_sp: arred(d_sp), aliq_sp,
        debito_sul_sudeste: arred(d_ss), aliq_sul_sudeste: aliq_ss,
        debito_norte_ne_co_es: arred(d_nne), aliq_norte_ne_co_es: aliq_nne,
        difal_sul_sudeste: arred(df_ss),
        difal_norte_ne_co_es: arred(df_nne),
      };
    });

    icms_debito = debito_sp + debito_ss + debito_nne;

    detalheIcmsPorFaixa = {
      sp:  { pct: pct_sp,  debito: arred(debito_sp),  difal: arred(difal_sp) },
      sul_sudeste:  { pct: pct_sul_sudeste, debito: arred(debito_ss), difal: arred(difal_ss) },
      norte_ne_co_es: { pct: pct_norte_ne_co_es, debito: arred(debito_nne), difal: arred(difal_nne) },
    };

  } else {
    detalheIcms = vendas.map(v => {
      let aliq;
      if (v.tipo === 'interestadual') {
        aliq = config.icms_interestadual_importado;
      } else {
        aliq = v.produto.beneficio_5291 ? 0.088 : v.produto.aliq_icms / 100;
      }
      const debito = v.preco_unitario * v.quantidade * aliq;
      icms_debito += debito;
      return {
        produto_nome: v.produto.nome,
        tipo: v.tipo,
        aliq,
        receita: arred(v.preco_unitario * v.quantidade),
        debito: arred(debito),
      };
    });
  }

  const icms_a_pagar = Math.max(0, icms_debito - saldoCredorIcms);
  const saldo_credor_icms_remanescente = Math.max(0, saldoCredorIcms - icms_debito);

  const irpj_csll = calcularIrpjCsll(receita, config);

  const total_impostos = pis_venda + cofins_venda + icms_a_pagar + irpj_csll.irpj + irpj_csll.adicional_irpj + irpj_csll.csll;

  return {
    receita: arred(receita),
    pis_venda: arred(pis_venda),
    cofins_venda: arred(cofins_venda),
    icms_debito: arred(icms_debito),
    icms_credito_utilizado: arred(Math.min(saldoCredorIcms, icms_debito)),
    icms_a_pagar: arred(icms_a_pagar),
    saldo_credor_icms_remanescente: arred(saldo_credor_icms_remanescente),
    detalhe_icms: detalheIcms,
    detalhe_icms_por_faixa: detalheIcmsPorFaixa,
    ...irpj_csll,
    total_impostos: arred(total_impostos),
    alerta_acumulo_credito: saldo_credor_icms_remanescente > 0,
  };
}

/**
 * SIMPLES NACIONAL — venda: DAS único pela alíquota efetiva do Anexo I.
 * Devolve o MESMO formato do Presumido (chaves zeradas onde não se aplica)
 * para as telas não quebrarem, + campos das/aliquota_efetiva.
 */
export function calcularImpostosVendaSimples(vendas, config) {
  const receita = vendas.reduce((s, v) => s + v.preco_unitario * v.quantidade, 0);
  const aliqEfetivaPct = simplesEfetivaPct(config?.rbt12 || 0);
  const das = receita * (aliqEfetivaPct / 100);
  return {
    regime: "simples",
    receita: arred(receita),
    pis_venda: 0,
    cofins_venda: 0,
    icms_debito: 0,
    icms_credito_utilizado: 0,
    icms_a_pagar: 0,
    saldo_credor_icms_remanescente: 0,
    detalhe_icms: [],
    detalhe_icms_por_faixa: null,
    irpj: 0,
    adicional_irpj: 0,
    csll: 0,
    das: arred(das),
    aliquota_efetiva: aliqEfetivaPct,
    total_impostos: arred(das),
    alerta_acumulo_credito: false,
  };
}

/**
 * IRPJ e CSLL trimestrais com LC 224/2025.
 */
export function calcularIrpjCsll(receitaTrimestral, config) {
  const limiteTrimestreIrpj = (config.lc224_limite_anual || 5000000) / 4;

  const presuncaoIrpj = config.presuncao_irpj;
  const presuncaoIrpjMajorada = presuncaoIrpj * 1.1;
  let baseIrpj;
  if (receitaTrimestral <= limiteTrimestreIrpj) {
    baseIrpj = receitaTrimestral * presuncaoIrpj;
  } else {
    baseIrpj = limiteTrimestreIrpj * presuncaoIrpj + (receitaTrimestral - limiteTrimestreIrpj) * presuncaoIrpjMajorada;
  }
  const irpj = baseIrpj * config.aliq_irpj;
  const adicional_irpj = Math.max(0, baseIrpj - config.adicional_irpj_limite) * config.adicional_irpj_aliq;

  const presuncaoCsll = config.presuncao_csll;
  const presuncaoCsllMajorada = presuncaoCsll * 1.1;
  let baseCsll;
  if (receitaTrimestral <= limiteTrimestreIrpj) {
    baseCsll = receitaTrimestral * presuncaoCsll;
  } else {
    baseCsll = limiteTrimestreIrpj * presuncaoCsll + (receitaTrimestral - limiteTrimestreIrpj) * presuncaoCsllMajorada;
  }
  const csll = baseCsll * config.aliq_csll;

  return {
    base_irpj: arred(baseIrpj),
    irpj: arred(irpj),
    adicional_irpj: arred(adicional_irpj),
    base_csll: arred(baseCsll),
    csll: arred(csll),
  };
}

// ============================================================
// C) DISTRIBUIÇÃO DE RESULTADOS
// ============================================================

/**
 * IRRF sobre dividendos (Lei 15.270/2025).
 * Residente: parcela mensal > R$ 50.000 → IRRF = 10% sobre o TOTAL do mês.
 * Não-residente: 10% sobre qualquer valor, sem piso.
 */
export function calcularDistribuicao(lucroDistribuivel, socios, config, meses = 1) {
  const pisoResidente = config.irrf_piso_residente || 50000;
  const aliqIrrf = config.irrf_dividendos || 0.10;

  return socios.map(socio => {
    const distribuicaoBruta = lucroDistribuivel * (socio.percentual_participacao / 100);
    let irrf = 0;
    if (!socio.residente_fiscal_brasil) {
      irrf = distribuicaoBruta * aliqIrrf;
    } else {
      const distribuicaoMensal = distribuicaoBruta / meses;
      if (distribuicaoMensal > pisoResidente) {
        irrf = distribuicaoBruta * aliqIrrf;
      }
    }
    return {
      nome: socio.nome,
      participacao: socio.percentual_participacao,
      distribuicao_bruta: arred(distribuicaoBruta),
      irrf: arred(irrf),
      distribuicao_liquida: arred(distribuicaoBruta - irrf),
      residente: socio.residente_fiscal_brasil,
    };
  });
}

/**
 * Meses mínimos para IRRF zero por sócio residente.
 */
export function sugerirMesesIrrf(lucroDistribuivel, socios, config) {
  const piso = config.irrf_piso_residente || 50000;
  return socios
    .filter(s => s.residente_fiscal_brasil)
    .map(socio => {
      const bruta = lucroDistribuivel * (socio.percentual_participacao / 100);
      const mesesMinimos = bruta > piso ? Math.ceil(bruta / piso) : 1;
      return {
        nome: socio.nome,
        distribuicao_bruta: arred(bruta),
        meses_minimos: mesesMinimos,
        parcela_mensal_otima: arred(bruta / mesesMinimos),
      };
    });
}

// ============================================================
// D) DRE DO CENÁRIO
// ============================================================

export function montarDRE(importacao, vendas, config, socios, saldoCredorIcms = 0, comissaoPerc = 0, mixGeografico = null) {
  const impostos = calcularImpostosVenda(vendas, config, saldoCredorIcms, 0, "2026-01-01", mixGeografico);

  const receita = impostos.receita;
  const cmv = importacao.totais.custo_formacao_preco;
  const lucro_bruto = receita - cmv;

  const lucro_operacional = lucro_bruto - impostos.total_impostos;

  const comissoes = lucro_operacional * (comissaoPerc / 100);
  const lucro_distribuivel = lucro_operacional - comissoes;

  const distribuicao = calcularDistribuicao(lucro_distribuivel, socios, config);
  const total_irrf = distribuicao.reduce((s, d) => s + d.irrf, 0);
  const liquido_final = lucro_distribuivel - total_irrf;

  return {
    receita: arred(receita),
    cmv: arred(cmv),
    lucro_bruto: arred(lucro_bruto),
    pis_venda: impostos.pis_venda,
    cofins_venda: impostos.cofins_venda,
    icms_debito: impostos.icms_debito,
    icms_credito_utilizado: impostos.icms_credito_utilizado,
    icms_a_pagar: impostos.icms_a_pagar,
    saldo_credor_icms_remanescente: impostos.saldo_credor_icms_remanescente,
    detalhe_icms_por_faixa: impostos.detalhe_icms_por_faixa,
    irpj: impostos.irpj,
    adicional_irpj: impostos.adicional_irpj,
    csll: impostos.csll,
    das: impostos.das || 0,
    aliquota_efetiva_simples: impostos.aliquota_efetiva || 0,
    regime: impostos.regime || "presumido",
    total_impostos: impostos.total_impostos,
    lucro_operacional: arred(lucro_operacional),
    comissoes: arred(comissoes),
    lucro_distribuivel: arred(lucro_distribuivel),
    distribuicao,
    total_irrf: arred(total_irrf),
    liquido_final: arred(liquido_final),
  };
}

// ============================================================
// E) CUBAGEM DE CONTAINER
// ============================================================

export function calcularCubagem(itens, container, caixaPecas) {
  const { comprimento_mm, largura_mm, altura_mm } = container;
  let comprimentoUsado = 0;
  const detalhe = [];

  // Peças consolidadas: saem do laço individual e entram como UMA caixa única
  const consolidados = itens.filter(i => i.produto.embalagem_consolidada);
  let itensCubagem = itens.filter(i => !i.produto.embalagem_consolidada);
  // Produto que embarca em MAIS DE UMA caixa por unidade: cada volume vira uma
  // linha própria na cubagem ("Máquina — vol 2/3"), com a quantidade do item.
  itensCubagem = itensCubagem.flatMap(item => {
    const vols = item.produto.volumes;
    if (!Array.isArray(vols) || vols.length < 2) return [item];
    return vols.map((v, ix) => ({
      produto: {
        ...item.produto,
        nome: `${item.produto.nome} — vol ${ix + 1}/${vols.length}`,
        caixa_c_mm: v.c_mm, caixa_l_mm: v.l_mm, caixa_a_mm: v.a_mm,
        volumes: null,
      },
      quantidade: item.quantidade,
    }));
  });

  if (consolidados.length) {
    const cx = caixaPecas || CAIXA_PECAS_PADRAO;
    const qtdCaixas = Math.max(1, parseInt(cx.qtd, 10) || 1);
    const conteudo = consolidados.map(i => `${i.quantidade}× ${i.produto.nome}`).join(', ');
    itensCubagem = itensCubagem.concat([{
      produto: {
        nome: `Caixa de peças consolidada (${conteudo})`,
        caixa_c_mm: cx.c_mm || 600, caixa_l_mm: cx.l_mm || 400, caixa_a_mm: cx.a_mm || 400,
        empilhavel: true, pode_deitar: true,
      },
      quantidade: qtdCaixas,
    }]);
  }

  for (const item of itensCubagem) {
    const { produto, quantidade } = item;
    const c = produto.caixa_c_mm;
    const l = produto.caixa_l_mm;
    const a = produto.caixa_a_mm;

    let empilha;
    if (produto.empilhavel) {
      empilha = Math.floor(altura_mm / a);
    } else {
      empilha = 1;
    }

    let ladoALado = Math.floor(largura_mm / l);
    let caixaC = c;

    if (produto.pode_deitar) {
      const ladoALadoGirado = Math.floor(largura_mm / c);
      if (ladoALadoGirado * empilha > ladoALado * empilha) {
        ladoALado = ladoALadoGirado;
        caixaC = l;
      }
    }

    const unidadesPorFileira = empilha * ladoALado;

    if (unidadesPorFileira === 0) {
      detalhe.push({
        produto_nome: produto.nome,
        quantidade,
        empilha: 0,
        lado_a_lado: 0,
        unidades_por_fileira: 0,
        fileiras: 0,
        comprimento_usado: 0,
        cabe: false,
        motivo: 'Caixa não cabe na seção do container'
      });
      comprimentoUsado = comprimento_mm + 1;
      continue;
    }

    const fileiras = Math.ceil(quantidade / unidadesPorFileira);
    const compUsado = fileiras * caixaC;
    comprimentoUsado += compUsado;

    detalhe.push({
      produto_nome: produto.nome,
      quantidade,
      empilha,
      lado_a_lado: ladoALado,
      unidades_por_fileira: unidadesPorFileira,
      fileiras,
      comprimento_usado: compUsado,
      caixa_c_usado: caixaC,
    });
  }

  const cabe = comprimentoUsado <= comprimento_mm;
  const folga = comprimento_mm - comprimentoUsado;
  const ocupacao_perc = Math.min(100, (comprimentoUsado / comprimento_mm) * 100);

  /* Estimativa REALISTA por área de piso: no carregamento de verdade os produtos
   * dividem fileiras e aproveitam sobras de largura — o modo fileiras acima é o
   * teto conservador. Aqui: área de piso de cada pilha (caixa × unidades no chão,
   * considerando empilhamento em altura) contra a área útil do container. */
  const areaDisponivel = (comprimento_mm / 1000) * (largura_mm / 1000);
  let areaNecessaria = 0;
  let alturaEstoura = false;
  for (const item of itensCubagem) {
    const p = item.produto;
    if (!p.caixa_c_mm || !p.caixa_l_mm || !p.caixa_a_mm) continue;
    const empilha = p.empilhavel !== false ? Math.max(1, Math.floor(altura_mm / p.caixa_a_mm)) : 1;
    if (p.caixa_a_mm > altura_mm) alturaEstoura = true;
    const caixasNoChao = Math.ceil(item.quantidade / empilha);
    areaNecessaria += caixasNoChao * (p.caixa_c_mm / 1000) * (p.caixa_l_mm / 1000);
  }
  // fator de acomodação: carga mista real não aproveita 100% do piso
  const FATOR_ACOMODACAO = 0.85;
  const areaUtil = areaDisponivel * FATOR_ACOMODACAO;
  const cabe_area = !alturaEstoura && areaNecessaria <= areaUtil;

  return {
    container_nome: container.nome,
    comprimento_total: comprimento_mm,
    comprimento_usado: comprimentoUsado,
    folga,
    cabe,
    ocupacao_perc: arred(ocupacao_perc),
    detalhe,
    // leitura realista por área de piso
    area_disponivel_m2: arred(areaDisponivel),
    area_util_m2: arred(areaUtil),
    area_necessaria_m2: arred(areaNecessaria),
    ocupacao_area_perc: arred(Math.min(100, (areaNecessaria / areaUtil) * 100)),
    cabe_area,
    altura_estoura: alturaEstoura,
  };
}

export function maxUnidadesContainer(produto, container) {
  const { comprimento_mm, largura_mm, altura_mm } = container;
  const empilha = produto.empilhavel ? Math.floor(altura_mm / produto.caixa_a_mm) : 1;
  let ladoALado = Math.floor(largura_mm / produto.caixa_l_mm);
  let caixaC = produto.caixa_c_mm;

  if (produto.pode_deitar) {
    const ladoGirado = Math.floor(largura_mm / produto.caixa_c_mm);
    if (ladoGirado * empilha > ladoALado * empilha) {
      ladoALado = ladoGirado;
      caixaC = produto.caixa_l_mm;
    }
  }

  const unidadesPorFileira = empilha * ladoALado;
  if (unidadesPorFileira === 0) return 0;
  const fileiras = Math.floor(comprimento_mm / caixaC);
  return fileiras * unidadesPorFileira;
}

// ============================================================
// F) STUBS PARA CBS 2027
// ============================================================

function selecionarRegime(dataCompetencia) {
  const ano = parseInt(dataCompetencia.substring(0, 4), 10);
  if (ano >= 2027) return 'CBS';
  return 'PRESUMIDO_2026';
}

function calcularCustoImportacaoCBS() {
  throw new Error('RegimeCBS2027: módulo em preparação. Alíquota CBS configurável com creditamento amplo.');
}

function calcularImpostosVendaCBS() {
  throw new Error('RegimeCBS2027: módulo em preparação.');
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function arred(v) {
  return Math.round(v * 100) / 100;
}

function somarCampo(arr, campo) {
  return arred(arr.reduce((s, r) => s + r[campo], 0));
}

function isExTarifarioValido(validade, dataRef) {
  if (!validade) return true;
  return new Date(dataRef) <= new Date(validade);
}

// ============================================================
// G) ADAPTADORES — ENTIDADES DO ROBOOSTER ERP → FORMATO DO MOTOR
// ============================================================

/**
 * Converte um registro Product (ERP) para o formato de produto do motor.
 * Dimensões do cadastro estão em CM → motor usa MM.
 */
export function produtoFromProduct(p) {
  return {
    id: p.id,
    nome: p.name,
    fob_unitario_usd: p.cost_fob_usd || 0,
    aliq_ii: p.ii_rate ?? 0,
    aliq_ipi: p.ipi_rate ?? 0,
    aliq_pis_imp: p.pis_rate ?? 2.1,
    aliq_cofins_imp: p.cofins_rate ?? 9.65,
    aliq_icms: p.icms_rate ?? 18,
    beneficio_5291: !!p.beneficio_5291,
    ex_tarifario: !!p.ex_tarifario,
    ex_tarifario_validade: p.ex_tarifario_validade || null,
    ipi_recuperavel: p.ipi_recuperavel !== false,
    caixa_c_mm: (p.length_cm || 0) * 10,
    caixa_l_mm: (p.width_cm || 0) * 10,
    caixa_a_mm: (p.height_cm || 0) * 10,
    // Multi-volume: dimensões principais = volume 1; volumes_extras = caixas 2..N.
    // Linhas sem as 3 medidas são ignoradas (dimensão 0 quebraria a cubagem).
    volumes: (() => {
      const extras = (Array.isArray(p.volumes_extras) ? p.volumes_extras : [])
        .filter(v => (parseFloat(v.c_cm) || 0) > 0 && (parseFloat(v.l_cm) || 0) > 0 && (parseFloat(v.a_cm) || 0) > 0);
      if (!extras.length) return null;
      return [{ c_mm: (p.length_cm || 0) * 10, l_mm: (p.width_cm || 0) * 10, a_mm: (p.height_cm || 0) * 10 }]
        .concat(extras.map(v => ({ c_mm: parseFloat(v.c_cm) * 10, l_mm: parseFloat(v.l_cm) * 10, a_mm: parseFloat(v.a_cm) * 10 })));
    })(),
    pode_deitar: !!p.pode_deitar,
    empilhavel: p.empilhavel !== false,
    embalagem_consolidada: !!p.embalagem_consolidada,
    peso_kg: p.weight_kg || 0,
  };
}

export const CONFIG_DEFAULTS = {
  cambio_usd: 5.30,
  pis_venda: 0.65,
  cofins_venda: 3.0,
  presuncao_irpj: 8,
  presuncao_csll: 12,
  aliq_irpj: 15,
  aliq_csll: 9,
  adicional_irpj_limite: 60000,
  adicional_irpj_aliq: 10,
  lc224_limite_anual: 5000000,
  icms_interestadual_importado: 4,
  irrf_dividendos: 10,
  irrf_piso_residente: 50000,
};

export const DESPESAS_FIXAS_PADRAO = [
  { nome: 'Galpão / Aluguel', valor: 5000 },
  { nome: 'Utilidades (água, luz, internet)', valor: 1500 },
  { nome: 'Contador', valor: 2000 },
  { nome: 'Marketing', valor: 3000 },
  { nome: 'Folha de pagamento', valor: 8000 },
  { nome: 'Outros', valor: 1000 },
];

/**
 * Converte a entidade ConfigTributaria (valores em %) para o formato do motor (decimais).
 */
export function configParaMotor(dbConfig) {
  const c = dbConfig || {};
  return {
    regime: c.regime || "simples",
    rbt12: c.rbt12 || 0,
    cambio_usd: c.cambio_usd || CONFIG_DEFAULTS.cambio_usd,
    pis_venda: (c.pis_venda ?? CONFIG_DEFAULTS.pis_venda) / 100,
    cofins_venda: (c.cofins_venda ?? CONFIG_DEFAULTS.cofins_venda) / 100,
    presuncao_irpj: (c.presuncao_irpj ?? CONFIG_DEFAULTS.presuncao_irpj) / 100,
    presuncao_csll: (c.presuncao_csll ?? CONFIG_DEFAULTS.presuncao_csll) / 100,
    aliq_irpj: (c.aliq_irpj ?? CONFIG_DEFAULTS.aliq_irpj) / 100,
    aliq_csll: (c.aliq_csll ?? CONFIG_DEFAULTS.aliq_csll) / 100,
    adicional_irpj_limite: c.adicional_irpj_limite ?? CONFIG_DEFAULTS.adicional_irpj_limite,
    adicional_irpj_aliq: (c.adicional_irpj_aliq ?? CONFIG_DEFAULTS.adicional_irpj_aliq) / 100,
    lc224_limite_anual: c.lc224_limite_anual ?? CONFIG_DEFAULTS.lc224_limite_anual,
    icms_interestadual_importado: (c.icms_interestadual_importado ?? CONFIG_DEFAULTS.icms_interestadual_importado) / 100,
    irrf_dividendos: (c.irrf_dividendos ?? CONFIG_DEFAULTS.irrf_dividendos) / 100,
    irrf_piso_residente: c.irrf_piso_residente ?? CONFIG_DEFAULTS.irrf_piso_residente,
  };
}

export const CONTAINERS_PADRAO = [
  { nome: "20' Standard", comprimento_mm: 5900, largura_mm: 2350, altura_mm: 2390, frete_usd: 0 },
  { nome: "40' Standard", comprimento_mm: 12030, largura_mm: 2350, altura_mm: 2390, frete_usd: 0 },
  { nome: "40' High Cube", comprimento_mm: 12030, largura_mm: 2350, altura_mm: 2690, frete_usd: 0 },
  // NOR = reefer 40' HC usado como seco (unidade de frio desligada). Medidas INTERNAS
  // menores que o 40' HC seco em tudo: a máquina de frio come ~45 cm de comprimento,
  // as paredes isoladas comem 7 cm de largura e a altura útil é a "load line" do
  // reefer (2.425 mm — BWS/armadores; o teto físico fica em ~2.500-2.540 mm).
  // Pedido do despachante em 03/09/2026: "NOR é mais barato". Piso é grade de alumínio
  // (T-floor): 3.000 kg por metro corrido, máquina só sobre estrado/madeira, aceitação
  // de maquinário depende do armador (TT Club StopLoss 17).
  { nome: "40' NOR (reefer HC como seco)", comprimento_mm: 11560, largura_mm: 2280, altura_mm: 2425, frete_usd: 0 },
];
