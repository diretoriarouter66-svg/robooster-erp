// SIMULADOR "entrada + parcelas" do pedido de venda (pedido do Mauricio, 08/10/2026).
// Regra dele: "Preço a prazo em 12x = 24K, entrada de 5K, vai ter que calcular 19K × o juros de 12x que está na
// configuração". O juro é a TAXA DA OPERADORA × Nº DE PARCELAS da tabela que já existe em Configuração Tributária
// → "Taxas de recebimento por operadora e nº de parcelas" (config_tributaria.taxas_operadoras). Não há tabela própria.
//   saldo     = total do pedido − entrada
//   acréscimo = saldo × taxa[operadora][n]
//   parcela   = (saldo + acréscimo) ÷ n

export const PARCELAS_MAX = 18;

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Taxa da operadora (%) para n parcelas no crédito, ou para o débito. null = não cadastrada. */
export function taxaOperadora(op, n, debito = false) {
  if (!op) return null;
  const v = debito ? op.debito : (op.parcelas || {})[String(Math.max(1, parseInt(n) || 1))];
  return v === "" || v == null || isNaN(parseFloat(v)) ? null : parseFloat(v);
}

/**
 * base = preço do pedido (sem acréscimo), entrada, n parcelas, pct = taxa aplicada.
 * As parcelas saem IGUAIS (centavo arredondado); o acréscimo é o que elas somam acima do saldo.
 */
export function simularParcelamento({ base, entrada, n, pct }) {
  const avista = r2(base);
  const ent = Math.min(avista, Math.max(0, r2(entrada)));
  const nParc = Math.max(1, parseInt(n) || 1);
  const p = Math.max(0, Number(pct) || 0);
  const financiado = r2(avista - ent);
  const parcela = financiado > 0 ? r2((financiado * (1 + p / 100)) / nParc) : 0;
  // sem juro (boleto) o arredondamento não pode tirar centavos do saldo: a última parcela absorve (19.000 ÷ 12)
  const totalFinanciado = Math.max(financiado, r2(parcela * nParc));
  const acrescimo = Math.max(0, r2(totalFinanciado - financiado));
  return { avista, entrada: ent, n: nParc, pct: p, financiado, parcela, totalFinanciado, acrescimo, totalCliente: r2(ent + totalFinanciado) };
}

const brl = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

/** Texto para o WhatsApp: "Preço R$ 24.000,00 · entrada de R$ 5.000,00 + 12x de R$ 1.733,75 (total R$ 25.805,00)". */
export function textoProposta(s) {
  if (!s || s.avista <= 0) return "";
  const preco = `Preço ${brl(s.avista)}`;
  if (s.financiado <= 0) return preco;
  const plano = s.entrada > 0 ? `entrada de ${brl(s.entrada)} + ${s.n}x de ${brl(s.parcela)}` : `${s.n}x de ${brl(s.parcela)}`;
  return `${preco} · ${plano} (total ${brl(s.totalCliente)})`;
}
