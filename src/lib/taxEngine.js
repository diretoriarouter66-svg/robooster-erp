/**
 * Motor Simples Nacional — Anexo I (comércio), LC 123/2006.
 * Fonte única da alíquota efetiva: espelhado na função SQL
 * public.simples_aliquota_efetiva (scripts/motor-tributario-simples.sql).
 *
 * Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) / RBT12
 * O DAS do Anexo I engloba ICMS, PIS, COFINS, IRPJ, CSLL e CPP — dentro do
 * sublimite estadual (R$ 3,6 mi) não há ICMS por fora nem crédito de ICMS.
 */

export const SIMPLES_ANEXO_I = [
  { faixa: 1, ate: 180000,  aliq: 4.0,  pd: 0 },
  { faixa: 2, ate: 360000,  aliq: 7.3,  pd: 5940 },
  { faixa: 3, ate: 720000,  aliq: 9.5,  pd: 13860 },
  { faixa: 4, ate: 1800000, aliq: 10.7, pd: 22500 },
  { faixa: 5, ate: 3600000, aliq: 14.3, pd: 87300 },
  { faixa: 6, ate: 4800000, aliq: 19.0, pd: 378000 },
];

export const SIMPLES_SUBLIMITE_ICMS = 3600000;
export const SIMPLES_TETO = 4800000;

export function simplesFaixa(rbt12) {
  const r = rbt12 > 0 ? rbt12 : 0;
  return SIMPLES_ANEXO_I.find(f => r <= f.ate) || SIMPLES_ANEXO_I[SIMPLES_ANEXO_I.length - 1];
}

/** Alíquota efetiva em % (ex.: 7.54). RBT12 vazio cai na 1ª faixa nominal. */
export function simplesEfetivaPct(rbt12) {
  const f = simplesFaixa(rbt12);
  if (!rbt12 || rbt12 <= 180000) return f.aliq;
  return ((rbt12 * (f.aliq / 100) - f.pd) / rbt12) * 100;
}

export function isSimples(config) {
  return (config?.regime || "simples") !== "presumido";
}

/** Avisos de proximidade de virada (faixa seguinte, sublimite ICMS, teto). */
export function simplesAlertas(rbt12) {
  const alertas = [];
  if (!rbt12 || rbt12 <= 0) return alertas;
  const f = simplesFaixa(rbt12);
  if (rbt12 >= SIMPLES_TETO) {
    alertas.push({ nivel: "erro", msg: "RBT12 acima do teto do Simples (R$ 4,8 mi) — exclusão do regime." });
  } else if (rbt12 >= SIMPLES_TETO * 0.85) {
    alertas.push({ nivel: "alto", msg: "RBT12 a menos de 15% do teto do Simples (R$ 4,8 mi)." });
  }
  if (rbt12 < SIMPLES_SUBLIMITE_ICMS && rbt12 >= SIMPLES_SUBLIMITE_ICMS * 0.85) {
    alertas.push({ nivel: "alto", msg: "Perto do sublimite de ICMS (R$ 3,6 mi): acima dele o ICMS sai do DAS e é apurado por fora." });
  }
  if (f.faixa < 6 && rbt12 >= f.ate * 0.9) {
    alertas.push({ nivel: "medio", msg: `A menos de 10% de subir para a ${f.faixa + 1}ª faixa do Anexo I (alíquota nominal ${SIMPLES_ANEXO_I[f.faixa].aliq}%).` });
  }
  return alertas;
}
