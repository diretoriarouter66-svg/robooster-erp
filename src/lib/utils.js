import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

// Status de exibição de um lançamento financeiro: conta pendente com o
// vencimento no passado é vencida, sem depender de alguém marcar na mão.
// O status no banco continua "pending" — quem escreve é só o fluxo normal.
export function statusFinanceiro(entry) {
  if (
    entry?.status === "pending" &&
    entry.due_date &&
    String(entry.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10)
  ) {
    return "overdue";
  }
  return entry?.status;
}

// Um lançamento "em aberto" é o pendente ou vencido (ainda vai entrar/sair).
export function emAberto(entry) {
  const s = statusFinanceiro(entry);
  return s === "pending" || s === "overdue";
}
