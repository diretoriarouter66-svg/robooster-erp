import React, { useState } from "react";
import { BookOpen, Settings, Package, Ship, ShoppingCart, FileText, Factory, Wallet, ChevronDown, AlertTriangle, CheckCircle2, Wrench, ShieldCheck, LayoutDashboard, Users, Store, Tag, Percent, Warehouse, Coins, ClipboardList, Calculator, Gem, BarChart3, Globe, KeyRound, Search } from "lucide-react";
import PageHeader from "../components/shared/PageHeader";

/**
 * Manual de Operação — o porta-luvas da Ferrari.
 * Editado junto com o sistema: toda mudança de fluxo relevante atualiza esta página.
 *
 * 01/10/2026 — REVISÃO COMPLETA (pedido do Mauricio: "tudo que tem no ERP tem que estar no manual").
 * Cada tela do menu virou um capítulo, na ordem do menu. O texto foi conferido tela a tela contra o código
 * (inventário de 01/10). Onde o sistema NÃO faz algo que parece que faria, está escrito em "O que ele não faz".
 * Convenção: "Faz sozinho" = efeito automático; "Você faz" = passo manual; "Armadilha" = onde dá para errar.
 */

const Aviso = ({ children }) => (
  <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm flex gap-2">
    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
    <span>{children}</span>
  </div>
);
const Bloco = ({ titulo, children }) => (
  <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
    {titulo && <p className="font-semibold mb-1">{titulo}</p>}
    {children}
  </div>
);
const NaoFaz = ({ itens }) => (
  <Bloco titulo="O que esta tela NÃO faz (para não contar com isso)">
    <ul className="list-disc pl-5 space-y-1">{itens.map((t, i) => <li key={i}>{t}</li>)}</ul>
  </Bloco>
);

