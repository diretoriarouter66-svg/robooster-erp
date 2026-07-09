/**
 * ROBOOSTER ERP — Serviço de Movimentação de Estoque (padrão Kardex)
 * REGRA DE OURO: estoque nunca se edita; estoque se movimenta.
 * Todo movimento é um registro imutável em StockMovement, e o campo
 * stock_quantity do Product é sempre o resultado do último movimento.
 */
import { base44 } from "@/api/base44Client";

export const TIPOS_MOVIMENTO = {
  entrada_importacao: { label: "Entrada por Importação", direcao: +1, origem: "operacao_importacao", manual: false },
  saida_venda: { label: "Saída por Venda", direcao: -1, origem: "pedido_venda", manual: false },
  devolucao_venda: { label: "Devolução de Venda", direcao: +1, origem: "pedido_venda", manual: false },
  ajuste_inventario: { label: "Ajuste de Inventário", direcao: 0, origem: "manual", manual: true },
  avaria: { label: "Avaria / Perda", direcao: -1, origem: "manual", manual: true },
  uso_interno: { label: "Uso Interno / Demonstração", direcao: -1, origem: "manual", manual: true },
};

/**
 * Registra um movimento de estoque e atualiza o saldo do produto.
 * @param {Object} mov
 * @param {string} mov.productId
 * @param {string} mov.tipo - chave de TIPOS_MOVIMENTO
 * @param {number} mov.quantidade - SEMPRE positiva; a direção vem do tipo (exceto ajuste_inventario, que usa quantidadeAssinada)
 * @param {number} [mov.quantidadeAssinada] - apenas para ajuste_inventario: delta com sinal (+2 achou, -1 sumiu)
 * @param {string} [mov.origemId]
 * @param {string} [mov.origemRef]
 * @param {string} [mov.motivo] - OBRIGATÓRIO para tipos manuais
 * @param {number} [mov.unitCost]
 * @returns {Promise<number>} saldo novo
 */
export async function registrarMovimento({ productId, tipo, quantidade, quantidadeAssinada, origemId, origemRef, motivo, unitCost }) {
  const def = TIPOS_MOVIMENTO[tipo];
  if (!def) throw new Error(`Tipo de movimento inválido: ${tipo}`);
  if (def.manual && !motivo?.trim()) throw new Error("Justificativa obrigatória para movimentos manuais.");

  let delta;
  if (tipo === "ajuste_inventario") {
    if (!quantidadeAssinada || quantidadeAssinada === 0) throw new Error("Informe a quantidade do ajuste (positiva ou negativa).");
    delta = quantidadeAssinada;
  } else {
    if (!quantidade || quantidade <= 0) throw new Error("Quantidade deve ser maior que zero.");
    delta = def.direcao * quantidade;
  }

  const p = await base44.entities.Product.get(productId);
  if (!p) throw new Error("Produto não encontrado.");

  const saldoAnterior = p.stock_quantity || 0;
  const saldoNovo = saldoAnterior + delta;
  if (saldoNovo < 0) {
    throw new Error(`Estoque insuficiente de "${p.name}": saldo atual ${saldoAnterior}, movimento ${delta}.`);
  }

  await base44.entities.StockMovement.create({
    product_id: productId,
    product_name: p.name,
    sku: p.sku,
    product_sku: p.sku,
    tipo,
    quantidade: delta,
    saldo_anterior: saldoAnterior,
    saldo_novo: saldoNovo,
    origem_tipo: def.origem,
    origem_id: origemId || "",
    origem_ref: origemRef || "",
    motivo: motivo || "",
    unit_cost: unitCost ?? p.cost_landed_brl ?? p.custo_manual_brl ?? 0,
    // Campos do schema original (inglês) — mantidos para compatibilidade de validação
    type: tipo === "ajuste_inventario" ? "adjustment" : (delta > 0 ? "entry" : "exit"),
    quantity: Math.abs(delta),
    previous_stock: saldoAnterior,
    new_stock: saldoNovo,
    reference_type: { entrada_importacao: "import", saida_venda: "sale", devolucao_venda: "return", ajuste_inventario: "adjustment" }[tipo] || "other",
    reference_id: origemId || "",
    notes: [origemRef, motivo].filter(Boolean).join(" — "),
  });

  await base44.entities.Product.update(productId, { stock_quantity: saldoNovo });
  return saldoNovo;
}

