import { useState, useEffect } from "react";
import { supabase } from "@/api/base44Client";

/**
 * DESPESAS FIXAS — base única para todo o ERP (06/10/2026, pedido dele).
 *
 * Cada despesa do Financeiro tem o seletor "Despesa fixa" (o padrão vem da categoria, em Financeiro → Categorias; as
 * despesas criadas sozinhas pelo extrato, pela fatura do cartão e pelo PayPal já nascem com o padrão). O banco
 * (função base_despesas_fixas) soma as fixas pagas pela mesma regra de mês da DRE Realizada e devolve:
 *   - media_fixas: despesa fixa média por mês (últimos 3 meses fechados com fixas lançadas);
 *   - media_faturamento: faturamento médio das notas de saída autorizadas nesses meses;
 *   - pct: fixas ÷ faturamento — o percentual que entra no custo fixo da Precificação e do Estoque & Caixa.
 * Quem não tem acesso ao Financeiro recebe só o pct. Substitui a lista "Despesas Fixas Mensais" e o "Índice de Custo
 * Fixo" que se digitavam na Configuração Tributária.
 *
 * Erro na leitura NÃO vira zero calado: volta { erro } e a tela avisa (armadilha 2 do CLAUDE.md do projeto).
 */
let promessa = null;

export function carregarBaseFixas(recarregar = false) {
  if (!promessa || recarregar) {
    promessa = supabase.rpc("base_despesas_fixas")
      .then(({ data, error }) => {
        if (error) throw error;
        return { pct: 0, meses_usados: 0, ...(data || {}) };
      })
      .catch((err) => {
        promessa = null;
        return { pct: 0, meses_usados: 0, erro: err?.message || String(err) };
      });
  }
  return promessa;
}

export function useBaseFixas() {
  const [base, setBase] = useState(null);
  useEffect(() => {
    let vivo = true;
    carregarBaseFixas().then((b) => { if (vivo) setBase(b); });
    return () => { vivo = false; };
  }, []);
  return base;
}

export const fmtPctFixo = (pct) =>
  `${((pct || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const nomeMes = (ym) => {
  const [a, m] = String(ym || "").split("-");
  const n = MESES_CURTOS[parseInt(m, 10) - 1];
  return n ? `${n}/${a}` : String(ym || "");
};

/** Uma frase para rodapé de tela: de onde sai o percentual. */
export function origemBaseFixas(base) {
  if (!base) return "carregando a base das despesas fixas…";
  if (base.erro) return `não foi possível ler a base das despesas fixas (${base.erro}) — o custo fixo está zerado nesta tela`;
  if (!base.meses_usados) return "ainda não há despesa fixa paga marcada no Financeiro — o custo fixo fica em zero até haver";
  const meses = (base.meses || []).map((m) => nomeMes(m.mes)).join(", ");
  return `despesas fixas pagas ÷ faturamento das notas${meses ? ` (${meses})` : ""} — marcação no Financeiro`;
}
