// Saldo de uma conta de caixa/banco (02/10/2026).
// Com extrato do banco lido, a conta tem um saldo CONFERIDO numa data (o que o banco informou): o saldo de hoje é esse
// valor mais os lançamentos pagos depois daquela data. Sem extrato, vale a soma antiga: saldo inicial + recebidos − pagos.
const num = (v) => parseFloat(v) || 0;
export const dataMovimento = (e) => e.payment_date || e.due_date || (e.created_date || "").slice(0, 10) || "";
const efeito = (e) => (e.type === "receivable" ? 1 : -1) * num(e.amount);

export function saldoConta(conta, entries) {
  const pagos = entries.filter((e) => e.account_id === conta.id && e.status === "paid");
  if (conta.saldo_conferido != null && conta.saldo_conferido_em) {
    const depois = pagos.filter((e) => dataMovimento(e) > conta.saldo_conferido_em);
    const movimento = depois.reduce((t, e) => t + efeito(e), 0);
    return { saldo: num(conta.saldo_conferido) + movimento, conferido: true, conferidoEm: conta.saldo_conferido_em, saldoConferido: num(conta.saldo_conferido), movimentoDepois: movimento, nDepois: depois.length };
  }
  return { saldo: num(conta.saldo_inicial) + pagos.reduce((t, e) => t + efeito(e), 0), conferido: false };
}

// Saldo da conta logo antes de uma data (para abrir o extrato de um mês): a partir do saldo conferido, para frente ou para trás.
export function saldoAntesDe(conta, entries, data) {
  return Math.round(saldoAntesDeBruto(conta, entries, data) * 100) / 100 + 0; // "+ 0" evita o −0,00
}
function saldoAntesDeBruto(conta, entries, data) {
  const pagos = entries.filter((e) => e.account_id === conta.id && e.status === "paid");
  if (conta.saldo_conferido != null && conta.saldo_conferido_em) {
    const ref = conta.saldo_conferido_em;
    if (data > ref) return num(conta.saldo_conferido) + pagos.filter((e) => { const d = dataMovimento(e); return d > ref && d < data; }).reduce((t, e) => t + efeito(e), 0);
    return num(conta.saldo_conferido) - pagos.filter((e) => { const d = dataMovimento(e); return d >= data && d <= ref; }).reduce((t, e) => t + efeito(e), 0);
  }
  return num(conta.saldo_inicial) + pagos.filter((e) => dataMovimento(e) < data).reduce((t, e) => t + efeito(e), 0);
}

export const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
