import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Ship, ArrowLeft, Trash2, Calculator, Save, Loader2, Package } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import ImportResults from "@/components/import/ImportResults";
import CubageResults from "@/components/import/CubageResults";
import {
  calcularOperacaoImportacao, calcularCubagem, produtoFromProduct,
  configParaMotor, CONTAINERS_PADRAO
} from "@/lib/simportEngine";
import { entradaImportacao, operacaoJaDeuEntrada, atualizarCustoEntradaImportacao } from "@/lib/stockService";

const STATUS_OPTIONS = [
  { value: "simulacao", label: "Simulação" },
  { value: "aprovada", label: "Aprovada" },
  { value: "em_transito", label: "Em Trânsito" },
  { value: "realizada", label: "Realizada (prévia)" },
  { value: "concluida", label: "Concluída" }
];

const fmtBRL = (v) => v != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";
const fmtUSD = (v) => v != null ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v) : "—";

export default function ImportSimulator() {
  const [operations, setOperations] = useState([]);
  const [products, setProducts] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [cubageResult, setCubageResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [ops, prods, configs] = await Promise.all([
        base44.entities.ImportOperation.list("-created_date", 100),
        base44.entities.Product.list("-created_date", 1000),
        base44.entities.ConfigTributaria.list("-created_date", 5)
      ]);
      setOperations(ops || []);
      setProducts(prods || []);
      setConfig(configs?.[0] || {});
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      nome: "", data: new Date().toISOString().slice(0, 10),
      cambio: config?.cambio_usd || 5.3, container_tipo: "40' High Cube",
      frete_internacional_usd: 0, seguro_usd: 0, despesas_locais_usd: 0,
      itens: [], status: "simulacao"
    });
    setImportResult(null);
    setCubageResult(null);
    setView("editor");
  };

  const openEdit = (op) => {
    setEditing(op);
    setForm({ ...op, itens: op.itens || [] });
    setImportResult(op.resultado_importacao || null);
    setCubageResult(op.resultado_cubagem || null);
    setView("editor");
  };

  const f = (field) => (e) => {
    const val = e.target.type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value;
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const addProduct = (product) => {
    setForm(prev => ({
      ...prev,
      itens: [...(prev.itens || []), { product_id: product.id, product_name: product.name, sku: product.sku, qty: 1, consolidado: !!product.embalagem_consolidada, fob_declarado_usd: product.cost_fob_usd || 0 }]
    }));
    setProductSearch("");
  };

  const updateItem = (i, field, val) => {
    setForm(prev => ({ ...prev, itens: prev.itens.map((it, idx) => idx === i ? { ...it, [field]: val } : it) }));
  };

  const removeItem = (i) => {
    setForm(prev => ({ ...prev, itens: prev.itens.filter((_, idx) => idx !== i) }));
  };

  const buildEngineItems = () => {
    return (form.itens || []).map(it => {
      const product = products.find(p => p.id === it.product_id);
      const produto = produtoFromProduct(product || { id: it.product_id, name: it.product_name });
      // decisão de embarque é POR OPERAÇÃO: o cadastro é só o padrão inicial
      produto.embalagem_consolidada = it.consolidado ?? produto.embalagem_consolidada;
      // custo REAL por item: o digitado na operação vence o cadastro (nova compra
      // pode ter preço novo — ao concluir, o cadastro é atualizado com este valor)
      const custoOp = parseFloat(it.custo_usd);
      if (!isNaN(custoOp) && custoOp >= 0) produto.fob_unitario_usd = custoOp;
      // valor declarado POR ITEM (padrão = FOB real do cadastro)
      const decl = parseFloat(it.fob_declarado_usd);
      produto.fob_declarado_unitario_usd = isNaN(decl) ? produto.fob_unitario_usd : decl;
      produto.nao_declarado = !!it.nao_declarado;
      return { produto, quantidade: it.qty };
    }).filter(it => it.produto && it.quantidade > 0);
  };

  // ==== Remessas de pagamento: câmbio médio ponderado ====
  const calcCambioMedio = (remessas) => {
    const rs = (remessas || []).filter(r => (parseFloat(r.valor_usd) || 0) > 0 && (parseFloat(r.cotacao) || 0) > 0);
    if (!rs.length) return null;
    const totalUsd = rs.reduce((s, r) => s + parseFloat(r.valor_usd), 0);
    const totalBrl = rs.reduce((s, r) => s + parseFloat(r.valor_usd) * parseFloat(r.cotacao) + (parseFloat(r.taxas_brl) || 0), 0);
    return totalUsd > 0 ? totalBrl / totalUsd : null;
  };
  const cambioMedio = calcCambioMedio(form.remessas);
  const temConsolidada = (form.itens || []).some(it => it.consolidado ?? products.find(pr => pr.id === it.product_id)?.embalagem_consolidada);
  const cambioEfetivo = cambioMedio ?? (form.cambio || config?.cambio_usd || 5.3);

  // Quitação do fornecedor: as remessas devem cobrir o valor da compra (FOB do mix)
  const fobCompraUsd = (form.itens || []).reduce((t, item) => {
    const prod = products.find(pr => pr.id === item.product_id);
    const custoOp = parseFloat(item.custo_usd);
    const unit = (!isNaN(custoOp) && custoOp >= 0) ? custoOp : (prod?.cost_fob_usd || 0);
    return t + unit * (item.qty || item.quantidade || item.quantity || 0);
  }, 0);
  const totalEnviadoUsd = (form.remessas || []).reduce((t, r) => t + (parseFloat(r.valor_usd) || 0), 0);
  // O desconto do fornecedor abate o que há a pagar (fatura líquida)
  const descontoFornecedorUsd = parseFloat(form.desconto_fornecedor_usd) || 0;
  const compraLiquidaUsd = Math.round((fobCompraUsd - descontoFornecedorUsd) * 100) / 100;
  const saldoQuitarUsd = Math.round((compraLiquidaUsd - totalEnviadoUsd) * 100) / 100;
  const fmtUsd = (v) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const addRemessa = () => setForm(prev => ({ ...prev, remessas: [...(prev.remessas || []), { data: new Date().toISOString().slice(0, 10), valor_usd: "", cotacao: "", taxas_brl: "" }] }));
  const updRemessa = (i, campo, val) => setForm(prev => ({ ...prev, remessas: prev.remessas.map((r, idx) => idx === i ? { ...r, [campo]: val } : r) }));
  const delRemessa = (i) => setForm(prev => ({ ...prev, remessas: prev.remessas.filter((_, idx) => idx !== i) }));

  // ==== Remessas → Financeiro: cada envio vira uma conta paga (saída de caixa real) ====
  const sincronizarRemessasFinanceiro = async (opId, opNome, remessas) => {
    if (!opId) return;
    const antigas = await base44.entities.FinancialEntry.filter({ reference_id: opId, reference_type: "import_remessa" }, "-created_date", 100).catch(() => []);
    for (const e of antigas || []) {
      await base44.entities.FinancialEntry.delete(e.id).catch(() => {});
    }
    const rs = (remessas || []).filter(r => (parseFloat(r.valor_usd) || 0) > 0 && (parseFloat(r.cotacao) || 0) > 0);
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      const valorBrl = Math.round((parseFloat(r.valor_usd) * parseFloat(r.cotacao) + (parseFloat(r.taxas_brl) || 0)) * 100) / 100;
      await base44.entities.FinancialEntry.create({
        type: "payable",
        category: "import",
        description: `Remessa ${i + 1}/${rs.length} — ${opNome || "Importação"} (US$ ${parseFloat(r.valor_usd).toLocaleString("pt-BR")} @ ${parseFloat(r.cotacao).toFixed(4)})`,
        reference_id: opId,
        reference_type: "import_remessa",
        amount: valorBrl,
        due_date: r.data || new Date().toISOString().slice(0, 10),
        payment_date: r.data || new Date().toISOString().slice(0, 10),
        status: "paid",
        payment_method: "transfer",
      });
    }
  };

  // ==== Custos da nacionalização → Financeiro (04/09/2026, auditoria do Container 01) ====
  // Só as remessas viravam lançamento; numerário ao despachante, frete internacional e a
  // diferença/ressarcimento da nacionalização ficavam fora do caixa e da DRE realizada.
  const sincronizarCustosImportacaoFinanceiro = async (opId, opNome, f, totais) => {
    if (!opId || !totais) return;
    const antigas = await base44.entities.FinancialEntry.filter({ reference_id: opId, reference_type: "import_custo" }, "-created_date", 100).catch(() => []);
    for (const e of antigas || []) {
      if (e.status === "paid" && !(e.description || "").startsWith("Numerário")) continue; // conta já baixada à mão fica
      await base44.entities.FinancialEntry.delete(e.id).catch(() => {});
    }
    const contas = await base44.entities.CashAccount.list("nome", 50).catch(() => []);
    const contaTransf = (contas || []).find(c => c.ativo !== false && (c.metodos || []).includes("transfer"))?.id || null;
    const dataOp = f.data || new Date().toISOString().slice(0, 10);
    const r2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
    const cria = (d) => base44.entities.FinancialEntry.create({ category: "import", reference_id: opId, reference_type: "import_custo", payment_method: "transfer", account_id: contaTransf, due_date: dataOp, ...d });
    const numerario = r2(f.numerario_enviado_brl);
    const nacionalizacao = r2((totais.ii || 0) + (totais.ipi || 0) + (totais.pis_imp || 0) + (totais.cofins_imp || 0) + (totais.icms_imp || 0) + (totais.despesas_brl || 0));
    const cambioFrete = parseFloat(f.cambio_chegada) || parseFloat(f.cambio) || cambioEfetivo || 0;
    const freteBrl = r2((parseFloat(f.frete_internacional_usd) || 0) * cambioFrete);
    const seguroBrl = r2((parseFloat(f.seguro_usd) || 0) * cambioFrete);
    if (numerario > 0) await cria({ type: "payable", status: "paid", payment_date: dataOp, amount: numerario, description: `Numerário ao despachante (nacionalização) — ${opNome}${f.numerario_obs ? ` · ${f.numerario_obs}` : ""}` });
    if (freteBrl > 0) await cria({ type: "payable", status: "pending", amount: freteBrl, description: `Frete internacional — ${opNome} (US$ ${(parseFloat(f.frete_internacional_usd) || 0).toLocaleString("pt-BR")} @ ${cambioFrete.toFixed(4)})` });
    if (seguroBrl > 0) await cria({ type: "payable", status: "pending", amount: seguroBrl, description: `Seguro internacional — ${opNome}` });
    const saldo = r2(numerario - nacionalizacao);
    if (numerario <= 0 && nacionalizacao > 0) await cria({ type: "payable", status: "pending", amount: nacionalizacao, description: `Impostos e despesas de nacionalização — ${opNome}` });
    else if (saldo > 0) await cria({ type: "receivable", status: "pending", amount: saldo, description: `Ressarcimento do numerário (sobra) — despachante — ${opNome}` });
    else if (saldo < 0) await cria({ type: "payable", status: "pending", amount: -saldo, description: `Diferença da nacionalização a pagar — despachante — ${opNome}` });
  };

  // ==== Finalizar Importação: recalcula, mostra conferência e executa tudo ====
  const [finalizarOpen, setFinalizarOpen] = useState(false);
  const [resumoFinal, setResumoFinal] = useState(null);
  const [finalizando, setFinalizando] = useState(false);

  const abrirFinalizacao = () => {
    const engineItems = buildEngineItems();
    if (!engineItems.length) { alert("A operação não tem produtos."); return; }
    const configMotor = configParaMotor(config);
    const operacaoEngine = { cambio: cambioEfetivo, cambio_chegada: form.cambio_chegada, frete_internacional_usd: form.frete_internacional_usd || 0, despesas_locais_brl: form.despesas_locais_brl, despesas_locais_usd: form.despesas_locais_usd || 0, seguro_usd: form.seguro_usd || 0, desconto_fornecedor_usd: form.desconto_fornecedor_usd || 0, caixa_pecas: form.caixa_pecas };
    const result = calcularOperacaoImportacao(engineItems, operacaoEngine, configMotor, form.data || "2026-01-01", 1.0);
    const container = CONTAINERS_PADRAO.find(c => c.nome === form.container_tipo) || CONTAINERS_PADRAO[2];
    const cubage = calcularCubagem(engineItems, container, form.caixa_pecas);
    setImportResult(result);
    setCubageResult(cubage);
    setResumoFinal(result);
    setFinalizarOpen(true);
  };

  const confirmarFinalizacao = async () => {
    if (!resumoFinal?.resultados || !editing?.id) return;
    setFinalizando(true);
    try {
      // Fluxo em 2 tempos: 1ª finalização = "realizada" (prévia, com o numerário);
      // 2ª finalização (valores reais ajustados) = "concluida" — recalcula tudo.
      const statusFinal = ["realizada", "concluida"].includes(editing?.status) ? "concluida" : "realizada";
      // 1) Custo landed + custo FOB real (o custo digitado na operação atualiza o cadastro)
      await base44.entities.Product.bulkUpdate(
        resumoFinal.resultados.filter(r => r.produto?.id).map(r => ({
          id: r.produto.id,
          cost_landed_brl: r.custo_unitario_formacao,
          cost_fob_usd: r.produto.fob_unitario_usd,
        }))
      );
      // 1b) Histórico de custo por produto (pedido da operação: ver a evolução do
      //     custo a cada importação, como o Tiny fazia). Idempotente por operação:
      //     mesma referência + mesmo custo = não duplica; custo diferente (2ª
      //     finalização com valores reais) = registro novo, preservando a prévia.
      //     Falha aqui NÃO derruba a finalização.
      try {
        const hoje = new Date().toISOString().slice(0, 10);
        for (const r of resumoFinal.resultados.filter(x => x.produto?.id)) {
          const custo = Math.round((parseFloat(r.custo_unitario_formacao) || 0) * 100) / 100;
          const anteriores = await base44.entities.ProductCostHistory.filter(
            { product_id: r.produto.id, referencia: form.nome }, "-data", 100
          );
          const ultimo = (anteriores || []).sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))[0];
          if (ultimo && Math.abs((parseFloat(ultimo.custo) || 0) - custo) < 0.01) continue;
          await base44.entities.ProductCostHistory.create({
            product_id: r.produto.id,
            custo,
            origem: "importacao",
            referencia: form.nome,
            data: hoje,
          });
        }
      } catch (err) {
        console.error("Histórico de custo não gravado (finalização segue normalmente):", err);
      }
      // 2) Entrada no estoque via Kardex (uma única vez); no fechamento final,
      //    a entrada já existe — só o CUSTO dos movimentos é atualizado.
      const jaEntrou = await operacaoJaDeuEntrada(editing.id);
      if (!jaEntrou) {
        await entradaImportacao(resumoFinal.resultados, editing.id, form.nome);
      } else {
        await atualizarCustoEntradaImportacao(editing.id, resumoFinal.resultados, form.nome);
      }
      // 3) Grava a operação com os resultados finais
      await base44.entities.ImportOperation.update(editing.id, {
        ...form,
        status: statusFinal,
        cambio: cambioEfetivo,
        resultado_importacao: resumoFinal,
        resultado_cubagem: cubageResult,
      });
      await sincronizarRemessasFinanceiro(editing.id, form.nome, form.remessas).catch((err) => {
        alert(`Operação finalizada, mas houve erro ao sincronizar as remessas no Financeiro: ${err.message}`);
      });
      await sincronizarCustosImportacaoFinanceiro(editing.id, form.nome, form, resumoFinal.totais).catch((err) => {
        alert(`Operação finalizada, mas houve erro ao lançar numerário/frete/nacionalização no Financeiro: ${err.message}`);
      });
      setFinalizarOpen(false);
      setView("list");
      loadData();
    } catch (err) {
      alert(`Erro ao finalizar: ${err.message}`);
    }
    setFinalizando(false);
  };

  const handleCalculate = () => {
    const engineItems = buildEngineItems();
    if (!engineItems.length) return;

    const configMotor = configParaMotor(config);
    const operacaoEngine = {
      cambio: cambioEfetivo,
      cambio_chegada: form.cambio_chegada,
      frete_internacional_usd: form.frete_internacional_usd || 0,
      despesas_locais_brl: form.despesas_locais_brl,
      despesas_locais_usd: form.despesas_locais_usd || 0,
      seguro_usd: form.seguro_usd || 0,
      desconto_fornecedor_usd: form.desconto_fornecedor_usd || 0,
      caixa_pecas: form.caixa_pecas,
    };

    const result = calcularOperacaoImportacao(engineItems, operacaoEngine, configMotor, form.data || "2026-01-01", 1.0);
    // Comparativo: mesmo mix com declaração 100% (declarado = real)
    const itensCheio = engineItems.map(it => ({ ...it, produto: { ...it.produto, fob_declarado_unitario_usd: it.produto.fob_unitario_usd, nao_declarado: false } }));
    const resultCheio = calcularOperacaoImportacao(itensCheio, operacaoEngine, configMotor, form.data || "2026-01-01", 1.0);
    const somaImp = (t) => (t.ii || 0) + (t.ipi || 0) + (t.pis_imp || 0) + (t.cofins_imp || 0) + (t.icms_imp || 0);
    result.comparativo_cheio = {
      impostos_declarado: somaImp(result.totais),
      impostos_cheio: somaImp(resultCheio.totais),
      desembolso_declarado: result.totais.desembolso_caixa,
      desembolso_cheio: resultCheio.totais.desembolso_caixa,
    };
    setImportResult(result);

    const container = CONTAINERS_PADRAO.find(c => c.nome === form.container_tipo) || CONTAINERS_PADRAO[2];
    const cubage = calcularCubagem(engineItems, container, form.caixa_pecas);
    setCubageResult(cubage);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        ...form,
        resultado_cubagem: cubageResult,
        resultado_importacao: importResult,
        cambio: cambioEfetivo
      };

      const wasRealizada = ["realizada", "concluida"].includes(editing?.status);
      const isRealizada = ["realizada", "concluida"].includes(form.status);

      // O caminho CERTO para Realizada/Concluída são os botões "Finalizar
      // Importação (prévia)" e "Recalcular e Concluir": eles recalculam com os
      // valores atuais e dão entrada no estoque com rastro correto. Trocar o
      // status pelo dropdown pulava o recálculo e, em operação nova, gerava
      // movimentos órfãos (origem_id vazio) que depois entravam em DOBRO.
      if (isRealizada && !wasRealizada) {
        alert('Para efetivar a operação use o botão "Finalizar Importação (prévia)" — salvei mantendo o status anterior.');
        data.status = editing?.status || "simulacao";
      }

      let opId = editing?.id;
      if (editing) {
        await base44.entities.ImportOperation.update(editing.id, data);
      } else {
        const created = await base44.entities.ImportOperation.create(data);
        opId = created.id;
      }

      // Remessas viram contas pagas no Financeiro (fluxo de caixa real da importação)
      await sincronizarRemessasFinanceiro(opId, form.nome, form.remessas).catch((err) => {
        alert(`Operação salva, mas houve erro ao sincronizar as remessas no Financeiro: ${err.message}`);
      });

      setView("list");
      loadData();
    } catch (err) {
      alert(`Não foi possível salvar a operação: ${err.message}`);
    }
    setSaving(false);
  };

  const handleDeleteOp = async (op) => {
    try {
      const jaEntrou = await operacaoJaDeuEntrada(op.id);
      let msg = `Excluir a operação "${op.nome || "Sem nome"}"?`;
      msg += `\n\n• As contas das remessas desta operação no Financeiro serão excluídas.`;
      if (jaEntrou) {
        msg += `\n• ATENÇÃO: esta operação JÁ DEU ENTRADA no estoque. A entrada NÃO será desfeita — o Kardex preserva o histórico. Se o estoque precisar voltar, faça um Ajuste de Inventário na tela de Estoque.`;
      }
      if (!confirm(msg)) return;
      const remessas = await base44.entities.FinancialEntry.filter({ reference_id: op.id, reference_type: "import_remessa" }, "-created_date", 100);
      for (const e of remessas || []) {
        await base44.entities.FinancialEntry.delete(e.id);
      }
      await base44.entities.ImportOperation.delete(op.id);
    } catch (err) {
      alert(`Não foi possível excluir a operação: ${err.message}`);
    }
    loadData();
  };

  const filteredProducts = products.filter(p =>
    !productSearch ||
    p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filteredOps = operations.filter(o => !search || o.nome?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (view === "list") return (
    <div>
      <PageHeader title="Simulador de Importação" description={`${operations.length} operações cadastradas`}
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nova Operação</Button>} />

      {operations.length === 0 ? (
        <EmptyState icon={Ship} title="Nenhuma operação de importação" description="Crie uma simulação para calcular custos e cubagem." actionLabel="Nova Operação" onAction={openNew} />
      ) : (
        <>
          <div className="mb-4 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar operação..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Operação</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Data</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Container</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Itens</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Custo Formação</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOps.map(op => (
                    <tr key={op.id} className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => openEdit(op)}>
                      <td className="px-4 py-3 font-medium">{op.nome || "Sem nome"}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{op.data ? new Date(op.data).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">{op.container_tipo || "—"}</td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">{op.itens?.length || 0}</td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell font-medium">{op.resultado_importacao?.totais?.custo_formacao_preco ? fmtBRL(op.resultado_importacao.totais.custo_formacao_preco) : "—"}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={op.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); openEdit(op); }}>Abrir</Button>
                          <button onClick={e => { e.stopPropagation(); handleDeleteOp(op); }} className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors" title="Excluir operação">
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={() => setView("list")}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
        <h1 className="text-xl font-heading font-bold">{editing ? "Editar Operação" : "Nova Operação"}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Dados da Operação</h3>
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={form.nome || ""} onChange={f("nome")} placeholder="Ex: Container 40HC Shenzhen Jan/26" /></div>
              <div><Label>Data</Label><Input type="date" value={form.data || ""} onChange={f("data")} /></div>
              <div><Label>Status</Label>
                <Select value={form.status || "simulacao"} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Câmbio USD (R$)</Label>
                {cambioMedio != null ? (
                  <>
                    <Input type="number" value={cambioMedio.toFixed(4)} readOnly disabled className="bg-muted" />
                    <p className="text-[10px] text-primary mt-1 font-medium">Câmbio médio ponderado de {(form.remessas || []).filter(r => parseFloat(r.valor_usd) > 0).length} remessa(s)</p>
                  </>
                ) : (
                  <Input type="number" step="0.01" value={form.cambio ?? ""} onChange={f("cambio")} />
                )}
              </div>
              <div><Label>Container</Label>
                <Select value={form.container_tipo || "40' High Cube"} onValueChange={v => setForm({ ...form, container_tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTAINERS_PADRAO.map(c => <SelectItem key={c.nome} value={c.nome}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
                {(form.container_tipo || "").startsWith("40' NOR") && (
                  <p className="text-[10px] text-warning mt-1">NOR = reefer com o frio desligado, mais barato porque o armador precisa reposicionar. Interno útil 11,56 × 2,28 × 2,43 m (o 40' HC seco tem 12,03 × 2,35 × 2,69): caixa acima de 1,21 m não empilha em dupla. Piso de alumínio: máx. 3.000 kg por metro corrido, máquina só sobre estrado de madeira, sem empilhadeira dentro. Maquinário pesado costuma ser recusado — confirmar aceite por escrito com o armador antes de fechar o frete.</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Custos em USD</h3>
            <div className="space-y-3">
              <div><Label>Frete Internacional (USD)</Label><Input type="number" step="0.01" value={form.frete_internacional_usd ?? ""} onChange={f("frete_internacional_usd")} /></div>
              <div><Label>Seguro (USD)</Label><Input type="number" step="0.01" value={form.seguro_usd ?? ""} onChange={f("seguro_usd")} /></div>
              <div><Label>Despesas Locais (R$)</Label><Input type="number" step="0.01" value={form.despesas_locais_brl ?? ""} onChange={f("despesas_locais_brl")} /><p className="text-[10px] text-muted-foreground mt-1">Despachante, porto, armazenagem — pagos no Brasil, em reais.</p></div>
              <div><Label>Desconto do Fornecedor (USD)</Label><Input type="number" step="0.01" value={form.desconto_fornecedor_usd ?? ""} onChange={f("desconto_fornecedor_usd")} /><p className="text-[10px] text-muted-foreground mt-1">Abatimento na fatura (ex.: desconto de acessórios). Reduz o custo real rateado por item — não altera impostos nem valores declarados.</p></div>
              <div><Label>Câmbio na chegada / DI (R$)</Label><Input type="number" step="0.0001" value={form.cambio_chegada ?? ""} onChange={f("cambio_chegada")} /><p className="text-[10px] text-muted-foreground mt-1">A carga chega 30-40 dias após o pagamento: IMPOSTOS e FRETE são calculados no dólar da chegada (DI), não no das remessas. Enquanto viaja, use uma projeção; quando a DI sair, coloque a cotação real e use "Recalcular e Concluir". Vazio = usa o câmbio das remessas.</p></div>
              {temConsolidada && (
                <div className="sm:col-span-2 border border-dashed rounded-lg p-3">
                  <Label className="font-semibold">Caixa de peças consolidada (mm)</Label>
                  <p className="text-xs text-muted-foreground mb-2">As peças de reposição marcadas como "consolidadas" viajam dentro destas caixas — são elas que entram na cubagem do container e no rateio do frete. Informe as medidas de UMA caixa e quantas caixas iguais virão.</p>
                  <div className="grid grid-cols-4 gap-2">
                    <div><Label className="text-xs">Nº de caixas</Label><Input type="number" min="1" value={form.caixa_pecas?.qtd ?? 1} onChange={e => setForm({ ...form, caixa_pecas: { ...(form.caixa_pecas || {}), qtd: parseInt(e.target.value) || 1, c_mm: form.caixa_pecas?.c_mm ?? 600, l_mm: form.caixa_pecas?.l_mm ?? 400, a_mm: form.caixa_pecas?.a_mm ?? 400 } })} /></div>
                    <div><Label className="text-xs">Comprimento</Label><Input type="number" value={form.caixa_pecas?.c_mm ?? 600} onChange={e => setForm({ ...form, caixa_pecas: { ...(form.caixa_pecas || {}), c_mm: parseFloat(e.target.value) || 0, l_mm: form.caixa_pecas?.l_mm ?? 400, a_mm: form.caixa_pecas?.a_mm ?? 400 } })} /></div>
                    <div><Label className="text-xs">Largura</Label><Input type="number" value={form.caixa_pecas?.l_mm ?? 400} onChange={e => setForm({ ...form, caixa_pecas: { ...(form.caixa_pecas || {}), c_mm: form.caixa_pecas?.c_mm ?? 600, l_mm: parseFloat(e.target.value) || 0, a_mm: form.caixa_pecas?.a_mm ?? 400 } })} /></div>
                    <div><Label className="text-xs">Altura</Label><Input type="number" value={form.caixa_pecas?.a_mm ?? 400} onChange={e => setForm({ ...form, caixa_pecas: { ...(form.caixa_pecas || {}), c_mm: form.caixa_pecas?.c_mm ?? 600, l_mm: form.caixa_pecas?.l_mm ?? 400, a_mm: parseFloat(e.target.value) || 0 } })} /></div>
                  </div>
                </div>
              )}
            </div>
          </div>



        </div>

        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-heading font-semibold text-sm">Remessas de Pagamento</h3>
              <Button size="sm" variant="outline" onClick={addRemessa}><Plus className="w-3.5 h-3.5 mr-1" /> Remessa</Button>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">Lance cada envio ao fornecedor. O câmbio da operação vira a média ponderada automaticamente.</p>
            {(form.remessas || []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">Nenhuma remessa lançada — o câmbio manual acima será usado.</p>
            ) : (
              <div className="space-y-2">
                {(form.remessas || []).map((r, i) => (
                  <div key={i} className="rounded-lg border border-border p-3 relative">
                    <button onClick={() => delRemessa(i)} className="absolute top-2 right-2 p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-4 h-4 text-destructive" /></button>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-8">
                      <div><Label className="text-xs">Data do envio</Label><Input type="date" value={r.data || ""} onChange={e => updRemessa(i, "data", e.target.value)} /></div>
                      <div><Label className="text-xs">Valor enviado (USD)</Label><Input type="number" step="0.01" value={r.valor_usd} onChange={e => updRemessa(i, "valor_usd", e.target.value)} placeholder="10.000,00" /></div>
                      <div><Label className="text-xs">Cotação do dólar (R$)</Label><Input type="number" step="0.0001" value={r.cotacao} onChange={e => updRemessa(i, "cotacao", e.target.value)} placeholder="5,2000" /></div>
                      <div><Label className="text-xs">Taxas bancárias (R$)</Label><Input type="number" step="0.01" value={r.taxas_brl} onChange={e => updRemessa(i, "taxas_brl", e.target.value)} placeholder="0,00" /></div>
                    </div>
                  </div>
                ))}
                {cambioMedio != null && (
                  <div className="flex justify-between items-center px-3 py-2 bg-primary/5 rounded-lg text-sm mt-1">
                    <span className="text-muted-foreground text-xs">Total enviado: US$ {fmtUsd(totalEnviadoUsd)}</span>
                    <span className="font-bold text-primary">Câmbio médio: R$ {cambioMedio.toFixed(4)}</span>
                  </div>
                )}
              </div>
            )}
            {fobCompraUsd > 0 && (
              <div className={`mt-3 rounded-lg p-3 border ${saldoQuitarUsd > 0 ? "bg-warning/10 border-warning/30" : "bg-success/10 border-success/30"}`}>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Valor da compra (FOB do mix)</span><span className="font-semibold">US$ {fmtUsd(fobCompraUsd)}</span></div>
                {descontoFornecedorUsd > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">− Desconto do fornecedor</span><span className="font-semibold text-success">− US$ {fmtUsd(descontoFornecedorUsd)}</span></div>
                )}
                {descontoFornecedorUsd > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Compra líquida a pagar</span><span className="font-semibold">US$ {fmtUsd(compraLiquidaUsd)}</span></div>
                )}
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total enviado ao fornecedor</span><span className="font-semibold">US$ {fmtUsd(totalEnviadoUsd)}</span></div>
                <div className="flex justify-between text-sm border-t border-border mt-1.5 pt-1.5">
                  <span className="font-medium">{saldoQuitarUsd > 0 ? "Falta enviar" : saldoQuitarUsd < 0 ? "Enviado a mais" : "Fornecedor quitado"}</span>
                  <span className={`font-bold ${saldoQuitarUsd > 0 ? "text-warning" : "text-success"}`}>{saldoQuitarUsd === 0 ? "✓" : `US$ ${fmtUsd(Math.abs(saldoQuitarUsd))}`}</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-1">Conciliação do Numerário (despachante)</h3>
            <p className="text-[11px] text-muted-foreground mb-3">Quanto você adiantou em R$ para a nacionalização (impostos + despesas). Após o Calcular, o sistema aponta ressarcimento ou diferença a pagar.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Numerário enviado (R$)</Label><Input type="number" step="0.01" value={form.numerario_enviado_brl ?? ""} onChange={f("numerario_enviado_brl")} placeholder="0,00" /></div>
              <div><Label className="text-xs">Observação</Label><Input value={form.numerario_obs || ""} onChange={e => setForm({ ...form, numerario_obs: e.target.value })} placeholder="Ex: adiantado à Pesti em 10/08" /></div>
            </div>
            {(() => {
              const enviado = parseFloat(form.numerario_enviado_brl) || 0;
              const t = importResult?.totais;
              if (!enviado || !t) return null;
              const nacionalizacao = (t.ii || 0) + (t.ipi || 0) + (t.pis_imp || 0) + (t.cofins_imp || 0) + (t.icms_imp || 0) + (t.despesas_brl || 0);
              const saldo = Math.round((enviado - nacionalizacao) * 100) / 100;
              const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
              return (
                <div className={`mt-3 rounded-lg p-3 border ${saldo >= 0 ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30"}`}>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Numerário enviado</span><span className="font-semibold">{fmt(enviado)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Custo real da nacionalização (impostos + despesas)</span><span className="font-semibold">{fmt(nacionalizacao)}</span></div>
                  <div className="flex justify-between text-sm border-t border-border mt-1.5 pt-1.5">
                    <span className="font-medium">{saldo > 0 ? "💰 A RESSARCIR (sobrou)" : saldo < 0 ? "⚠️ DIFERENÇA A PAGAR" : "Conta exata"}</span>
                    <span className={`font-bold ${saldo >= 0 ? "text-success" : "text-destructive"}`}>{saldo === 0 ? "✓" : fmt(Math.abs(saldo))}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" variant="outline" onClick={handleCalculate} disabled={!form.itens?.length}>
              <Calculator className="w-4 h-4 mr-1" /> Calcular
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving || !form.nome}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar
            </Button>
          </div>
          {editing && !["realizada", "concluida"].includes(form.status) && (
            <Button className="w-full bg-success hover:bg-success/90 text-white" onClick={abrirFinalizacao} disabled={!importResult?.resultados}>
              Finalizar Importação (prévia)
            </Button>
          )}
          {form.status === "realizada" && (
            <>
              <Button className="w-full bg-primary hover:bg-primary/90" onClick={abrirFinalizacao} disabled={!importResult?.resultados}>
                Recalcular e Concluir (fechamento final)
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">Prévia realizada: estoque e preços já lançados com os valores do numerário. Quando os valores REAIS chegarem, ajuste aqui, clique Calcular e conclua — custos e Kardex são recalculados sem duplicar estoque.</p>
            </>
          )}
          {form.status === "concluida" && (
            <p className="text-xs text-success text-center font-medium">✅ Importação concluída — processo 100% fechado (custos finais no estoque e nos produtos).</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Adicionar Produtos</h3>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar produto..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredProducts.slice(0, 20).map(p => (
                <button key={p.id} onClick={() => addProduct(p)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-left transition-colors">
                  <Package className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.sku} · {fmtUSD(p.cost_fob_usd)}</p>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                </button>
              ))}
              {filteredProducts.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Nenhum produto encontrado.</p>}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="font-heading font-semibold text-sm mb-3">Mix de Produtos ({form.itens?.length || 0})</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {(form.itens || []).map((item, i) => (
                <div key={i} className="border border-border rounded-lg p-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.product_name}</p>
                      <p className="text-[10px] text-muted-foreground">{item.sku}</p>
                    </div>
                    <button onClick={() => removeItem(i)} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3 h-3 text-destructive" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">Qtd</span>
                      <Input type="number" min="1" value={item.qty || ""} onChange={e => updateItem(i, "qty", parseInt(e.target.value) || 0)} className="h-7 w-16 text-sm" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">Custo US$</span>
                      <Input type="number" step="0.01" value={item.custo_usd ?? products.find(pr => pr.id === item.product_id)?.cost_fob_usd ?? ""} onChange={e => updateItem(i, "custo_usd", e.target.value)} className="h-7 w-24 text-sm" />
                    </div>
                    {!item.nao_declarado && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Declarado US$</span>
                        <Input type="number" step="0.01" value={item.fob_declarado_usd ?? ""} onChange={e => updateItem(i, "fob_declarado_usd", e.target.value)} className="h-7 w-24 text-sm" placeholder={String(products.find(pr => pr.id === item.product_id)?.cost_fob_usd ?? "")} />
                      </div>
                    )}
                    <button type="button" onClick={() => updateItem(i, "nao_declarado", !item.nao_declarado)}
                      title="Item que NÃO aparece na invoice (acompanha a máquina como reposição): sem impostos e sem rateios — custo = preço real × câmbio"
                      className={`px-2 py-1 rounded text-[10px] font-medium ${item.nao_declarado ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"}`}>
                      {item.nao_declarado ? "🚫 não declarado" : "declarado"}
                    </button>
                    <button type="button" onClick={() => updateItem(i, "consolidado", !(item.consolidado ?? products.find(pr => pr.id === item.product_id)?.embalagem_consolidada))}
                      title="Nesta operação, esta peça embarca dentro da caixa de peças consolidada?"
                      className={`px-2 py-1 rounded text-[10px] font-medium ${(item.consolidado ?? products.find(pr => pr.id === item.product_id)?.embalagem_consolidada) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {(item.consolidado ?? products.find(pr => pr.id === item.product_id)?.embalagem_consolidada) ? "📦 consolidada" : "caixa própria"}
                    </button>
                  </div>
                  {(() => {
                    const cad = products.find(pr => pr.id === item.product_id)?.cost_fob_usd;
                    const novo = parseFloat(item.custo_usd);
                    if (item.custo_usd == null || item.custo_usd === "" || isNaN(novo) || cad == null || novo === cad) return null;
                    return <p className="text-[10px] text-warning mt-1">💾 Custo no cadastro: US$ {cad} → será atualizado para US$ {novo} ao finalizar/concluir</p>;
                  })()}
                </div>
              ))}
              {!form.itens?.length && <p className="text-xs text-muted-foreground text-center py-4">Adicione produtos ao mix.</p>}
            </div>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-3">
          {cubageResult && <CubageResults result={cubageResult} />}
          {importResult && <ImportResults result={importResult} />}
          {!cubageResult && !importResult && (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <Calculator className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Adicione produtos e clique em <strong>Calcular</strong> para ver a cubagem e o custo de importação.</p>
            </div>
          )}
        </div>
      </div>

      {finalizarOpen && resumoFinal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !finalizando && setFinalizarOpen(false)}>
          <div className="bg-card rounded-xl border border-border max-w-lg w-full max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-heading font-bold text-lg mb-1">Finalizar Importação</h3>
            <p className="text-xs text-muted-foreground mb-4">Confira antes de confirmar — esta ação grava o custo nos produtos, dá entrada no estoque e marca a operação como Realizada.</p>

            {saldoQuitarUsd > 0 && (
              <div className="px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg text-xs text-warning font-medium mb-3">
                Atenção: ainda faltam US$ {fmtUsd(saldoQuitarUsd)} de remessas para quitar o fornecedor (compra líquida de US$ {fmtUsd(compraLiquidaUsd)}, enviado US$ {fmtUsd(totalEnviadoUsd)}). Você pode finalizar mesmo assim, mas o câmbio médio ficará provisório.
              </div>
            )}
            <div className="px-3 py-2 bg-primary/5 rounded-lg text-sm flex justify-between mb-3">
              <span className="text-muted-foreground">Câmbio usado</span>
              <span className="font-bold text-primary">R$ {Number(cambioEfetivo).toFixed(4)}{calcCambioMedio(form.remessas) != null ? " (média ponderada)" : " (manual)"}</span>
            </div>

            <table className="w-full text-sm mb-3">
              <thead><tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left py-1.5">Produto</th>
                <th className="text-right py-1.5">Entrada Estoque</th>
                <th className="text-right py-1.5">Custo Landed/un</th>
              </tr></thead>
              <tbody>
                {resumoFinal.resultados.map((r, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5">{r.produto?.nome || r.produto_nome || "Produto"}</td>
                    <td className="py-1.5 text-right font-bold text-success">+{r.quantidade}</td>
                    <td className="py-1.5 text-right font-semibold">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(r.custo_unitario_formacao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-2 text-sm mb-4">
              <div className="px-3 py-2 bg-success/10 rounded-lg"><span className="block text-[10px] text-muted-foreground">Crédito ICMS gerado</span><span className="font-bold text-success">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(resumoFinal.totais?.credito_icms || 0)}</span></div>
              <div className="px-3 py-2 bg-success/10 rounded-lg"><span className="block text-[10px] text-muted-foreground">Crédito IPI gerado</span><span className="font-bold text-success">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(resumoFinal.totais?.credito_ipi || 0)}</span></div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFinalizarOpen(false)} disabled={finalizando}>Cancelar</Button>
              <Button className="bg-success hover:bg-success/90 text-white" onClick={confirmarFinalizacao} disabled={finalizando}>
                {finalizando ? "Executando..." : "Confirmar e Finalizar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}