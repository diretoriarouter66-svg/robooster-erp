// ACRÉSCIMO AO CLIENTE POR Nº DE PARCELAS (pedido do Mauricio, 08/10/2026).
// "O cliente quer dar uma entrada e financiar o restante em 12x: o juro tem que ser recalculado
// sobre quanto será financiado." Regra: o acréscimo incide SÓ sobre o saldo financiado
// (preço à vista − entrada), pela % do nº de parcelas escolhido.
//
// NÃO confundir com config_tributaria.taxas_operadoras: aquela é o que NÓS pagamos à operadora
// (PagBank, Rede, PayPal); esta é o que o CLIENTE paga a mais por parcelar.
// Guardada em config_tributaria.acrescimo_parcelas (jsonb {"1": "0", "2": "11.11", ...}).

export const PARCELAS_MAX = 18;

// Valor INICIAL (enquanto ele não salvar a tabela dele): a regra que o site robooster.com.br já
// anuncia. No site, "12x sem juros" é o preço do produto ÷ 12, e o Pix é esse preço com 10% de
// desconto — ou seja, quem parcela (2x a 12x) paga o preço à vista ÷ 0,9 = +11,11%. 13x a 18x
// em branco = não oferecemos (o site vai até 12x). 1x = à vista, sem acréscimo.
export const ACRESCIMO_INICIAL = {
  "1": "0", "2": "11.11", "3": "11.11", "4": "11.11", "5": "11.11", "6": "11.11",
  "7": "11.11", "8": "11.11", "9": "11.11", "10": "11.11", "11": "11.11", "12": "11.11",
};

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const numOuNull = (v) => (v === "" || v == null || isNaN(parseFloat(v)) ? null : parseFloat(v));

/** Tabela vigente: a salva na Configuração; sem nada salvo, a inicial (inicial: true). */
export function tabelaAcrescimo(config) {
  const t = config?.acrescimo_parcelas;
  const salva = !!t && typeof t === "object" && Object.values(t).some((v) => numOuNull(v) != null);
  return { tabela: salva ? t : ACRESCIMO_INICIAL, inicial: !salva };
}

/** % de acréscimo para n parcelas (null = não cadastrado / não oferecemos). */
export function acrescimoPct(config, n) {
  return numOuNull(tabelaAcrescimo(config).tabela[String(Math.max(1, parseInt(n) || 1))]);
}

/** Maior nº de parcelas com % cadastrada (para o "12x de" da Precificação). */
export function maxParcelasOferecidas(config) {
  const { tabela } = tabelaAcrescimo(config);
  let m = 0;
  for (let n = 1; n <= PARCELAS_MAX; n++) if (numOuNull(tabela[String(n)]) != null) m = n;
  return m;
}

/**
 * Simulação: preço à vista (base), entrada, n parcelas, % de acréscimo.
 * As parcelas saem IGUAIS (arredondadas ao centavo) e o acréscimo é o que sobra delas sobre o
 * financiado — por isso o "% efetivo" pode diferir da tabela em centavos.
 */
export function simularParcelamento({ base, entrada, n, pct }) {
  const avista = r2(base);
  const ent = Math.min(avista, Math.max(0, r2(entrada)));
  const nParc = Math.max(1, parseInt(n) || 1);
  const p = Math.max(0, Number(pct) || 0);
  const financiado = r2(avista - ent);
  const parcela = financiado > 0 ? r2((financiado * (1 + p / 100)) / nParc) : 0;
  const totalFinanciado = r2(parcela * nParc);
  const acrescimo = Math.max(0, r2(totalFinanciado - financiado));
  return {
    avista, entrada: ent, n: nParc, pct: p, financiado, parcela, totalFinanciado, acrescimo,
    totalCliente: r2(ent + totalFinanciado),
    pctEfetivo: financiado > 0 ? (acrescimo / financiado) * 100 : 0,
  };
}

/** % mínima de acréscimo para a taxa da operadora não comer a venda: a ≥ t / (1 − t). */
export function acrescimoMinimo(taxaOperadoraPct) {
  const t = (Number(taxaOperadoraPct) || 0) / 100;
  if (t <= 0 || t >= 1) return 0;
  return (t / (1 - t)) * 100;
}

const brl = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

/** Texto para o WhatsApp (Michele): "À vista R$ 20.000,00 · ou entrada de R$ 5.000,00 + 12x de R$ 1.500,00 (total R$ 23.000,00)". */
export function textoProposta(s) {
  if (!s || s.avista <= 0) return "";
  const avista = `À vista ${brl(s.avista)}`;
  if (s.financiado <= 0) return avista;
  const plano = s.entrada > 0
    ? `entrada de ${brl(s.entrada)} + ${s.n}x de ${brl(s.parcela)}`
    : `${s.n}x de ${brl(s.parcela)}`;
  return `${avista} · ou ${plano} (total ${brl(s.totalCliente)})`;
}

/** "12x de R$ X" sem entrada, pela tabela (Precificação). null quando não há tabela para n. */
export function precoParcelado(config, precoAvista, n) {
  const nn = n || maxParcelasOferecidas(config);
  if (!nn || !(precoAvista > 0)) return null;
  const pct = acrescimoPct(config, nn);
  if (pct == null) return null;
  return simularParcelamento({ base: precoAvista, entrada: 0, n: nn, pct });
}
