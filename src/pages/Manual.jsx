import React, { useState } from "react";
import { BookOpen, Settings, Package, Ship, ShoppingCart, FileText, Factory, Wallet, ChevronDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import PageHeader from "../components/shared/PageHeader";

/**
 * Manual de Operação — o porta-luvas da Ferrari.
 * Editado junto com o sistema: toda mudança de fluxo relevante atualiza esta página.
 */

const CAPITULOS = [
  {
    id: "visao",
    icon: BookOpen,
    titulo: "1. Como o sistema pensa (leia primeiro)",
    resumo: "O fluxo inteiro em um parágrafo",
    corpo: (
      <>
        <p>O Gestor Robooster segue o caminho real da mercadoria: <strong>você importa → o custo real de cada máquina nasce no Simulador → vende com a margem na tela → fatura → a nota fiscal sai no clique → o estoque baixa, o financeiro lança e o cliente entra na Base Instalada</strong> para comprar peças e insumos para sempre.</p>
        <p className="mt-2">Regra de ouro: <strong>cada dado nasce em um lugar só e flui para os outros</strong>. Custo nasce na importação. Preço nasce na precificação. Estoque nunca se edita — se movimenta. Imposto é calculado pelo regime vigente e <em>carimbado</em> no pedido para sempre.</p>
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <span><strong>Antes de tudo:</strong> confira a Configuração Tributária (capítulo 2). Com o RBT12 zerado, todos os cálculos usam a 1ª faixa do Simples (4%) — margens vão parecer melhores do que são.</span>
        </div>
      </>
    ),
  },
  {
    id: "config",
    icon: Settings,
    titulo: "2. Configuração Tributária — o coração dos números",
    resumo: "Regime, RBT12, despesas fixas e sócios",
    corpo: (
      <>
        <p><strong>Para que serve:</strong> aqui mora o regime de impostos que contamina TODOS os cálculos do sistema (precificação, margem do pedido, DRE, simulador de importação).</p>
        <ul className="list-disc pl-5 mt-2 space-y-1.5">
          <li><strong>Regime vigente:</strong> Simples Nacional (o atual da RB Ressuti) ou Lucro Presumido. É uma chave — quando a empresa migrar, um clique vira o sistema inteiro. O histórico NÃO é reescrito (cada pedido guarda o imposto da sua época).</li>
          <li><strong>RBT12:</strong> a receita bruta dos últimos 12 meses (o contador informa; está no PGDAS). Define a <em>alíquota efetiva</em> do DAS — o painel mostra a faixa do Anexo I e avisa quando você se aproxima de trocar de faixa, do sublimite de ICMS (R$ 3,6 mi) e do teto (R$ 4,8 mi). <strong>Atualize todo mês</strong> (ou quando fechar o PGDAS).</li>
          <li><strong>Despesas fixas mensais:</strong> alimentam o Break-even e a DRE Realizada. Mantenha fiéis (aluguel, contabilidade, marketing...).</li>
          <li><strong>Sócios:</strong> participação de cada um — usada na distribuição de lucros da DRE.</li>
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">Alíquota <em>nominal</em> é a da tabela; a <em>efetiva</em> — que é a que você paga no DAS — sai da fórmula (RBT12 × nominal − dedução) ÷ RBT12. O sistema sempre usa a efetiva.</p>
      </>
    ),
  },
  {
    id: "cadastros",
    icon: Package,
    titulo: "3. Cadastros — Produtos, Categorias e Contatos",
    resumo: "As 3 linhas, compatibilidade peça↔máquina, clientes com IE",
    corpo: (
      <>
        <p><strong>Ordem certa de cadastro:</strong> primeiro as máquinas, depois as peças (porque a peça aponta para as máquinas em que serve).</p>
        <ul className="list-disc pl-5 mt-2 space-y-1.5">
          <li><strong>Categorias (4):</strong> Coladeira de Borda · Coletor de Pó · Peças de Reposição · Insumos. Elas controlam o comportamento: máquina entra na Base Instalada; peça/insumo pede compatibilidade.</li>
          <li><strong>Produto máquina:</strong> SKU, modelo, NCM (pergunte ao despachante — vai na nota fiscal!), dimensões e peso (usados na cubagem do container), <em>lead time de reposição</em> (importado: 90-120 dias — alimenta o alerta de estoque).</li>
          <li><strong>Produto peça/insumo:</strong> ao escolher a categoria, aparecem os botões das máquinas — <strong>marque todas em que a peça serve</strong>. É isso que responde "qual refil serve na WF-802?" e alimenta a venda recorrente.</li>
          <li><strong>Custo:</strong> não digite custo de máquina importada na mão — ele nasce do Simulador (cap. 4) ao finalizar a operação. O campo manual é para itens comprados no Brasil.</li>
          <li><strong>Contatos:</strong> todo cliente precisa de CPF/CNPJ. <strong>Cliente PJ precisa de Inscrição Estadual</strong> (ou a palavra ISENTO) — sem isso a SEFAZ rejeita a nota. Marque o tipo "Cliente" para ele aparecer nos pedidos.</li>
        </ul>
      </>
    ),
  },
  {
    id: "importacao",
    icon: Ship,
    titulo: "4. Importação — onde o custo real nasce",
    resumo: "Simulador, remessas, subfaturamento, numerário, finalizar",
    corpo: (
      <>
        <p><strong>Para que serve:</strong> transformar uma operação da China no <em>custo real por máquina</em> (landed cost) — e conferir o dinheiro com o despachante.</p>
        <p className="mt-2"><strong>Passo a passo:</strong></p>
        <ol className="list-decimal pl-5 mt-1 space-y-1.5">
          <li><strong>Crie a operação</strong> e adicione os produtos com quantidades e FOB;</li>
          <li><strong>Frete internacional, seguro e despesas</strong> (valores do despachante) — o sistema rateia por volume e valor;</li>
          <li><strong>Remessas de Pagamento:</strong> lance CADA envio ao fornecedor (data, US$, cotação, taxas do banco). O <em>câmbio médio ponderado</em> vira o câmbio da operação sozinho, e o painel mostra se o fornecedor está quitado. Cada remessa também vira conta paga no Financeiro;</li>
          <li><strong>Valor Declarado na Invoice</strong> (o slider): o custo de formação usa o valor REAL; os impostos são calculados sobre o percentual declarado. Enquanto operar assim, o número que vale é o desta tela — a planilha aposentou;</li>
          <li><strong>Numerário do despachante:</strong> informe quanto adiantou em R$; após Calcular, o sistema compara com o custo real da nacionalização e mostra <span className="text-success font-medium">A RESSARCIR</span> ou <span className="text-destructive font-medium">DIFERENÇA A PAGAR</span>;</li>
          <li><strong>Calcular → Salvar → Finalizar Importação:</strong> o Finalizar é o gatilho — grava o custo landed em cada produto e dá entrada das quantidades no estoque (uma única vez, com rastro no Kardex).</li>
        </ol>
        <p className="mt-2 text-sm text-muted-foreground">No Simples não existe crédito de ICMS/IPI da importação — o sistema já joga tudo no custo. Ao migrar para Presumido, a chave do cap. 2 reativa os créditos automaticamente.</p>
      </>
    ),
  },
  {
    id: "vendas",
    icon: ShoppingCart,
    titulo: "5. Venda — pedido com margem na tela",
    resumo: "Status que fazem coisas, reserva de estoque, carimbo fiscal",
    corpo: (
      <>
        <p><strong>Para que serve:</strong> nunca mais fechar negócio no escuro. Ao montar o pedido, o painel mostra em tempo real: receita → DAS → comissão do canal → comissão do vendedor → custo + frete → <strong>MARGEM LÍQUIDA</strong> (verde saudável, âmbar apertada &lt;12%, vermelho prejuízo).</p>
        <p className="mt-2"><strong>Os status fazem coisas — decore estes três efeitos:</strong></p>
        <ul className="list-disc pl-5 mt-1 space-y-1.5">
          <li><strong>Pendente / Aprovado:</strong> RESERVA o estoque (aparece na coluna "Reservado" — casa com a reserva-com-sinal do site);</li>
          <li><strong>Faturado / Enviado / Entregue:</strong> baixa o estoque de verdade, gera as contas a receber no Financeiro (com liberação líquida se for marketplace), grava o cliente na Base Instalada (se tem máquina no pedido) e <em>carimba</em> o imposto da época no pedido;</li>
          <li><strong>Sem estoque disponível?</strong> O pedido volta para Pendente e avisa — o Kardex é a fonte da verdade.</li>
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">Item sem custo cadastrado = aviso amarelo no painel ("a margem real é menor"). Resolva cadastrando o custo, não ignorando o aviso.</p>
      </>
    ),
  },
  {
    id: "nfe",
    icon: FileText,
    titulo: "6. NF-e — a nota no clique",
    resumo: "Requisitos, emissão, DANFE, o que fazer quando rejeitar",
    corpo: (
      <>
        <p><strong>Como emitir:</strong> pedido <em>faturado</em> → botão <strong>"Emitir NF-e"</strong> na lista de pedidos → aguarde ~10 segundos → chip verde <strong>"NF nº"</strong> = autorizada. Clique no chip para abrir o DANFE (PDF).</p>
        <p className="mt-2"><strong>Checklist antes de emitir (evita 95% das rejeições):</strong></p>
        <ul className="list-disc pl-5 mt-1 space-y-1.5">
          <li>Cliente com CPF ou CNPJ no cadastro;</li>
          <li>Cliente PJ: <strong>Inscrição Estadual preenchida</strong> (ou ISENTO);</li>
          <li>Endereço completo do cliente (a SEFAZ valida município/UF/CEP);</li>
          <li>Produto com NCM correto (o do despachante).</li>
        </ul>
        <p className="mt-2"><strong>Se rejeitar:</strong> o botão vira "Reemitir" e a mensagem da SEFAZ fica no pedido (passe o mouse). Corrija o cadastro e clique de novo — a numeração não queima.</p>
        <p className="mt-2 text-sm text-muted-foreground">Ambiente atual: <strong>homologação</strong> (notas de teste, sem valor fiscal). A virada para produção é decisão do Mauricio — em série 2, separada do Bling. Certificado A1 vence em <strong>28/10/2026</strong>: renovar em outubro.</p>
      </>
    ),
  },
  {
    id: "base",
    icon: Factory,
    titulo: "7. Base Instalada — a máquina de vender peça",
    resumo: "Quem tem qual máquina e quem esfriou",
    corpo: (
      <>
        <p><strong>Para que serve:</strong> quem comprou coladeira compra fita, cola e refil <em>para sempre</em> — se alguém lembrar. Esta tela lembra por você.</p>
        <ul className="list-disc pl-5 mt-2 space-y-1.5">
          <li>Pedido faturado com máquina → o cliente entra sozinho com aquela máquina;</li>
          <li>Máquinas vendidas <strong>antes do ERP</strong>: use "Registrar Máquina" (cliente, modelo, nº de série, data) — <em>faça esse dever de casa uma vez e a tela vira ouro</em>;</li>
          <li>O filtro <strong>"Sem consumível há 60+ dias"</strong> é a sua lista de ligações da semana: clientes com máquina que não compram nada há tempo demais, ordenados do mais esquecido, cada um com botão de WhatsApp direto.</li>
        </ul>
      </>
    ),
  },
  {
    id: "financeiro",
    icon: Wallet,
    titulo: "8. Financeiro, DRE e Break-even — o placar",
    resumo: "O que é automático e o que conferir",
    corpo: (
      <>
        <ul className="list-disc pl-5 mt-1 space-y-1.5">
          <li><strong>Financeiro:</strong> contas a receber nascem do pedido faturado (parcelas, ou recebimento líquido na data de liberação se for marketplace); remessas de importação viram contas pagas. Lançamentos manuais só para o que não passa por pedido/importação;</li>
          <li><strong>DRE Realizada (botão na tela DRE):</strong> o mês como ele FOI — receita dos pedidos faturados, CMV dos custos reais, DAS carimbado, comissões, despesas fixas → resultado. É o seu fechamento mensal em 1 clique;</li>
          <li><strong>DRE Cenário:</strong> simulação a partir de uma operação de importação — "se eu vender este container assim, sobra quanto?";</li>
          <li><strong>Break-even:</strong> quantas unidades pagam as despesas fixas do mês.</li>
        </ul>
        <p className="mt-2"><strong>Rotina que funciona:</strong> segunda-feira, 10 minutos — Dashboard, lista de frios da Base Instalada, estoque disponível × alertas de reposição. Fechamento do mês: DRE Realizada + atualizar RBT12.</p>
      </>
    ),
  },
];

export default function Manual() {
  const [aberto, setAberto] = useState("visao");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Manual de Operação" description="A ordem de funcionamento da máquina — leia o capítulo 1 e opere sem medo" />

      <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 to-transparent p-4 mb-5 flex gap-3 items-start">
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm"><strong>O caminho feliz em uma linha:</strong> Configuração → Cadastros → Importação (custo nasce) → Pedido (margem na tela) → Faturar → NF-e no clique → Base Instalada vende de novo → DRE conta a história.</p>
      </div>

      <div className="space-y-2.5">
        {CAPITULOS.map((c) => {
          const Icon = c.icon;
          const isOpen = aberto === c.id;
          return (
            <div key={c.id} className={`bg-card border rounded-xl overflow-hidden transition-all ${isOpen ? "border-primary/40" : "border-border"}`}>
              <button onClick={() => setAberto(isOpen ? null : c.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors">
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isOpen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                </span>
                <span className="flex-1">
                  <span className="block font-heading font-semibold text-sm">{c.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{c.resumo}</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && <div className="px-4 pb-4 pt-1 text-sm leading-relaxed text-foreground/90 sm:pl-16">{c.corpo}</div>}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground text-center mt-6">Manual vivo — evolui junto com o sistema. Sentiu falta de algo? Avise o Mauricio, que avisa o Claude. 🔧</p>
    </div>
  );
}