const GRUPOS = [
  {
    grupo: "Comece por aqui",
    capitulos: [
      {
        id: "visao",
        icon: BookOpen,
        titulo: "1. Como o sistema pensa (leia primeiro)",
        resumo: "O fluxo inteiro, as 5 regras de ouro e a rotina semanal",
        corpo: (
          <>
            <p>O Gestor Robooster segue o caminho real da mercadoria: <strong>você importa → o custo real de cada máquina nasce no Simulador e é acertado no Fechamento → vende com a margem na tela → fatura → a nota fiscal sai no clique → o estoque baixa, o financeiro lança e o cliente entra na Base Instalada</strong> para comprar peças e insumos para sempre.</p>
            <p className="mt-2"><strong>Cinco regras de ouro:</strong></p>
            <ol className="list-decimal pl-5 mt-1 space-y-1">
              <li><strong>Cada dado nasce em um lugar só.</strong> Custo nasce na importação (Simulador → Fechamento). Preço nasce na Precificação. Imposto nasce na Configuração Tributária e é <em>carimbado</em> no pedido para sempre.</li>
              <li><strong>Estoque nunca se edita — se movimenta.</strong> Toda quantidade passa pelo Kardex (tela Estoque). O campo "Estoque atual" do produto é só leitura. O banco rejeita saldo negativo.</li>
              <li><strong>Status fazem coisas.</strong> Mudar o status de um pedido, de uma OS ou de uma operação de importação dispara baixa de estoque, lançamentos no Financeiro e registros na Base Instalada. Use os botões próprios (Finalizar, Fechar, Devolução), não o dropdown, quando o manual mandar.</li>
              <li><strong>Lançamento PAGO é sagrado.</strong> Ao reeditar pedido, OS ou operação, o sistema recria o que está pendente, mas nunca apaga o que já foi pago.</li>
              <li><strong>Estimado × real.</strong> A prévia da importação serve para operar desde já; o Fechamento com valores reais corrige o custo depois — e guarda os dois para comparação.</li>
            </ol>
            <Bloco titulo="Rotina que funciona">
              <p><strong>Toda segunda (10 min):</strong> Dashboard → Estoque (aba Saldos, situação "Repor já") → Base Instalada (frios) → Financeiro (vencidos). <strong>Todo fechamento de mês:</strong> DRE Realizada → atualizar o RBT12 na Configuração Tributária → conferir no Financeiro se as despesas do mês estão com a marcação "Despesa fixa" certa. <strong>Quando a DI chegar:</strong> Fechamento com valores reais da operação.</p>
            </Bloco>
            <Aviso><strong>Antes de tudo:</strong> confira a Configuração Tributária (cap. 15). Com o RBT12 zerado, todos os cálculos usam a 1ª faixa do Simples (4%) — margens vão parecer melhores do que são.</Aviso>
          </>
        ),
      },
      {
        id: "acessos",
        icon: ShieldCheck,
        titulo: "2. Níveis de acesso — quem vê o quê",
        resumo: "Master, Diretor, Colaborador e Técnico; o que cada um enxerga",
        corpo: (
          <>
            <p><strong>O nível vem do TIPO do contato (tela Contatos):</strong></p>
            <ul className="list-disc pl-5 mt-1 space-y-1.5">
              <li><strong>Master (Mauricio):</strong> tudo, sempre — inclusive o Cofre com as credenciais pessoais. O nível master vem do Cofre, não de tipo;</li>
              <li><strong>Diretor (= administrador):</strong> tudo da empresa — financeiro, custos, importação, DRE, configurações. Não vê as credenciais pessoais do Cofre (isso é por convite, credencial a credencial);</li>
              <li><strong>Colaborador:</strong> produtos, contatos, pedidos de venda, estoque e OS — <em>sem custo, margem ou lucro em lugar nenhum</em>;</li>
              <li><strong>Técnico:</strong> produtos, estoque e OS (sem a parte comercial).</li>
            </ul>
            <p className="mt-2"><strong>Como dar acesso:</strong> Contatos → marque o tipo → preencha o e-mail → digite uma senha (mín. 8) → Salvar. O sistema cria o login (ou troca a senha). Para promover, adicione o tipo "Diretor"; para rebaixar, tire. A regra vale no menu, na URL digitada na mão e no banco (RLS) — os três dizem a mesma coisa; quando a consulta de permissão falha, a tela libera e o banco segura.</p>
            <p className="mt-2 text-sm text-muted-foreground">Telas sem trava de módulo (qualquer usuário logado abre): Controle de Acessos (o conteúdo é filtrado pelo banco) e este Manual.</p>
          </>
        ),
      },
    ],
  },
  {
    grupo: "Principal",
    capitulos: [
      {
        id: "dashboard",
        icon: LayoutDashboard,
        titulo: "3. Dashboard — o painel de entrada",
        resumo: "Contadores, últimos pedidos, alerta de estoque baixo",
        corpo: (
          <>
            <p><strong>Para que serve:</strong> uma olhada de 30 segundos. Produtos ativos, clientes e fornecedores (contatos com esses tipos), a receber e a pagar em aberto (pendentes + vencidos), os 5 últimos pedidos e o cartão de <strong>estoque baixo</strong> (só aparece se algum produto ativo está no mínimo ou abaixo — e só para produtos com mínimo cadastrado).</p>
            <NaoFaz itens={["\"Pedidos recentes\" mostra no máximo 10 — não é o total de pedidos da empresa.", "Não filtra por período nem por usuário; não esconde valores por perfil (quem chega aqui já passou pela trava do módulo)."]} />
          </>
        ),
      },
    ],
  },
  {
    grupo: "Cadastros",
    capitulos: [
      {
        id: "produtos",
        icon: Package,
        titulo: "4. Produtos — o cadastro mestre",
        resumo: "SKU, categoria, compatibilidade peça↔máquina, dados de importação, histórico de custo, preços por canal",
        corpo: (
          <>
            <p><strong>Ordem certa de cadastro:</strong> primeiro as máquinas, depois as peças (a peça aponta para as máquinas em que serve).</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li><strong>SKU:</strong> nasce sequencial (RB-001, RB-002…) ao abrir "Novo"; pode editar; não repete (o banco trava);</li>
              <li><strong>Produtos vindos do Bling (desde 02/10/2026):</strong> os produtos que têm estoque nas duas empresas (Router66 e Saber) foram trazidos para cá com o código que têm no Bling, valendo o da Router66 quando o mesmo produto existe nas duas. Kits e produtos sem estoque ficaram de fora. O custo do Bling entrou como custo manual. Quem veio sem NCM traz o aviso "CADASTRO INCOMPLETO" nas observações e não emite nota até ser completado. <strong>Até a virada de janeiro/2027 o estoque desses produtos é cópia do Bling</strong>: todo dia às 5h50 o sistema iguala o saldo (aparece no Kardex como "Espelho diário do Bling") e cadastra o que passou a ter estoque. Produto que zera no Bling fica <strong>inativo</strong> sozinho (sai das telas de venda, estoque e precificação) e volta a ativo quando o estoque voltar; produto inativado à mão aqui não é reativado pela cópia. Ajuste manual feito aqui nesses produtos é desfeito na cópia seguinte; os produtos RB- não são tocados;</li>
              <li><strong>Categoria</strong> controla o comportamento: <em>Coladeira de Borda</em> e <em>Coletor de Pó</em> são máquinas (entram na Base Instalada); <em>Peças de Reposição</em> e <em>Insumos</em> pedem <strong>compatibilidade</strong> — marque todas as máquinas em que a peça serve. É isso que responde "qual refil serve na WF-802?";</li>
              <li><strong>Dados técnicos de importação</strong> (bloco recolhido): NCM (pergunte ao despachante — vai na nota!), país, custo FOB US$, alíquotas II/IPI/PIS/COFINS/ICMS, benefício 5.2.91, ex-tarifário com validade, IPI recuperável, <strong>comissão do representante %</strong>, dimensões e peso da caixa 1, <strong>volumes adicionais</strong> (caixas 2, 3…: a cubagem e o pedido somam todas), empilhável / pode deitar / peça consolidada;</li>
              <li><strong>Lead time</strong> (dias) e <strong>estoque mínimo</strong> alimentam o alerta "Repor já (chega em ~X dias)" da tela Estoque; <strong>garantia</strong> em meses;</li>
              <li><strong>Custo:</strong> se o produto já veio de importação, o campo mostra o custo landed (só leitura) — quem manda é a importação. O campo manual é para itens comprados no Brasil; cada mudança dele entra no <strong>histórico de custo</strong>;</li>
              <li><strong>Histórico de custo</strong> (editando, só quem vê custos): gráfico + lista com a variação % entre registros; origens: cadastro manual, importação (prévia) e fechamento com valores reais;</li>
              <li><strong>Preços por canal</strong> (editando, só quem vê custos): preço e promocional por canal, salvam ao sair do campo. A margem mostrada aqui é simplificada (custo landed + comissão do canal, sem impostos) — a conta completa é no cockpit de Precificação;</li>
              <li><strong>Excluir:</strong> produto com saldo em estoque não exclui (movimente antes); produto com histórico no Kardex vira <em>inativo</em> em vez de sumir.</li>
            </ul>
            <Aviso><strong>Comissão do representante — regra única (01/10):</strong> a comissão é de <em>quem vendeu</em>. No pedido e na DRE, "Vendido por: Representante" usa a % do produto (vazio = não paga) e "Vendedor" usa a % padrão da Config. A Precificação sugere a <em>maior</em> das duas para o preço cobrir quem vender — e diz isso na tela; você pode sobrescrever.</Aviso>
            <NaoFaz itens={["Não tem campo de preço de venda no cadastro — preço é na Precificação (por canal); a OS sugere o preço do canal Master.", "Renomear as 4 categorias quebra compatibilidade e Base Instalada (os nomes estão fixos no código)."]} />
          </>
        ),
      },
      {
        id: "contatos",
        icon: Users,
        titulo: "5. Contatos — clientes, fornecedores, equipe e transportadoras",
        resumo: "Tipos múltiplos, CNPJ e IE automáticos, acesso ao ERP, linha do tempo",
        corpo: (
          <>
            <p><strong>Um cadastro só, com vários tipos</strong> (Cliente, Fornecedor, Transportador, Diretor, Colaborador, Técnico, Contador…). "Gerenciar Tipos" cria ou desativa tipos — desativar não mexe nos contatos que já têm o tipo.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li><strong>CNPJ:</strong> digite e saia do campo — razão social, fantasia, endereço, CEP, telefone e e-mail preenchem sozinhos (base pública da Receita) e nunca sobrescrevem o que você já digitou. CEP também preenche endereço;</li>
              <li><strong>Buscar IE:</strong> botão ao lado da Inscrição Estadual consulta o cadastro de contribuintes, preenche a IE do estado do cliente e ajusta <em>Contribuinte ICMS</em>. Gasta 1 crédito de um plano de 50/mês — por isso é botão. Fora do ar? Preencha na mão;</li>
              <li><strong>Cliente PJ precisa de IE</strong> (ou ISENTO) — sem isso a SEFAZ rejeita a nota. Marque o tipo "Cliente" para ele aparecer nos pedidos;</li>
              <li><strong>Acesso ao ERP:</strong> aparece para Colaborador, Diretor, Contador e Técnico (e-mail + senha ≥ 8). Ver cap. 2;</li>
              <li><strong>Crédito pré-aprovado:</strong> tique no cadastro, selo "Crédito OK" na lista. É informativo — nenhuma tela bloqueia venda faturada por falta dele;</li>
              <li><strong>Atividade</strong> (ícone na linha): linha do tempo do contato — pedidos, máquinas na Base Instalada, última conversa no WhatsApp (Chatwoot, pelo telefone com +55) e visitas ao site reconhecidas. Sem telefone não casa conversa nem navegação.</li>
            </ul>
            <NaoFaz itens={["Transportadora no pedido é gravada pelo NOME (o cadastro de contato serve de lista e de dados para a NF-e).", "Excluir contato é definitivo e não checa pedidos vinculados — prefira \"Situação: inativo\"."]} />
          </>
        ),
      },
      {
        id: "canais",
        icon: Store,
        titulo: "6. Canais de Venda — comissão, taxa e prazo de cada praça",
        resumo: "Master (estrela), comissão %, taxa fixa, dias para liberação, ICMS de saída",
        corpo: (
          <>
            <ul className="list-disc pl-5 mt-1 space-y-1.5">
              <li><strong>Master (estrela):</strong> o canal de referência da Precificação (venda direta). Só um é master; sem estrela o sistema assume o canal sem comissão e sem taxa;</li>
              <li><strong>Comissão %</strong> e <strong>taxa fixa R$</strong>: descontadas da margem e, nos canais intermediados, do recebimento;</li>
              <li><strong>Dias para liberação:</strong> vencimento do recebimento líquido de marketplace (Mercado Livre libera em X dias);</li>
              <li><strong>ICMS de saída %</strong> do canal: só vale no Lucro Presumido (no Simples o DAS substitui);</li>
              <li><strong>Tipo</strong> (venda direta, ML Clássico, ML Premium, site, Amazon, outro): o Clássico e o Premium recebem preços separados na sincronização com o Mercado Livre.</li>
            </ul>
            <NaoFaz itens={["Excluir um canal não avisa que há preços ou pedidos ligados a ele — desative em vez de excluir."]} />
          </>
        ),
      },
      {
        id: "categorias",
        icon: Tag,
        titulo: "7. Categorias",
        resumo: "As 4 que o sistema entende e por que não renomear",
        corpo: (
          <>
            <p>Coladeira de Borda · Coletor de Pó · Peças de Reposição · Insumos. Clique no selo para ativar/desativar. Criar outras é permitido (viram "só rótulo"); <strong>renomear estas quatro quebra</strong> a compatibilidade peça↔máquina, a Base Instalada e a regra de "frio" (os nomes estão fixos no código).</p>
            <NaoFaz itens={["Excluir categoria não reclassifica os produtos — eles ficam com o nome antigo gravado."]} />
          </>
        ),
      },
    ],
  },
  {
    grupo: "Comercial",
    capitulos: [
      {
        id: "compras",
        icon: ClipboardList,
        titulo: "8. Pedidos de Compra — compra no Brasil com entrada no estoque",
        resumo: "Fornecedor, moeda, status Recebido = entrada no Kardex",
        corpo: (
          <>
            <p><strong>Para que serve:</strong> compra de fornecedor nacional (ou avulsa) sem passar pelo Simulador. Itens podem ser produto do cadastro ou item manual (só nome).</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li><strong>Confirmado / Recebido parcial / Recebido</strong> → gera a <strong>conta a pagar</strong> no Financeiro (categoria Fornecedor), valor = total em R$ + frete/outras despesas. A <em>Cond. Pagamento</em> define as parcelas: "30/60/90" = 3 contas contadas da data do pedido; "à vista" = na data do pedido; sem número = 1 conta na previsão de entrega (ou 30 dias). Reeditar recria o que está pendente e nunca mexe no que já foi pago; Rascunho/Enviado/Cancelado removem o pendente;</li>
              <li><strong>Recebido</strong> → <strong>entrada no estoque</strong> dos itens que são produto (movimento "Entrada Compra" no Kardex) e <strong>custo do produto</strong>: o custo manual passa a ser preço × câmbio + frete rateado por valor, com registro no histórico de custo (origem "compra nacional") — <em>só para produto que não tem custo de importação</em> (quem tem custo landed continua mandado pela importação). Voltar o status estorna o estoque (movimento "Estorno Compra");</li>
              <li><strong>Recebido parcial</strong> gera a conta a pagar mas não dá entrada no estoque (avisa na tela);</li>
              <li><strong>Moeda e cotação:</strong> BRL trava a cotação em 1; USD/EUR/CNY pede a cotação;</li>
              <li><strong>Excluir</strong> estorna a entrada, apaga as contas pendentes (pagas ficam) e apaga o pedido.</li>
            </ul>
            <NaoFaz itens={["Item manual (sem produto) não movimenta estoque nem custo — só entra no valor da conta a pagar.", "Não emite NF nem lê XML de NF-e de compra."]} />
          </>
        ),
      },
      {
        id: "vendas",
        icon: ShoppingCart,
        titulo: "9. Pedidos de Venda — margem na tela e tudo que o status dispara",
        resumo: "Status, reserva × baixa, pagamento misto e antecipação, PDF, NF-e, devolução",
        corpo: (
          <>
            <p><strong>Para que serve:</strong> nunca mais fechar negócio no escuro. O painel (para quem vê custos) mostra em tempo real receita → DAS → comissão do canal → comissão de quem vendeu → custo + frete → <strong>MARGEM LÍQUIDA</strong> (vermelho prejuízo, âmbar &lt; 12%).</p>
            <p className="mt-2"><strong>Campos que mudam o dinheiro:</strong></p>
            <ul className="list-disc pl-5 mt-1 space-y-1.5">
              <li><strong>Canal:</strong> trocar o canal repõe o preço de TODOS os itens pelo preço daquele canal;</li>
              <li><strong>Vendido por:</strong> Vendedor → % padrão da Config. Tributária em tudo; Representante → a % cadastrada em cada produto (item sem % não paga);</li>
              <li><strong>Data da venda:</strong> é o mês da receita, da comissão e o início da garantia;</li>
              <li><strong>Sinal recebido (R$):</strong> vira conta RECEBIDA no Financeiro na hora, mesmo com o pedido só Aprovado; ao faturar, as parcelas nascem do restante;</li>
              <li><strong>Pagamento misto:</strong> uma linha por forma (Pix, cartão, PayPal…), cada uma com valor, parcelas, data e "Pago". Linhas preenchidas mandam sobre a condição padrão. <strong>Cartão/PayPal entram antecipados por padrão</strong>: um crédito pelo valor cheio na data do crédito (vazia = próximo dia útil) + uma despesa "Taxa de Cartão" com a taxa da operadora × nº de parcelas (tabela da Config. Tributária). "Sem antecipação" = uma conta por parcela;</li>
              <li><strong>Transportadora, frete por conta, volumes e peso:</strong> vão para a NF-e. Volumes e peso são calculados pelo cadastro (caixas × quantidade); digitar desliga o cálculo. Endereço de entrega diferente da cobrança: pelo CEP, sai no PDF e na nota;</li>
              <li><strong>Nº do pedido:</strong> PV-1001, PV-1002… O botão 🖨 gera o <strong>PDF para o cliente</strong> (não é documento fiscal).</li>
            </ul>
            <Bloco titulo="O que cada status faz">
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Pendente / Aprovado:</strong> aparece como "Reservado" na tela Estoque. É um cálculo de tela (soma dos pedidos abertos), não um movimento — e não impede outro pedido de vender a mesma peça; a trava real é o saldo no faturamento;</li>
                <li><strong>Faturado / Enviado / Entregue:</strong> baixa o estoque de verdade (sem saldo → o pedido volta para Pendente e avisa), gera as contas a receber (líquidas e na data de liberação se for marketplace), grava o cliente na Base Instalada se há máquina no pedido e carimba o imposto da época;</li>
                <li><strong>Cancelado</strong> com algo já pago: o sistema pergunta se cria a conta a pagar "Devolução ao cliente".</li>
              </ul>
            </Bloco>
            <Bloco titulo="Devolução (botão ↩, pedido faturado)">
              <p>Data da devolução, motivo e quantidade por item. O sistema devolve ao estoque (movimento "Devolução Venda"), tira a máquina da Base Instalada, cria a conta a pagar do reembolso (se marcado) e, se o pedido tem NF autorizada, deixa pronta uma <strong>NF de devolução em rascunho</strong> na tela Notas Fiscais (você emite lá). A comissão a estornar é só informada — não vira lançamento.</p>
            </Bloco>
            <Aviso>Não troque o status para "Devolvido" ou "Cancelado" no dropdown de um pedido faturado para registrar devolução: o estoque até volta, mas sem reembolso, sem NF e sem rastro. Use o botão ↩. E lembre: reeditar um pedido faturado mudando valores recria as parcelas pendentes com vencimentos contados a partir de hoje — as pagas ficam.</Aviso>
            <p className="mt-2 text-sm text-muted-foreground">Item sem custo cadastrado = aviso amarelo no painel ("a margem real é menor"). Resolva cadastrando o custo, não ignorando o aviso.</p>
            <Bloco titulo="Mercado Livre em modo de teste (menu Comercial → Mercado Livre (teste))">
              <p>Desde 02/10/2026 o ERP <strong>lê</strong> os pedidos das duas contas do Mercado Livre (ROUTER 66 e SABERDAELETRÔNICA) algumas vezes por dia e mostra, para cada venda: os itens e o produto do ERP correspondente, o valor dos produtos, a <strong>taxa real</strong> cobrada, o <strong>frete pago por nós</strong>, o líquido, e o pedido e a nota que o Bling emitiu para a mesma venda. Compra com vários itens (carrinho) aparece como uma venda só.</p>
              <p className="mt-1">A coluna "Situação no ERP" diz se a venda já poderia virar pedido e nota aqui ("Pronta") ou o que falta: produto sem cadastro, produto sem NCM, comprador sem dados fiscais.</p>
              <p className="mt-1">A coluna <strong>"Recebimento"</strong> vem do Mercado Pago: taxa, frete e líquido são os que ele realmente cobrou e creditou (não estimativa), com a data em que o dinheiro foi ou será liberado. O quadro vermelho <strong>"Para conferir no fechamento com a contabilidade"</strong> aparece quando uma venda foi devolvida ao comprador e a nota continua autorizada, ou quando há reclamação em mediação ou contestação de cartão.</p>
              <p className="mt-1">A coluna <strong>"Nota de teste"</strong> mostra a nota que o ERP emitiu para a mesma venda no ambiente de testes da SEFAZ (homologação, <strong>sem valor fiscal</strong>) e se ela ficou igual à nota real do Bling em total, CFOP, NCM, origem, frete e natureza. Passe o mouse sobre "diferenças" para ver quais. As notas de teste saem sozinhas todo dia às 19h25, com as regras das vendas pelo Mercado Livre: natureza "Venda de mercadoria para consumidor final", CFOP 5102 em SP, 6108 para não contribuinte de outro estado e 6102 para contribuinte, frete por conta de terceiros e sem frete na nota.</p>
            </Bloco>
            <Aviso>É tela de conferência: até a virada de janeiro/2027 quem recebe o pedido e emite a nota é o Bling. Nada dessa tela vira pedido de venda, mexe no estoque ou emite nota.</Aviso>
          </>
        ),
      },
      {
        id: "os",
        icon: Wrench,
        titulo: "10. Ordens de Serviço — serviço externo sem perder dinheiro",
        resumo: "Hora técnica, peças (baixam estoque), despesas de viagem, lançamento ao concluir",
        corpo: (
          <>
            <p><strong>Para que serve:</strong> toda visita técnica tem dois lados — o que o cliente paga e o que sai do bolso no caminho. A OS registra os dois e lança tudo sozinha ao <strong>Concluir</strong>.</p>
            <ol className="list-decimal pl-5 mt-2 space-y-1.5">
              <li><strong>Nova OS:</strong> cliente (da lista ou digitado), técnico, datas (entrada, serviço, conclusão), equipamento, problema relatado, serviço feito;</li>
              <li><strong>Hora técnica:</strong> horas × valor/hora (o último valor fica guardado). <strong>Peças:</strong> do cadastro (vem com o preço do canal Master da Precificação; sem preço cadastrado, digite) ou manual;</li>
              <li><strong>Despesas de viagem:</strong> uma linha por gasto, com o tique <em>"cobrar"</em>: marcado entra na conta do cliente; desmarcado continua custo seu;</li>
              <li><strong>Status Concluída → Salvar:</strong> baixa as peças do estoque (aparecem no Kardex como "Saída Venda", origem "OS #n"), cria a conta A RECEBER na categoria <em>Receita de Serviços (OS)</em> (ou uma por linha do pagamento misto) e a conta PAGA das despesas em <em>Despesas de Viagem (OS)</em>. Sem estoque da peça, a OS volta ao status anterior e nada é lançado.</li>
            </ol>
            <p className="mt-2 text-sm text-muted-foreground">Editar uma OS concluída REFAZ os lançamentos pendentes (os recebidos ficam); voltar o status devolve as peças; excluir devolve peças e apaga o que não foi pago. O PDF é para o cliente: nunca mostra despesas não cobradas nem o resultado. Cartões de faturamento/resultado só para quem vê custos.</p>
          </>
        ),
      },
      {
        id: "base",
        icon: Factory,
        titulo: "11. Base Instalada — a máquina de vender peça",
        resumo: "Quem tem qual máquina e quem esfriou",
        corpo: (
          <>
            <p><strong>Para que serve:</strong> quem comprou coladeira compra fita, cola e refil <em>para sempre</em> — se alguém lembrar. Esta tela lembra por você.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>Pedido faturado com máquina (Coladeira de Borda ou Coletor de Pó) → o cliente entra sozinho, um registro por unidade; devolução ou exclusão do pedido tiram;</li>
              <li>Máquinas vendidas <strong>antes do ERP</strong>: "Registrar Máquina" (cliente, modelo, nº de série, data). Faça esse dever de casa uma vez;</li>
              <li><strong>"Frio"</strong> = cliente com máquina cujo último pedido faturado com Peças de Reposição/Insumos foi há 60+ dias — ou que nunca comprou consumível. O filtro é a sua lista de ligações da semana, cada um com WhatsApp direto.</li>
            </ul>
          </>
        ),
      },
      {
        id: "precificacao",
        icon: Percent,
        titulo: "12. Precificação — o cockpit de preço",
        resumo: "Master e canais derivados, Precificar Tudo, concorrência, Mercado Livre",
        corpo: (
          <>
            <p><strong>Para que serve:</strong> formar o preço do canal Master e derivar os outros canais com a mesma margem bruta, vendo impostos, comissões, frete e custo fixo por canal.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li><strong>Custo vigente</strong> = custo landed da importação, senão o custo manual. Impostos pelo regime (Simples = DAS pela alíquota efetiva do RBT12);</li>
              <li><strong>Modo Preço</strong> (digita o Master) ou <strong>Modo Markup s/ custo</strong> (calcula o Master). A tabela mostra, por canal: preço, custo, impostos, comissão do canal, comissão do vendedor, frete, margem bruta, custo fixo alocado, margem líquida e markup. <strong>Cadeado</strong> = desacoplar um canal e digitar preço manual;</li>
              <li><strong>Custo fixo alocado</strong> (desde 06/10/2026) = um percentual do preço: as despesas marcadas como fixas no Financeiro ÷ o faturamento das notas, média dos últimos 3 meses fechados (o número aparece na Configuração Tributária). Não muda o preço calculado pelo markup — só mostra a margem líquida de verdade;</li>
              <li><strong>Frete</strong> e "cliente paga o frete" ficam salvos junto com o preço;</li>
              <li><strong>Precificar Tudo</strong> (topo): aplica um markup s/ custo a todos os produtos com custo e a todos os canais — <strong>sobrescreve</strong> preços existentes (pede confirmação). <strong>Recalcular Todos</strong>: só produtos que já têm Master; refaz os canais derivados (não cria canal faltante);</li>
              <li><strong>Análise de concorrência</strong> por produto: preço, praça, onde anuncia, idêntico/similar; cards menor/média × seu preço;</li>
              <li><strong>Mercado Livre:</strong> "Conectar" (autorização no popup) e <strong>"Sincronizar ML"</strong> — sempre com PRÉVIA, anúncio por anúncio (preço atual × novo, casado pelo SKU; Clássico e Premium separados) antes do "Enviar tudo". Erro 401 = reconectar.</li>
            </ul>
            <Aviso>Comissão do vendedor no cockpit = o <em>maior</em> entre a % do representante do produto e a % padrão (conta pelo pior caso). No pedido vale quem vendeu. Ao fechar uma importação com valores reais, o custo muda e o preço não — volte aqui para reprecificar.</Aviso>
          </>
        ),
      },
      {
        id: "estoque",
        icon: Warehouse,
        titulo: "13. Estoque — saldos, Kardex e movimentação manual",
        resumo: "Atual × reservado × disponível, alerta de reposição, tipos de movimento",
        corpo: (
          <>
            <ul className="list-disc pl-5 mt-1 space-y-1.5">
              <li><strong>Saldos:</strong> Atual (do Kardex), Reservado (soma dos pedidos Pendente/Aprovado, calculada na hora), Disponível, Mínimo e a situação <em>"Repor já (chega em ~X dias)"</em> pelo lead time do produto;</li>
              <li><strong>Movimentações:</strong> extrato completo com saldo anterior → novo, origem/motivo e quem fez. <strong>Kardex</strong> por produto com o custo unitário de cada movimento;</li>
              <li><strong>Tipos automáticos:</strong> Entrada Importação (Simulador), Saída Venda (pedido faturado e OS concluída), Devolução Venda, Entrada/Estorno Compra (Pedido de Compra). <strong>Tipos manuais</strong> (botão Nova Movimentação, justificativa obrigatória): Ajuste de Inventário (pode ser + ou −), Avaria/Perda e Uso Interno (sempre −);</li>
              <li>O custo de um movimento manual é o custo vigente do produto — nunca preço de venda.</li>
            </ul>
            <Aviso>Excluir uma operação de importação <strong>não</strong> desfaz a entrada que ela deu no estoque — faça o Ajuste de Inventário aqui.</Aviso>
          </>
        ),
      },
      {
        id: "estoquecaixa",
        icon: Coins,
        titulo: "14. Estoque & Caixa — o raio-X do dinheiro parado",
        resumo: "Valor do estoque a custo e quanto entra no caixa vendendo tudo por canal",
        corpo: (
          <>
            <p>Só leitura. Estoque a custo (todos os produtos × custo vigente); por canal, só produtos <strong>com estoque e com preço salvo</strong> naquele canal: receita − impostos − comissões − frete − custo fixo = lucro; <strong>"Entra em caixa" = lucro + custo recuperado</strong>. O custo fixo é o mesmo percentual da Precificação aplicado à receita de cada canal (despesas fixas ÷ faturamento; a tela mostra o percentual e de que meses ele saiu). Tabela por produto ordenada por valor com % do estoque.</p>
          </>
        ),
      },
    ],
  },
  {
    grupo: "Importação",
    capitulos: [
      {
        id: "importacao",
        icon: Ship,
        titulo: "15. Simulador — onde o custo nasce (estimado)",
        resumo: "Mix, declarado por item, remessas, câmbio da chegada, numerário, as 3 etapas",
        corpo: (
          <>
            <p><strong>Para que serve:</strong> transformar uma compra da China no <em>custo landed por máquina</em> e preparar estoque, preço e financeiro antes mesmo de a carga chegar. O acerto fino com os documentos reais é o capítulo 16.</p>
            <ol className="list-decimal pl-5 mt-2 space-y-1.5">
              <li><strong>Mix:</strong> por item, <strong>Qtd</strong>, <strong>Custo US$</strong> (o preço real DESTA compra — ao finalizar atualiza o cadastro) e <strong>Declarado US$</strong> (o valor da invoice que vai para a DI, item a item; não existe percentual global). Peça na caixa consolidada → 📦; item fora da invoice → 🚫 não declarado (sem impostos e sem rateios);</li>
              <li><strong>Custos:</strong> frete internacional e seguro (US$), despesas locais (R$), desconto do fornecedor (abate custo, nunca imposto), <strong>câmbio na chegada/DI</strong> (impostos e frete usam o dólar desse dia; vazio = câmbio das remessas);</li>
              <li><strong>Remessas:</strong> cada envio (data, US$, cotação, taxas) — o câmbio médio ponderado vira o câmbio da mercadoria e cada remessa vira conta paga no Financeiro ao Salvar. O painel mostra se o fornecedor está quitado;</li>
              <li><strong>Numerário do despachante:</strong> quanto adiantou; após Calcular, "A ressarcir" ou "Diferença a pagar".</li>
            </ol>
            <Bloco titulo="As etapas — decore">
              <p><strong>Simulação</strong> (Calcular e Salvar não mexem em nada) → <strong>Finalizar Importação (prévia)</strong> = status Realizada: grava custo landed e FOB nos produtos, histórico de custo, <em>entrada no estoque</em> (uma vez), remessas e numerário/frete/seguro no Financeiro → <strong>Recalcular e Concluir</strong> = status Concluída: refaz com os valores que você ajustou e atualiza o custo dos movimentos sem duplicar estoque → <strong>Fechar (real)</strong> na lista = status <strong>Fechada</strong> (cap. 16).</p>
              <p className="mt-1 text-warning">Trocar o status no dropdown para Realizada/Concluída não funciona de propósito — o sistema mantém o anterior e manda usar o botão (evita estoque órfão em dobro). Operação Fechada não volta para a prévia.</p>
            </Bloco>
            <p className="mt-2 text-sm text-muted-foreground">Regras do motor: dois câmbios (mercadoria nas remessas; impostos/frete na chegada); frete rateado por m³, despesas e seguro por FOB; ICMS por dentro (8,8% com 5.2.91); no Simples nada gera crédito — tudo é custo; ex-tarifário vigente zera o II. O card de comparativo mostra quanto custaria com declaração 100%. Cubagem: fileiras + leitura por área com fator 0,85.</p>
            <NaoFaz itens={["Excluir uma operação não devolve o estoque (ajuste na tela Estoque) e não apaga os lançamentos de numerário/frete/fechamento (só as remessas).", "Operação com data a partir de 2027 cai no regime CBS, que ainda não existe no motor — a tela acusa erro. Será feito quando a reforma entrar."]} />
          </>
        ),
      },
      {
        id: "fechamento",
        icon: Search,
        titulo: "16. Fechamento com valores reais — onde o custo fica certo",
        resumo: "XML da DI, casar itens, ICMS do Draft, despesas previsto × real, acerto do despachante",
        corpo: (
          <>
            <p><strong>Para que serve:</strong> o Simulador estima; a DI, o despachante e o forwarder cobram outra coisa (dólar por etapa, arredondamentos por adição, AFRMM, armazenagem, correções de NCM…). Aqui você lança o que de fato aconteceu e o sistema <strong>regrava o custo real</strong> de cada produto, guardando o estimado para comparação. Abre pelo botão <strong>"Fechar (real)"</strong> na lista do Simulador (operações Realizadas ou Concluídas).</p>
            <ol className="list-decimal pl-5 mt-2 space-y-1.5">
              <li><strong>DI:</strong> suba o <strong>XML da DI</strong> que o despachante envia junto com o extrato (aceita o layout do extrato e o de transmissão). Entram sozinhos: II/IPI/PIS/COFINS por adição, frete, seguro, capatazia, Siscomex, AFRMM, câmbio e, quando o despachante escreve, o ICMS. Nº e data da DI são editáveis (o XML da PESTI não traz o número);</li>
              <li><strong>Itens:</strong> casa cada produto com o item da DI. A sugestão automática usa o <strong>Declarado US$ do simulador</strong> (é o valor unitário da DI) mais quantidade, NCM e modelo — confira. <strong>ICMS:</strong> a Golden traz por adição (o sistema rateia); a PESTI só dá o total → digite o ICMS de cada item a partir do <em>"Draft de cálculo por item"</em>. <strong>Não embarcou</strong> = pago e ficou para o próximo navio: sai do custo e do rateio;</li>
              <li><strong>Despesas:</strong> previsto (do simulador) × real: frete internacional (fatura do forwarder — digitar, não vem da DI), Siscomex e AFRMM (já vêm do XML), armazenagem, frete rodoviário, SDA, desembaraço, destruição de madeira, ICMS complementar, tarifa bancária, ajudante, outras. <em>Rateável</em> entra no custo dos itens pelo % do FOB real (como a planilha) ou por peso; desmarque o que não deve entrar no custo;</li>
              <li><strong>Despachante:</strong> numerário depositado × debitado real × serviços → saldo a receber/a pagar (vira lançamento no Financeiro ao confirmar);</li>
              <li><strong>Resultado:</strong> por item, FOB real (câmbio médio das remessas) + rateio + impostos reais = <strong>custo unitário real</strong>, lado a lado com o estimado e a diferença. <strong>Salvar rascunho</strong> guarda sem mudar nada. <strong>Confirmar</strong> grava o custo nos produtos, no histórico de custo, reavalia o Kardex, lança o acerto do despachante e marca a operação como <strong>Fechada</strong>. Dá para refazer depois (os valores ficam salvos).</li>
            </ol>
            <Aviso>Faça a <strong>prévia</strong> antes do fechamento: o fechamento reavalia os movimentos de estoque que a prévia criou — se a operação nunca passou pela prévia, não há movimento para reavaliar. E depois de fechar, passe na Precificação: o custo mudou, o preço não.</Aviso>
            <NaoFaz itens={["Não altera o custo FOB em US$ do cadastro (só o custo landed em R$).", "Não importa ainda o Draft (.xlsx) nem a NF-e de entrada — ICMS por item é digitado.", "Não carrega automaticamente a mercadoria não embarcada para a próxima operação — anote nas observações e lance como crédito na próxima."]} />
          </>
        ),
      },
      {
        id: "dre",
        icon: Calculator,
        titulo: "17. DRE — cenário por operação e o mês realizado",
        resumo: "Cenários salvos e comparáveis; DRE Realizada em 1 clique",
        corpo: (
          <>
            <ul className="list-disc pl-5 mt-1 space-y-1.5">
              <li><strong>Cenário:</strong> operação de importação + prazo de venda + comissão + mix geográfico (3 faixas) + preços por produto (padrão = Venda Direta) → receita, CMV, impostos pelo regime, despesas fixas × meses (média real das despesas marcadas como fixas no Financeiro), distribuição aos sócios (com IRRF). Salve, compare 2+ cenários lado a lado;</li>
              <li><strong>DRE Realizada (mês):</strong> pedidos faturados no mês (data da venda) − devoluções (pela data da devolução) → receita; CMV pelo custo vigente de cada item (acusa itens sem custo); imposto = o carimbado no pedido; comissões de canal e de vendedor/representante; receita de serviços e despesas de viagem das OS; despesas pagas do Financeiro, separadas em variáveis e fixas (marcação de cada lançamento), com a margem de contribuição entre as duas. É o fechamento mensal.</li>
            </ul>
            <NaoFaz itens={["O cenário não lê lançamentos do Financeiro como receita; das despesas, usa só a média real das despesas fixas."]} />
          </>
        ),
      },
      {
        id: "config",
        icon: Settings,
        titulo: "18. Configuração Tributária — o coração dos números",
        resumo: "Regime, RBT12, taxas por operadora, sócios; despesas fixas calculadas",
        corpo: (
          <>
            <p><strong>Para que serve:</strong> aqui mora o regime que contamina TODOS os cálculos (precificação, margem do pedido, DRE, importação, taxas de cartão do pedido).</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li><strong>Regime:</strong> Simples Nacional (atual) ou Lucro Presumido. Trocar vira o sistema inteiro daqui para frente; o histórico não é reescrito;</li>
              <li><strong>RBT12</strong> (receita dos últimos 12 meses, do PGDAS): define a alíquota efetiva do DAS; o painel mostra a faixa do Anexo I e avisa sublimite de ICMS (R$ 3,6 mi), teto (R$ 4,8 mi) e troca de faixa. <strong>Atualize todo mês</strong>;</li>
              <li><strong>Taxas de recebimento por operadora</strong> (PagBank, PayPal…): débito e crédito de 1× a 18×. É daqui que o pedido tira a despesa de "Taxa de Cartão" quando o pagamento é antecipado — vazio = o pedido não lança a taxa;</li>
              <li><strong>Despesas fixas — calculado</strong> (desde 06/10/2026; não se digita mais): média mensal das despesas marcadas como fixas no Financeiro, faturamento médio das notas e o percentual entre os dois, com os meses usados. É o número que DRE, Estoque &amp; Caixa e Precificação usam. A lista digitada e o índice de custo fixo saíram;</li>
              <li><strong>Sócios:</strong> participação e residência fiscal — gravam campo a campo, sem precisar do botão;</li>
              <li>Parâmetros do Presumido, câmbio USD padrão de nova operação e comissão padrão do vendedor.</li>
            </ul>
            <p className="mt-2 text-sm text-muted-foreground">Alíquota <em>nominal</em> é a da tabela; a <em>efetiva</em> (a que você paga) = (RBT12 × nominal − dedução) ÷ RBT12. O sistema sempre usa a efetiva.</p>
          </>
        ),
      },
    ],
  },
  {
    grupo: "Financeiro",
    capitulos: [
      {
        id: "financeiro",
        icon: Wallet,
        titulo: "19. Financeiro — contas, caixas, extrato e fluxo",
        resumo: "O que é automático, caixas e bancos, transferências, contas do mês, categorias",
        corpo: (
          <>
            <ul className="list-disc pl-5 mt-1 space-y-1.5">
              <li><strong>Automático:</strong> contas a receber do pedido faturado (parcelas, misto, antecipação de cartão com a taxa, líquido de marketplace na data de liberação), sinal recebido na hora, remessas de importação pagas, numerário/frete/seguro e acerto do despachante, OS concluída (receita e despesas de viagem), devoluções (conta a pagar do reembolso). Lançamento manual só para o que não passa por essas telas;</li>
              <li><strong>Caixas e bancos:</strong> botão "Contas" — onde o dinheiro mora (Itaú, PayPal, Caixinha…), cada uma com saldo inicial e o <strong>mapa método → conta</strong> (Pix cai no Itaú, PayPal no PayPal…): todo lançamento novo já nasce na conta certa. Saldo vivo = inicial + recebidos − pagos (só o que está PAGO). O cartão "Sem conta definida" deve ficar zerado — aí o painel bate com o banco;</li>
              <li><strong>Extrato</strong> (clique no cartão da conta): período, saldo anterior/entradas/saídas/final, incluir lançamento já pago, <strong>transferir entre contas</strong> (gera os dois lados, categoria transferência) e <strong>exportar CSV</strong>;</li>
              <li><strong>Parcelas:</strong> ao criar lançamento, "Parcelas" divide o total em N mensais (resíduo na última);</li>
              <li><strong>Despesa fixa</strong> (desde 06/10/2026): cada conta a pagar tem o seletor "Despesa fixa". O padrão vem da categoria (Categorias → caixinha "Despesa fixa"), então as despesas criadas sozinhas pelo extrato do banco, pela fatura do cartão e pelo PayPal já nascem marcadas; no lançamento dá para mudar caso a caso, e a lista mostra a marca "fixa". Trocar o padrão da categoria reclassifica os lançamentos dela que não foram mudados à mão. Fixas por padrão hoje: aluguel, salário, encargos, FGTS, contabilidade, faxina, energia, água, telefone e internet, LWSA e software;</li>
              <li><strong>Categorias:</strong> crie/renomeie/desative as suas; Venda, Importação e Outro são de sistema. Categoria com lançamento não exclui;</li>
              <li><strong>A lista de lançamentos</strong> tem dois seletores: o tipo (Todos · A Receber · A Pagar · Vencidos) e a situação (<strong>Em aberto</strong> · Pagos/Recebidos · Tudo). Abre sempre em "Em aberto", por ordem de vencimento, então em "A Pagar" só aparece o que ainda falta pagar; o que já foi pago fica em "Pagos". Ao lado da busca aparecem a quantidade e a soma do que está na tela;</li>
              <li><strong>Vencido</strong> é calculado pela data (pendente com vencimento passado) — não precisa marcar status.</li>
              <li><strong>Conciliação</strong> (menu Financeiro → Conciliação, desde 02/10/2026): mostra o que entrou e saiu de cada conta <em>pelos extratos de fora</em>: banco (arquivo OFX), fatura do cartão (planilha do Itaú), PayPal (lido direto, todo dia) e, em breve, Mercado Pago. Escolha a conta e o período: os três quadros somam entradas, saídas e transferências entre contas por categoria (aplicação, resgate, pagamento da fatura e saque não são receita nem despesa). Na lista, cada lançamento tem uma categoria: em laranja é sugestão do sistema (o ✓ confirma), em vermelho está sem categoria. O lápis muda a categoria; com "Lembrar para os próximos" marcado, a regra fica gravada pelo CNPJ/CPF de quem recebeu e os próximos extratos já entram classificados. Saque do PayPal ou do Mercado Pago é casado sozinho com a entrada no banco (mesmo valor, até 5 dias depois): a linha mostra em verde "casado com…" nas duas contas. Em laranja aparece o que ficou sem par e o motivo (falta o extrato do banco daquele período, ou falta o extrato da conta de onde o dinheiro saiu); o filtro "Saques e transferências sem par" lista só esses. <strong>Do extrato para o Financeiro</strong> (02/10/2026): todo lançamento do banco com categoria confirmada vira sozinho um lançamento <em>pago</em> no Financeiro, na conta e na categoria certas, e a linha ganha a marca "no Financeiro". Transferências entre contas não viram lançamento. Se já existia um lançamento pago à mão com o mesmo valor (até 3 dias de diferença), o sistema liga os dois em vez de criar outro. Mudou a categoria na Conciliação, o lançamento acompanha. <strong>PayPal</strong> (02/10/2026): cada venda recebida vira um recebimento pago na conta PayPal pelo valor cheio, com a taxa do PayPal como saída paga (categoria "Taxa do PayPal"); o saque vira transferência saindo da conta PayPal e, quando o saque está casado com a linha do extrato do banco, a entrada no banco é criada na data em que o banco recebeu. Estorno entra como devolução de venda. A receita do site só entra na DRE quando as vendas do e-commerce virarem pedidos (última etapa).</li>
              <li><strong>Fatura do cartão no Financeiro</strong> (02/10/2026): cada fatura vira um lançamento <em>a pagar</em> por categoria (compras menos estornos daquela categoria), com vencimento igual ao da fatura; a soma dos lançamentos é o total da fatura. Quando o extrato do banco traz o pagamento da fatura (mesmo valor, perto do vencimento), esses lançamentos passam a pagos sozinhos e a linha do banco mostra "pagamento da fatura do cartão". Trocar a categoria de uma compra na Conciliação refaz os valores. Na DRE a fatura conta no mês anterior ao vencimento: a que vence em outubro são as compras de setembro.</li>
              <li><strong>DRE Realizada no modelo da planilha</strong> (menu DRE → botão "DRE Realizada"): mostra o ano inteiro, um mês por coluna mais o total, nos mesmos blocos da planilha do Drive — Receita Operacional Bruta, Deduções (Simples), Receita Líquida, Custos das Mercadorias, Resultado Bruto, Despesas variáveis, Margem de contribuição, Despesas fixas (cada uma dividida em assistência técnica, administrativas, pessoal, comerciais), Receita e Despesa Financeira, Impostos e taxas, Resultado Líquido. Escolha o ano no seletor e clique no nome de um mês para destacar a coluna. De onde vem cada número: vendas, custo e comissões saem dos pedidos faturados e das vendas pagas do Mercado Livre; o Simples sai do carimbo fiscal do pedido (ou da alíquota efetiva); as despesas são os lançamentos pagos do Financeiro, cada um na linha da sua categoria. Mês com ponto (•) tem extrato do banco lançado; mês já corrido sem extrato usa a média real das despesas fixas como estimativa. Variável ou fixa vem da marcação "Despesa fixa" de cada lançamento. <strong>Quem decide o que entra na DRE é o cadastro de categorias</strong> (Financeiro → Categorias): cada categoria tem o campo "Na DRE" com o grupo em que entra (administrativas, pessoal, comerciais, assistência técnica, despesa financeira, impostos e taxas, receita financeira, outras) ou "NÃO entra" (mostrada abaixo do resultado, ou nem mostrada). Categoria nova já nasce entrando em "outras despesas"; o que não for entrar, desmarque lá. Venda, serviços de OS, devolução, transferência e custo de mercadoria são tratados pela própria estrutura da DRE e não têm escolha. As despesas do cartão entram pela fatura, no mês anterior ao vencimento.</li>
              <li><strong>Fechamento do mês</strong> (menu Financeiro → Fechamento do mês, desde 03/10/2026): cruza as vendas do mês (pagas no Mercado Livre e pedidos faturados do ERP) com as notas fiscais de saída (hoje lidas do Bling das duas empresas, todo dia de manhã; na virada, as do próprio ERP) e lista o que não bate: venda paga sem nota, nota autorizada de venda cancelada ou devolvida, nota cancelada de venda paga, valor diferente, venda em disputa e nota sem venda no sistema. Cada linha diz o que fazer. O botão "Baixar para a contabilidade" gera a planilha com os pontos e todas as notas do mês. Mês sem pendência aparece como fechado.</li>
              <li><strong>Devolução com nota de entrada automática</strong> (03/10/2026): quando uma venda do Mercado Livre é devolvida (o dinheiro voltou inteiro ao comprador) ou cancelada depois da nota de saída já autorizada, o sistema prepara sozinho, em Notas Fiscais, o rascunho da NF-e de devolução: nota de entrada, finalidade 4, CFOP 1202 (SP) ou 2202 (outro estado), referenciando a chave da nota original, com o destinatário da nota como contato e os mesmos itens. Nada é emitido sem alguém clicar em "Emitir" na tela de Notas Fiscais (hoje em homologação). Só vale para a empresa do ERP (ROUTER 66): venda da SABER fica marcada no Fechamento como "fazer no Bling". Devolução de pedido do ERP continua pelo botão Devolução do pedido, que já preparava a nota.</li>
              <li><strong>Saldo da conta conferido com o banco</strong> (02/10/2026): o arquivo do extrato (OFX) traz o saldo da conta na data em que foi gerado. O ERP guarda esse número e a conta passa a partir dele: saldo de hoje = saldo informado pelo banco + lançamentos pagos depois daquela data (no cartão da conta aparece "conferido com o banco em DD/MM"). Antes, o saldo era "saldo inicial + recebidos − pagos" desde sempre, e nunca batia, porque aplicação, resgate e fatura do cartão não viram lançamento. Na Conciliação, a conta do banco mostra o saldo de abertura e de fechamento do período pelo próprio extrato e, ao lado, os lançamentos que o ERP diz ter pago por aquela conta no mês e que o extrato não mostra: cada um deles é conta errada, data errada ou pagamento que não aconteceu, e precisa ser acertado no Financeiro.</li>
            </ul>
          </>
        ),
      },
      {
        id: "nfe",
        icon: FileText,
        titulo: "20. Notas Fiscais — a nota no clique e as avulsas",
        resumo: "NF-e do pedido, checklist, NF avulsa (importação, devolução, conserto), cadastro de CFOP, homologação",
        corpo: (
          <>
            <p><strong>NF do pedido:</strong> pedido faturado → "Emitir NF-e" na lista de pedidos → ~10 s → chip "NF nº" = autorizada (clique = DANFE). Rejeitou? O botão vira "Reemitir", a mensagem da SEFAZ fica no pedido; corrija e emita de novo — a numeração não queima.</p>
            <p className="mt-2"><strong>Cancelar uma nota autorizada:</strong> em Notas Fiscais, na linha da nota, o ícone de proibido abre o cancelamento. Escreva o motivo (pelo menos 15 caracteres; vai para a SEFAZ) e confirme. Vale para nota de pedido e para nota avulsa. A SEFAZ em regra só aceita até 24 horas depois da autorização; depois disso o caminho é a nota de devolução. Cancelar a nota <strong>não devolve o estoque nem estorna o financeiro</strong>: para desfazer a venda, registre a devolução ou cancele o pedido. Pedido com nota cancelada pode receber nota nova (o botão vira "NF cancelada · emitir nova"); nota avulsa cancelada fica no histórico e a nova se cria do zero.</p>
            <p className="mt-2"><strong>Checklist que evita 95% das rejeições:</strong> CPF/CNPJ; PJ com IE (ou ISENTO); endereço completo; NCM correto no produto.</p>
            <p className="mt-2"><strong>Tela Notas Fiscais:</strong> lista única (pedidos + avulsas), filtro entrada/saída e por origem, exportar CSV. <strong>Nova NF avulsa</strong> — escolha a operação e o resto se ajusta (tipo, CFOP intra/inter pela UF):</p>
            <ul className="list-disc pl-5 mt-1 space-y-1.5">
              <li><strong>Entrada de importação:</strong> "Puxar itens da operação" preenche o mix declarado com VA e II por item (operações realizadas, concluídas ou fechadas); complete nº da DI, datas, UF, AFRMM, via; o bloco "Calcular impostos da importação" rateia frete/seguro/despesas e calcula II/IPI/PIS/COFINS/ICMS; confira com a DI real;</li>
              <li><strong>Devoluções</strong> de venda/compra e <strong>conserto</strong> (entrada, retorno, remessa): chave de 44 dígitos da nota original quando houver. A devolução feita pelo botão ↩ do pedido já deixa o rascunho pronto aqui;</li>
              <li><strong>Outra operação:</strong> CFOP do <strong>cadastro de CFOP</strong> (botão "gerenciar CFOPs": código, natureza, CSOSN, finalidade, texto padrão) ou digitado; "+ texto padrão da natureza" preenche as informações adicionais;</li>
              <li>Cada item tem abas de impostos (ICMS, IPI, PIS/COFINS, Importação, Outros) para o que fugir do padrão.</li>
            </ul>
            <p className="mt-2 text-sm text-muted-foreground">Ambiente atual: <strong>homologação</strong> (notas sem valor fiscal). A virada para produção é decisão do Mauricio e é feita no banco (configuração da NF-e), em série separada do Bling. Certificado A1 vence em <strong>28/10/2026</strong>. Nota autorizada não se exclui.</p>
          </>
        ),
      },
      {
        id: "patrimonio",
        icon: Gem,
        titulo: "21. Patrimônio & Valor da Empresa — quanto isso tudo vale",
        resumo: "Bens com depreciação, avaliação patrimonial e por múltiplo de lucro",
        corpo: (
          <>
            <ul className="list-disc pl-5 mt-1 space-y-1.5">
              <li><strong>Cadastro do Patrimônio:</strong> cada bem (CNC, empilhadeira, computador…) com valor e data; deprecia sozinho pelas taxas da Receita (informática 20%/ano, máquinas 10%, veículos 20%…), piso 10%. Valor de mercado informado manda. "Baixado" tira da soma;</li>
              <li><strong>Avaliação patrimonial (piso):</strong> caixa e bancos (automático pelo Financeiro, ou informado) + a receber + estoque a custo + dinheiro na China (remessas de operações ainda não realizadas, com ajuste) + bens depreciados − a pagar;</li>
              <li><strong>Avaliação por lucro:</strong> lucro médio mensal (sugestão = média dos últimos 6 meses de recebidos − pagos; pode fixar) anualizado × múltiplo 1–15×. Referências: operação simples 2–3×, marca + recorrência 4–6×, escalável 8×+;</li>
              <li><strong>Leitura final:</strong> faixa entre o piso e o valor pelo lucro; a diferença é o goodwill.</li>
            </ul>
          </>
        ),
      },
      {
        id: "relatorios",
        icon: BarChart3,
        titulo: "22. Relatórios",
        resumo: "Vendas, recebido, pago, estoque, por canal e top produtos",
        corpo: (
          <>
            <p>Painel simples de todo o histórico: total vendido (pedidos faturados+), total recebido (sem transferências), total pago, valor em estoque, vendas por canal e top 10 produtos.</p>
            <NaoFaz itens={["Sem filtro de período (todo o histórico).", "Valor em estoque usa o custo vigente (landed ou manual); recebido e pago excluem transferências entre contas."]} />
          </>
        ),
      },
    ],
  },
  {
    grupo: "Empresa",
    capitulos: [
      {
        id: "sites",
        icon: Globe,
        titulo: "23. Central de Análise — os 4 sites num painel",
        resumo: "Google, Bing, GA4, IA, velocidade, indexação, Meta, Ads, WhatsApp, Mapa da Placa",
        corpo: (
          <>
            <p>Só leitura, alimentada por coletas automáticas às 07:30/07:35. Período 7/28/90 dias. <strong>Pontos de atenção</strong> no topo (queda ≥ 25%, índice &lt; 80%, nota de velocidade &lt; 60, LCP &gt; 4 s, 1ª resposta no WhatsApp &gt; 60 min, sem resposta +24 h, zero pagantes, fábrica de fichas parada…). Por site: Google (GSC), Bing, usuários (GA4), sessões vindas de IA por assistente, Google Ads por campanha (custo pela moeda da conta — não soma BRL com USD), redes sociais, páginas mais vistas, atendimento WhatsApp e o painel do Mapa da Placa.</p>
            <NaoFaz itens={["GSC e Bing têm atraso de 3 e 6 dias — a tela ancora no último dia com dado para não mostrar \"queda falsa\".", "Conversões do Google Ads não aparecem: desde 30/09 a conversão (WhatsApp Empilhadeira) é medida direto no Google Ads, não no Analytics — ver os leads na tela do Ads."]} />
          </>
        ),
      },
      {
        id: "cofre",
        icon: KeyRound,
        titulo: "24. Controle de Acessos — o Cofre",
        resumo: "Credenciais cifradas, master × colaboradores, empresas",
        corpo: (
          <>
            <p>Credenciais de todos os serviços, cifradas no banco. Quem é <strong>master</strong> vê tudo e pode: cadastrar/renomear <strong>Empresas</strong> (renomear atualiza todas as credenciais; nome igual funde), criar, duplicar, editar, excluir (sem desfazer) e <strong>liberar uma credencial para colaboradores</strong> (ou devolver só para master). Colaborador vê só o que foi liberado. Segredos ficam atrás do olho/copiar.</p>
            <Aviso>Tudo que você digita numa credencial é cifrado — inclusive usuário e observações. Quando o banco recusa uma alteração, a tela desfaz e mostra o erro: a trava é no banco, não na interface.</Aviso>
          </>
        ),
      },
      {
        id: "configuracoes",
        icon: Settings,
        titulo: "25. Configurações",
        resumo: "Dados do usuário e versão — o resto mora na Configuração Tributária",
        corpo: (
          <>
            <p>Tela informativa: seu nome, e-mail, perfil e a versão do sistema. Taxas de recebimento, despesas fixas e sócios ficam na <strong>Configuração Tributária</strong> (cap. 18); transportadoras se cadastram pelo pedido de venda ou em Contatos (tipo Transportador).</p>
          </>
        ),
      },
    ],
  },
];

