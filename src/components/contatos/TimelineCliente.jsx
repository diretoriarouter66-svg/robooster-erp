import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShoppingCart, Factory, MessageCircle, Eye, FileText, Loader2, Activity } from "lucide-react";

/**
 * Timeline do Cliente — o cérebro do CRM em uma tela:
 * pedidos + máquinas (base instalada) + conversas (espelho do Chatwoot,
 * sincronizado a cada 30 min) + navegação no site (pixel, via ponte
 * visitante↔telefone criada pela assinatura "(ref ...)" do WhatsApp).
 */

const fmtBRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtData = (d) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

const normalizarFone = (raw) => {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;
  return d.startsWith("55") || d.length > 11 ? `+${d}` : `+55${d}`;
};

export default function TimelineCliente({ contato, open, onClose }) {
  const [dados, setDados] = useState(null);

  useEffect(() => {
    if (!open || !contato) return;
    setDados(null);
    (async () => {
      const fone = normalizarFone(contato.whatsapp || contato.phone);
      const [pedidos, maquinas, produtos] = await Promise.all([
        base44.entities.SaleOrder.filter({ customer_id: contato.id }, "-created_date", 100).catch(() => []),
        base44.entities.BaseInstalada.filter({ contato_id: contato.id }, "-created_date", 50).catch(() => []),
        base44.entities.Product.list("-created_date", 1000).catch(() => []),
      ]);
      let conversa = null, eventos = [];
      if (fone) {
        conversa = (await base44.entities.CrmConversa.filter({ phone: fone }, "-created_date", 1).catch(() => []))?.[0] || null;
        const vinculos = await base44.entities.VisitorIdentidade.filter({ phone: fone }, "-created_date", 5).catch(() => []);
        for (const v of (vinculos || [])) {
          const evs = await base44.entities.SiteEvento.filter({ visitor_id: v.visitor_id }, "-created_date", 60).catch(() => []);
          eventos = eventos.concat(evs || []);
        }
      }
      setDados({ pedidos: pedidos || [], maquinas: maquinas || [], produtos: produtos || [], conversa, eventos, fone });
    })();
  }, [open, contato]);

  if (!open) return null;

  const linhas = [];
  if (dados) {
    for (const p of dados.pedidos) {
      linhas.push({ ts: p.order_date || p.created_date, icon: ShoppingCart, cor: "text-primary", titulo: `Pedido ${p.order_number} — ${fmtBRL(p.total)}`, sub: `${p.status}${p.nfe_status === "autorizado" ? ` · NF-e ${p.nfe_numero} ✅` : ""}` });
    }
    for (const m of dados.maquinas) {
      const prod = dados.produtos.find(pr => pr.id === m.product_id);
      linhas.push({ ts: m.data_venda || m.created_date, icon: Factory, cor: "text-success", titulo: `Possui: ${prod?.model || prod?.name || "máquina"}`, sub: m.numero_serie ? `nº de série ${m.numero_serie}` : (m.origem === "pedido" ? "via pedido" : "registro manual") });
    }
    if (dados.conversa) {
      linhas.push({ ts: dados.conversa.ultima_mensagem_em, icon: MessageCircle, cor: "text-[hsl(142,71%,45%)]", titulo: `WhatsApp — ${dados.conversa.total_conversas} conversa(s) no atendimento`, sub: `Última: "${(dados.conversa.ultima_mensagem || "").slice(0, 90)}"` });
    }
    // Navegação agrupada por dia
    const porDia = {};
    for (const e of dados.eventos) {
      const dia = (e.created_date || "").slice(0, 10);
      if (!porDia[dia]) porDia[dia] = { pageviews: 0, paginas: new Set(), cliques: 0, ts: e.created_date };
      if (e.evento === "whatsapp_click") porDia[dia].cliques++;
      else { porDia[dia].pageviews++; porDia[dia].paginas.add(e.url); }
    }
    for (const [dia, g] of Object.entries(porDia)) {
      linhas.push({ ts: g.ts, icon: Eye, cor: "text-muted-foreground", titulo: `Navegou no site — ${g.pageviews} página(s)${g.cliques ? ` · ${g.cliques} clique(s) no WhatsApp` : ""}`, sub: [...g.paginas].slice(0, 3).join(" · ") });
    }
    linhas.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Atividade — {contato?.name}</DialogTitle>
        </DialogHeader>
        {!dados ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma atividade registrada ainda.{!dados.fone && " (Contato sem telefone — conversas e navegação não podem ser vinculadas.)"}</p>
        ) : (
          <div className="relative pl-5 space-y-4 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-border">
            {linhas.map((l, i) => {
              const Icon = l.icon;
              return (
                <div key={i} className="relative">
                  <span className="absolute -left-5 top-0.5 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center">
                    <Icon className={`w-2.5 h-2.5 ${l.cor}`} />
                  </span>
                  <p className="text-sm font-medium leading-tight">{l.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{l.sub}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{fmtData(l.ts)}</p>
                </div>
              );
            })}
          </div>
        )}
        {dados?.eventos?.length === 0 && dados?.fone && (
          <p className="text-[11px] text-muted-foreground border-t border-border pt-2 mt-2">💡 A navegação no site aparece aqui depois que o cliente clicar no WhatsApp do site (a assinatura "(ref ...)" liga o visitante ao telefone — sincroniza a cada 30 min).</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
