import React from "react";

const statusConfig = {
  active: { label: "Ativo", className: "bg-success/10 text-success" },
  inactive: { label: "Inativo", className: "bg-muted text-muted-foreground" },
  discontinued: { label: "Descontinuado", className: "bg-destructive/10 text-destructive" },
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  proforma: { label: "Proforma", className: "bg-primary/10 text-primary" },
  shipped: { label: "Embarcado", className: "bg-warning/10 text-warning" },
  customs: { label: "Desembaraço", className: "bg-warning/10 text-warning" },
  released: { label: "Liberado", className: "bg-success/10 text-success" },
  delivered: { label: "Entregue", className: "bg-success/10 text-success" },
  completed: { label: "Concluído", className: "bg-success/10 text-success" },
  pending: { label: "Pendente", className: "bg-warning/10 text-warning" },
  approved: { label: "Aprovado", className: "bg-primary/10 text-primary" },
  invoiced: { label: "Faturado", className: "bg-primary/10 text-primary" },
  cancelled: { label: "Cancelado", className: "bg-destructive/10 text-destructive" },
  returned: { label: "Devolvido", className: "bg-destructive/10 text-destructive" },
  paid: { label: "Pago", className: "bg-success/10 text-success" },
  overdue: { label: "Vencido", className: "bg-destructive/10 text-destructive" },
  partial: { label: "Parcial", className: "bg-warning/10 text-warning" },
  refunded: { label: "Estornado", className: "bg-destructive/10 text-destructive" },
  sent: { label: "Enviado", className: "bg-primary/10 text-primary" },
  confirmed: { label: "Confirmado", className: "bg-success/10 text-success" },
  received: { label: "Recebido", className: "bg-success/10 text-success" },
  simulacao: { label: "Simulação", className: "bg-muted text-muted-foreground" },
  aprovada: { label: "Aprovada", className: "bg-primary/10 text-primary" },
  em_transito: { label: "Em Trânsito", className: "bg-warning/10 text-warning" },
  realizada: { label: "Realizada", className: "bg-success/10 text-success" },
  international: { label: "Internacional", className: "bg-primary/10 text-primary" },
  national: { label: "Nacional", className: "bg-success/10 text-success" },
  PF: { label: "Pessoa Física", className: "bg-primary/10 text-primary" },
  PJ: { label: "Pessoa Jurídica", className: "bg-warning/10 text-warning" },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}