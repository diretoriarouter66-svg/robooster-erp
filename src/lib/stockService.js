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

  // Pré-checagem só para a mensagem amigável (com o nome do produto).
  // A autoridade é o banco: o trigger movimento_estoque_atomico tranca a linha
  // do produto, recalcula saldo_anterior/saldo_novo, rejeita saldo negativo e
  // atualiza products.stock_quantity na MESMA transação do INSERT — imune a
  // dois usuários movimentando o mesmo produto ao mesmo tempo.
  const saldoAnterior = p.stock_quantity || 0;
  if (saldoAnterior + delta < 0) {
    throw new Error(`Estoque insuficiente de "${p.name}": saldo atual ${saldoAnterior}, movimento ${delta}.`);
  }

  const criado = await base44.entities.StockMovement.create({
    product_id: productId,
    product_name: p.name,
    sku: p.sku,
    product_sku: p.sku,
    tipo,
    quantidade: delta,
    origem_tipo: def.origem,
    origem_id: origemId || "",
    origem_ref: origemRef || "",
    motivo: motivo || "",
    unit_cost: unitCost ?? p.cost_landed_brl ?? p.custo_manual_brl ?? 0,
    // Campos do schema original (inglês) — mantidos para compatibilidade de validação
    type: tipo === "ajuste_inventario" ? "adjustment" : (delta > 0 ? "entry" : "exit"),
    quantity: Math.abs(delta),
    reference_type: { entrada_importacao: "import", saida_venda: "sale", devolucao_venda: "return", ajuste_inventario: "adjustment" }[tipo] || "other",
    reference_id: origemId || "",
    notes: [origemRef, motivo].filter(Boolean).join(" — "),
  });

  return criado?.saldo_novo ?? saldoAnterior + delta;
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
      // custo = custo do produto (landed/manual), nunca o preço de venda (corrigido 16/09/2026)
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
  // Se esta consulta falhar, o erro TEM que subir: tratar falha como "nenhum
  // movimento" faria a reconciliação baixar o estoque em dobro.
  const movs = await base44.entities.StockMovement.filter({ origem_id: orderId }, "-created_date", 500);

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

  // custo do movimento = custo vigente do produto (registrarMovimento resolve); o preço de venda não é custo

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
    });
  }
}

/** Dá entrada dos itens de uma operação de importação realizada */
export async function entradaImportacao(resultados, operacaoId, operacaoNome) {
  // Sem id da operação os movimentos nasceriam ÓRFÃOS (origem_id vazio) e a
  // checagem de "já deu entrada" nunca os acharia — entrada em dobro garantida.
  if (!operacaoId) throw new Error("Entrada de importação sem id da operação — salve a operação antes de dar entrada.");
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

/** Fechamento final da importação: atualiza o unit_cost dos movimentos da prévia
 * E RECONCILIA as quantidades com o mix final — item adicionado depois da prévia
 * entra agora; quantidade corrigida gera o acerto (a mais = entrada, a menos =
 * ajuste com justificativa automática). Sem isto, o Kardex ficava congelado na
 * prévia e vendia estoque fantasma. */
export async function atualizarCustoEntradaImportacao(operacaoId, resultados, operacaoNome = "") {
  if (!operacaoId) return 0;
  const alvo = {};
  for (const r of resultados || []) {
    if (r.produto?.id) alvo[r.produto.id] = { qtd: r.quantidade || 0, custo: r.custo_unitario_formacao };
  }
  const movs = await base44.entities.StockMovement.filter({ origem_id: operacaoId, tipo: "entrada_importacao" }, "-created_date", 500);
  let atualizados = 0;
  const atualPorProduto = {};
  for (const m of movs || []) {
    atualPorProduto[m.product_id] = (atualPorProduto[m.product_id] || 0) + Math.abs(m.quantidade || 0);
    const novo = alvo[m.product_id]?.custo;
    if (novo != null && novo !== m.unit_cost) {
      await base44.entities.StockMovement.update(m.id, { unit_cost: novo });
      atualizados++;
    }
  }
  for (const [pid, a] of Object.entries(alvo)) {
    const delta = (a.qtd || 0) - (atualPorProduto[pid] || 0);
    if (delta > 0) {
      await registrarMovimento({
        productId: pid, tipo: "entrada_importacao", quantidade: delta,
        origemId: operacaoId, origemRef: operacaoNome,
        unitCost: a.custo,
      });
      atualizados++;
    } else if (delta < 0) {
      await registrarMovimento({
        productId: pid, tipo: "ajuste_inventario", quantidadeAssinada: delta,
        origemId: operacaoId, origemRef: operacaoNome,
        motivo: `Acerto do fechamento da importação "${operacaoNome}": quantidade real (${a.qtd}) menor que a prévia.`,
      });
      atualizados++;
    }
  }
  return atualizados;
}

/** Verifica no Kardex se a operação já deu entrada no estoque (fonte da verdade, não memória) */
export async function operacaoJaDeuEntrada(operacaoId) {
  if (!operacaoId) return false;
  // Erro aqui não pode virar "não entrou ainda": geraria entrada duplicada.
  const movs = await base44.entities.StockMovement.filter({ origem_id: operacaoId, tipo: "entrada_importacao" }, "-created_date", 1);
  return (movs || []).length > 0;
}