/** Movimenta os itens de um pedido de venda. sinal -1 = baixa (venda), +1 = devolução */
export async function movimentarPedidoVenda(itens, sinal, orderId, orderNumber) {
  for (const item of itens || []) {
    if (!item.product_id || !item.quantity) continue;
    await registrarMovimento({
      productId: item.product_id,
      tipo: sinal < 0 ? "saida_venda" : "devolucao_venda",
      quantidade: item.quantity,
      origemId: orderId || "",
      origemRef: orderNumber || "",
      unitCost: item.unit_price,
    });
  }
}

/**
 * Reconcilia o estoque de um pedido usando o Kardex como fonte da verdade.
 * Consulta os movimentos já registrados para o pedido e gera apenas a diferença
 * entre o estado atual e o estado alvo (deveBaixar = pedido faturado/enviado/entregue).
 * À prova de edições de itens, cancelamentos e reaberturas.
 */
export async function reconciliarPedidoVenda(orderId, orderNumber, itens, deveBaixar) {
  if (!orderId) throw new Error("Pedido sem ID para reconciliar estoque.");
  const movs = await base44.entities.StockMovement.filter({ origem_id: orderId }, "-created_date", 500).catch(() => []);

  // Posição atual no ledger por produto (soma dos movimentos de venda/devolução deste pedido)
  const atual = {};
  for (const m of movs) {
    if (m.tipo !== "saida_venda" && m.tipo !== "devolucao_venda") continue;
    atual[m.product_id] = (atual[m.product_id] || 0) + (m.quantidade || 0);
  }

  // Posição alvo: -qtd por produto se deve estar baixado; 0 se não
  const alvo = {};
  if (deveBaixar) {
    for (const item of itens || []) {
      if (!item.product_id || !item.quantity) continue;
      alvo[item.product_id] = (alvo[item.product_id] || 0) - item.quantity;
    }
  }

  const custoPorProduto = {};
  for (const item of itens || []) { if (item.product_id) custoPorProduto[item.product_id] = item.unit_price; }

  const produtos = new Set([...Object.keys(atual), ...Object.keys(alvo)]);
  for (const pid of produtos) {
    const delta = (alvo[pid] || 0) - (atual[pid] || 0);
    if (delta === 0) continue;
    await registrarMovimento({
      productId: pid,
      tipo: delta < 0 ? "saida_venda" : "devolucao_venda",
      quantidade: Math.abs(delta),
      origemId: orderId,
      origemRef: orderNumber || "",
      unitCost: custoPorProduto[pid],
    });
  }
}

/** Dá entrada dos itens de uma operação de importação realizada */
export async function entradaImportacao(resultados, operacaoId, operacaoNome) {
  for (const r of resultados || []) {
    if (!r.produto?.id || !r.quantidade) continue;
    await registrarMovimento({
      productId: r.produto.id,
      tipo: "entrada_importacao",
      quantidade: r.quantidade,
      origemId: operacaoId || "",
      origemRef: operacaoNome || "",
      motivo: "",
      unitCost: r.custo_unitario_formacao,
    });
  }
}

/** Verifica no Kardex se a operação já deu entrada no estoque (fonte da verdade, não memória) */
export async function operacaoJaDeuEntrada(operacaoId) {
  if (!operacaoId) return false;
  const movs = await base44.entities.StockMovement.filter({ origem_id: operacaoId, tipo: "entrada_importacao" }, "-created_date", 1).catch(() => []);
  return (movs || []).length > 0;
}