const CAPITULOS = GRUPOS.flatMap(g => g.capitulos.map(c => ({ ...c, grupo: g.grupo })));

export default function Manual() {
  const [aberto, setAberto] = useState("visao");
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  const filtra = (c) => !q || c.titulo.toLowerCase().includes(q) || c.resumo.toLowerCase().includes(q);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Manual de Operação" description="Um capítulo por tela, na ordem do menu — leia o capítulo 1 e opere sem medo" />

      <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 to-transparent p-4 mb-4 flex gap-3 items-start">
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm"><strong>O caminho feliz em uma linha:</strong> Configuração → Cadastros → Simulador (custo estimado, prévia) → Pedido (margem na tela) → Faturar → NF-e no clique → Fechamento com valores reais (custo certo) → Base Instalada vende de novo → DRE conta a história.</p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Procurar no manual (ex.: devolução, RBT12, XML da DI, cartão)" className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm" />
      </div>

      {GRUPOS.map(g => {
        const caps = g.capitulos.filter(filtra);
        if (!caps.length) return null;
        return (
          <div key={g.grupo} className="mb-5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">{g.grupo}</p>
            <div className="space-y-2.5">
              {caps.map((c) => {
                const Icon = c.icon;
                const isOpen = aberto === c.id;
                return (
                  <div key={c.id} id={`manual-${c.id}`} className={`bg-card border rounded-xl overflow-hidden transition-all ${isOpen ? "border-primary/40" : "border-border"}`}>
                    <button onClick={() => setAberto(isOpen ? null : c.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors">
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isOpen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <Icon style={{ width: 18, height: 18 }} />
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
          </div>
        );
      })}

      <p className="text-[11px] text-muted-foreground text-center mt-6">Manual vivo — {CAPITULOS.length} capítulos, um por tela, conferidos contra o sistema · Revisão completa em <strong>01/10/2026</strong>. Sentiu falta de algo? Avise o Mauricio, que avisa o Claude. 🔧</p>
    </div>
  );
}
