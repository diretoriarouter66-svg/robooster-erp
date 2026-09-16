import React, { useState } from "react";
import { BookOpen, Settings, Package, Ship, ShoppingCart, FileText, Factory, Wallet, ChevronDown, AlertTriangle, CheckCircle2, Wrench, ShieldCheck } from "lucide-react";
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
          <li><strong>Produto máquina:</strong> SKU, modelo, NCM (pergunte ao despachante — vai na nota fiscal!), dimensões e peso (usados na cubagem do container), <em>lead time de reposição</em> (importado: 90-120 dias — alimenta o alerta de estoque) e <strong>garantia em meses</strong>;</li>
          <li><strong>Produto que viaja em mais de uma caixa:</strong> as dimensões principais são a CAIXA 1; use "Volumes adicionais" para as caixas 2, 3... (ex.: máquina + cavalete). A cubagem e o frete calculam todas as caixas;</li>
          <li><strong>Produto peça/insumo:</strong> ao escolher a categoria, aparecem os botões das máquinas — <strong>marque todas em que a peça serve</strong>. É isso que responde "qual refil serve na WF-802?" e alimenta a venda recorrente.</li>
          <li><strong>Custo:</strong> não digite custo de máquina importada na mão — ele nasce do Simulador (cap. 4) ao finalizar a operação. O campo manual é para itens comprados no Brasil.</li>
          <li><strong>Contatos — cadastro quase sozinho (novo 28/08):</strong> digite o <strong>CNPJ e saia do campo</strong> — razão social, fantasia, endereço, CEP, telefone e e-mail preenchem automaticamente (base pública da Receita; nunca sobrescreve o que você já digitou). Depois clique em <strong>"Buscar IE"</strong> ao lado da Inscrição Estadual: o sistema consulta o cadastro de contribuintes, preenche a IE do estado do cliente e ajusta o seletor <em>Contribuinte ICMS</em> conforme a situação real (habilitada/sem IE). <em>Atenção:</em> a busca de IE gasta 1 crédito de um plano de 50/mês — por isso ela é um botão, não automática. Se o serviço estiver fora do ar ou o limite estourar, preencha na mão como sempre;</li>
          <li><strong>Cliente PJ precisa de Inscrição Estadual</strong> (ou a palavra ISENTO) — sem isso a SEFAZ rejeita a nota. Marque o tipo "Cliente" para ele aparecer nos pedidos;</li>
          <li><strong>Crédito pré-aprovado:</strong> cliente que já passou por análise ganha o tique no cadastro e o selo 💳 na lista — pode comprar faturado sem nova avaliação.</li>
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
          <li><strong>Crie a operação e monte o mix.</strong> Cada item tem <strong>Qtd</strong>, <strong>Custo US$</strong> (o preço real DESTA compra — ao concluir a operação ele atualiza o cadastro do produto, e a tela mostra o preço antigo para comparar) e <strong>Declarado US$</strong> (o valor da invoice/DI, item a item). Peça que viaja na caixa consolidada → botão <strong>📦 consolidada</strong> (as medidas de UMA caixa + o campo <em>Nº de caixas</em> ficam na operação — 10 caixas iguais entram as 10 na cubagem); item que não aparece na invoice → <strong>🚫 não declarado</strong> (sem impostos e sem rateios: custo = preço × câmbio);</li>
          <li><strong>Custos:</strong> frete internacional (US$), seguro, <strong>Despesas Locais em R$</strong> (despachante, porto — pagas no Brasil) e <strong>Desconto do Fornecedor</strong> (abate o custo rateado e a quitação — nunca os impostos);</li>
          <li><strong>Remessas de Pagamento:</strong> lance CADA envio (data, US$, cotação, taxas). O <em>câmbio médio ponderado</em> é o câmbio da MERCADORIA; o painel mostra a compra líquida (já com desconto) e se o fornecedor está quitado. Cada remessa vira conta paga no Financeiro;</li>
          <li><strong>Câmbio na chegada / DI:</strong> a carga chega 30-40 dias depois do pagamento, e impostos + frete são calculados no dólar DESSE dia. Enquanto viaja, use uma projeção; quando a DI sair, coloque a cotação real — é assim que a tela bate com a cobrança do despachante;</li>
          <li><strong>Numerário do despachante:</strong> informe quanto adiantou em R$; após Calcular, o sistema mostra <span className="text-success font-medium">A RESSARCIR</span> ou <span className="text-destructive font-medium">DIFERENÇA A PAGAR</span>;</li>
          <li><strong>Fluxo em DOIS TEMPOS — decore as 3 etapas:</strong></li>
        </ol>
        <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm">
          <p><strong>ETAPA 1 · Simulação</strong> (status "Simulação"): brinque à vontade — Calcular e Salvar não mexem em nada. Estoque, custos e Financeiro ficam intocados.</p>
          <p><strong>ETAPA 2 · Prévia do numerário</strong> (botão <em>Finalizar Importação (prévia)</em> → status "Realizada"): é o momento em que você PAGOU o fornecedor e mandou o numerário ao despachante, mas a carga ainda viaja. O sistema usa o câmbio médio das remessas + a sua projeção de chegada e: grava o custo landed nos produtos, dá <em>entrada no estoque</em> (uma vez só, com rastro no Kardex), lança as remessas como contas pagas e deixa tudo pronto para VENDER e PRECIFICAR desde já. É uma prévia honesta: o número existe para você operar, sabendo que ainda vai se ajustar.</p>
          <p><strong>ETAPA 3 · Fechamento real</strong> (botão <em>Recalcular e Concluir</em> → status "Concluída"): a carga chegou, a DI saiu. Troque a projeção pelos valores REAIS (câmbio da DI no campo "Câmbio na chegada", despesas de verdade do despachante), clique Calcular e conclua. O sistema refaz os custos e ATUALIZA o custo dos movimentos no Kardex <em>sem duplicar estoque</em> — o acerto para mais ou para menos entra sozinho no custo landed de cada produto.</p>
          <p className="text-warning"><strong>⚠️ O acerto muda o CUSTO, não o PREÇO.</strong> Depois de concluir, os preços de venda continuam os que você definiu — a margem real deles é que mudou. Passe no Cockpit de Precificação (ou use o botão <em>Precificar Tudo</em>) para reprecificar em cima do custo novo. O painel do pedido de venda já mostra a margem com o custo atualizado.</p>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Nos resultados, cada item mostra o <em>Custo no Fornecedor</em> (FOB × câmbio), o <em>Custo Unitário Landed</em> e o fator <strong>Custo ÷ FOB China</strong> (ex.: 1,59× = cada dólar da fábrica vira R$ 1,59 de custo real). O card de comparativo mostra quanto custaria com declaração 100%. No Simples não existe crédito de ICMS/IPI da importação — o sistema já joga tudo no custo; ao migrar para Presumido, a chave do cap. 2 reativa os créditos.</p>
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
        <p><strong>Para que serve:</strong> nunca mais fechar negócio no escuro. Ao montar o pedido, o painel mostra em tempo real: receita → DAS → comissão do canal → comissão de quem vendeu → custo + frete → <strong>MARGEM LÍQUIDA</strong> (verde saudável, âmbar apertada &lt;12%, vermelho prejuízo).</p>
        <p className="mt-2">Os preços nascem no <strong>Cockpit de Precificação</strong> — e o botão <strong>Precificar Tudo</strong> aplica um markup líquido único (ex.: 100% = depois de impostos e comissões sobra o custo de novo) em todos os produtos e canais de uma vez.</p>
        <p className="mt-2">Dentro do cockpit de cada produto tem a <strong>Análise de Concorrência</strong> (uma linha por concorrente: preço, praça, onde anuncia — com comparação do seu preço contra a média) e, no topo da tela, os botões do <strong>Mercado Livre</strong>: conectar a conta e <em>Sincronizar ML</em> — sempre com PRÉVIA mostrando anúncio por anúncio o preço atual × o novo antes de enviar (Clássico e Premium recebem cada um o seu preço, casados pelo SKU do anúncio).</p>
        <p className="mt-2"><strong>Campos que mudam o dinheiro:</strong></p>
        <ul className="list-disc pl-5 mt-1 space-y-1.5">
          <li><strong>Vendido por:</strong> a comissão é de QUEM VENDEU. Vendedor → % padrão da Config. Tributária em tudo; Representante → a % cadastrada em cada produto (item sem % não paga comissão);</li>
          <li><strong>Sinal recebido (R$):</strong> a reserva-com-sinal do site. O sinal vira conta RECEBIDA no Financeiro na hora, mesmo com o pedido só Aprovado; ao faturar, as parcelas nascem apenas do RESTANTE (total − sinal);</li>
          <li><strong>Pagamento misto:</strong> cliente pagando parte em Pix, parte no cartão, parte no PayPal? Adicione uma linha por forma no bloco "Pagamento misto" — cada linha vira conta a receber própria no Financeiro, com o método e o parcelamento dela. O painel avisa em âmbar até a soma das formas bater com o restante do pedido. O bloco aparece em TODO canal (desde 03/09): num canal com comissão, como "Venda Site", linhas preenchidas mandam e o dinheiro entra pelo valor cheio; sem linhas, vale o recebimento único e líquido do canal;</li>
          <li><strong>Transportadora e entrega:</strong> nome da transportadora, "Frete por conta" (CIF/FOB/terceiros...), volumes e peso bruto — tudo vai para a NF-e. Marque <em>"Endereço de entrega diferente da cobrança"</em> quando faturar num endereço e entregar em outro (preenche pelo CEP; sai no PDF e no grupo de entrega da nota);</li>
          <li><strong>Nº do pedido:</strong> sequencial e identificável (PV-1001, PV-1002...). O botão 🖨 na lista gera o <strong>PDF do pedido</strong> para mandar ao cliente conferir — não é documento fiscal;</li>
          <li><strong>Lançamentos à vista:</strong> ao editar um pedido, o box "Lançamentos deste pedido" mostra o estado do estoque (reservado/baixado) e cada conta gerada no Financeiro, com status e vencimento.</li>
        </ul>
        <p className="mt-2"><strong>Os status fazem coisas — decore estes três efeitos:</strong></p>
        <ul className="list-disc pl-5 mt-1 space-y-1.5">
          <li><strong>Pendente / Aprovado:</strong> RESERVA o estoque (aparece na coluna "Reservado" — casa com a reserva-com-sinal do site);</li>
          <li><strong>Faturado / Enviado / Entregue:</strong> baixa o estoque de verdade, gera as contas a receber no Financeiro (com liberação líquida se for marketplace), grava o cliente na Base Instalada (se tem máquina no pedido) e <em>carimba</em> o imposto da época no pedido;</li>
          <li><strong>Sem estoque disponível?</strong> O pedido volta para Pendente e avisa — o Kardex é a fonte da verdade.</li>
          <li><strong>Pagamento misto com DATA e PAGO por linha (novo 28/08):</strong> cada forma (Pix, cartão...) tem o campo <em>Data (1ª parc.)</em> e a caixinha <em>Pago</em>. Sinal pago em 28/07? Data 28/07 + Pago ✓ — a conta nasce PAGA naquele dia no Financeiro. Restante só quando a máquina chegar? Deixe a linha SEM data — ela nasce pendente e você define o vencimento no Financeiro na chegada. Com data e sem Pago, a data vira o vencimento da 1ª parcela;</li>
          <li><strong>Cartão e PayPal entram ANTECIPADOS (padrão desde 03/09):</strong> a linha de Cartão de Crédito/Débito ou PayPal ganha o campo <em>Recebimento</em>, já em "Antecipado — entra à vista". O sistema cria UM crédito pelo valor cheio na <em>Data do crédito</em> (vazia = próximo dia útil) e UMA despesa na categoria "Taxa de Cartão / Antecipação". Escolha a <em>Operadora</em> (PagBank, PayPal…) na linha: a taxa vem da tabela de <em>Configuração → Taxas de recebimento</em>, que tem a taxa de débito e a de crédito de 1× a 18× por operadora — muda com o nº de parcelas. O campo <em>Taxa (%)</em> da linha só serve para uma exceção pontual — porque o preço já embute o juro e a adquirente credita à vista. As 12x/18x são do cliente, não do nosso caixa. Só escolha "Sem antecipação" no caso raro em que a venda fica parcelada de verdade: aí nasce uma conta a receber por parcela, como antes;</li>
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
        <p className="mt-2"><strong>NF avulsa (sem pedido de venda):</strong> tela <em>Notas Fiscais</em>, no grupo Financeiro. Escolha a operação e o resto se ajusta sozinho (tipo entrada/saída, CFOP intra/interestadual pela UF do destinatário):</p>
        <ul className="list-disc pl-5 mt-1 space-y-1.5">
          <li><strong>Entrada de importação:</strong> a nota da chegada do container. O botão "Puxar itens da operação" preenche o mix declarado com valor aduaneiro e II por item direto do Simulador — confira com a DI real, complete o nº da DI e emita;</li>
          <li><strong>Devoluções</strong> (de venda ou de compra) e <strong>conserto</strong> (entrada, retorno e remessa): informe a chave de 44 dígitos da nota original quando houver;</li>
          <li><strong>Outra operação:</strong> CFOP e natureza manuais, para o que fugir do padrão.</li>
        </ul>
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
          <li><strong>Financeiro:</strong> contas a receber nascem do pedido faturado (parcelas, ou recebimento líquido na data de liberação se for marketplace); sinal de reserva entra como recebido na hora; remessas de importação viram contas pagas. Lançamentos manuais só para o que não passa por pedido/importação;</li>
          <li><strong>Contas / Caixas (novo 28/08):</strong> botão "Contas" no topo do Financeiro — cadastre onde o dinheiro mora (Itaú, PayPal, Caixinha...), cada uma com <em>saldo inicial</em>. Todo lançamento tem o campo <em>Conta/Caixa</em> — e o <strong>método escolhe a conta sozinho</strong>: no diálogo de Contas você mapeia qual método cai onde (Pix → Itaú, PayPal → PayPal...), e todo lançamento novo (pedido, importação ou manual) já nasce na conta certa; dá para trocar editando. O painel <em>Saldos por conta</em> mostra o saldo vivo de cada uma (inicial + recebidos − pagos, só do que está PAGO) e avisa quantos lançamentos pagos estão "sem conta" — zere esse cartão e o painel bate com o banco. Comece colocando o saldo real de hoje como inicial de cada conta;</li>
          <li><strong>Categorias:</strong> botão "Categorias" no topo do Financeiro — crie, renomeie ou desative as suas. Venda, Importação e Outro são de sistema (os lançamentos automáticos usam) e não podem ser excluídas;</li>
          <li><strong>DRE Realizada (botão na tela DRE):</strong> o mês como ele FOI — receita dos pedidos faturados, CMV dos custos reais, DAS carimbado, comissões, despesas fixas → resultado. É o seu fechamento mensal em 1 clique;</li>
          <li><strong>DRE Cenário:</strong> simulação a partir de uma operação de importação — "se eu vender este container assim, sobra quanto?";</li>
          <li><strong>Break-even:</strong> quantas unidades pagam as despesas fixas do mês;</li>
          <li><strong>Estoque &amp; Caixa:</strong> quanto vale o estoque a preço de custo, quanto ENTRA NO CAIXA vendendo tudo por cada canal (receita − impostos − comissões − frete − custo fixo + custo recuperado) e a tabela por produto ordenada por valor — o raio-X de onde o dinheiro está parado.</li>
        </ul>
        <p className="mt-2"><strong>Rotina que funciona:</strong> segunda-feira, 10 minutos — Dashboard, lista de frios da Base Instalada, estoque disponível × alertas de reposição. Fechamento do mês: DRE Realizada + atualizar RBT12.</p>
      </>
    ),
  },
  {
    id: "os",
    icon: Wrench,
    titulo: "9. Ordens de Serviço — o serviço externo sem perder dinheiro",
    resumo: "Hora técnica, despesas de viagem, lançamento automático",
    corpo: (
      <>
        <p><strong>Para que serve:</strong> toda visita técnica tem dois lados — o que o cliente paga (hora técnica) e o que sai do bolso no caminho (combustível, pedágio, almoço, hospedagem). A OS registra os dois no mesmo lugar e lança tudo no Financeiro sozinha.</p>
        <p className="mt-2"><strong>Como usar:</strong></p>
        <ol className="list-decimal pl-5 mt-1 space-y-1.5">
          <li><strong>Nova OS:</strong> cliente (da lista ou digitado), data, técnico, equipamento e descrição do serviço;</li>
          <li><strong>Hora técnica:</strong> horas × valor da hora. O último valor usado fica guardado e já vem preenchido na próxima;</li>
          <li><strong>Despesas de viagem:</strong> uma linha por gasto, com o tipo (combustível, pedágio, alimentação...). O tique <em>"cobrar"</em> decide se aquela despesa entra na conta do cliente — desmarcada, ela continua contando como custo seu, só não é repassada;</li>
          <li><strong>Concluiu o serviço → status "Concluída" → Salvar.</strong> Nesse momento (e só nesse) o sistema lança: a cobrança como conta A RECEBER na categoria <em>Receita de Serviços (OS)</em>, e as despesas como conta PAGA na categoria <em>Despesas de Viagem (OS)</em>.</li>
        </ol>
        <p className="mt-2 text-sm text-muted-foreground">Editar uma OS concluída REFAZ os lançamentos dela (nunca duplica); excluir a OS remove os lançamentos junto. Como as categorias são exclusivas de OS, na DRE Realizada e no Financeiro a linha de serviços aparece separada do resto — dá pra ver num relance se o serviço externo está pagando a viagem.</p>
      </>
    ),
  },
  {
    id: "acessos",
    icon: ShieldCheck,
    titulo: "10. Níveis de acesso — quem vê o quê",
    resumo: "Master, Administrador e Restrito; onde custo e lucro aparecem",
    corpo: (
      <>
        <p><strong>Três níveis, definidos pelos TIPOS do contato (tela Contatos):</strong></p>
        <ul className="list-disc pl-5 mt-1 space-y-1.5">
          <li><strong>Master (Mauricio):</strong> tudo, sempre — inclusive o Cofre com as credenciais pessoais. O nível master vem do Cofre, não de tipo;</li>
          <li><strong>Administrador (tipo "Diretor"):</strong> tudo da empresa — financeiro, custos, importação, DRE, configurações. NÃO vê as credenciais pessoais do Cofre (isso é por convite, credencial a credencial). É o nível da Larissa;</li>
          <li><strong>Restrito:</strong> opera o dia a dia <em>sem ver custo, margem ou lucro em lugar nenhum</em>. "Colaborador" trabalha com produtos, contatos, pedidos de venda, estoque e OS; "Técnico" é mais enxuto — produtos, estoque e OS (sem a parte comercial). Nenhum dos dois vê Precificação, Compras, Importação, Financeiro, DRE ou Relatórios.</li>
        </ul>
        <p className="mt-2"><strong>Como dar acesso:</strong> Contatos → marque o tipo certo → preencha o e-mail → digite uma senha. Para promover alguém a Administrador, adicione o tipo "Diretor". Para rebaixar, tire o tipo. A regra vale no menu, na URL digitada na mão e no banco (RLS) — os três dizem a mesma coisa.</p>
        <p className="mt-2 text-sm text-muted-foreground">A tela de OS é aberta a todos os perfis (o técnico lança as próprias despesas), mas os cartões de faturamento e resultado só aparecem para quem pode ver custos.</p>
      </>
    ),
  },
  {
    id: "patrimonio",
    icon: Wallet,
    titulo: "11. Patrimônio & Valor da Empresa — quanto isso tudo vale",
    resumo: "Cadastro de bens com depreciação, avaliação patrimonial e múltiplo de lucro",
    corpo: (
      <>
        <p><strong>Para que serve:</strong> responder a pergunta que todo dono precisa saber responder — <em>quanto a empresa vale?</em> — com os dados que o ERP já tem.</p>
        <ul className="list-disc pl-5 mt-2 space-y-1.5">
          <li><strong>Cadastro do Patrimônio:</strong> cada bem físico (CNC, empilhadeira, computador, mesa, ar-condicionado...) com valor e data de aquisição. O sistema deprecia sozinho pelas taxas da Receita (informática 20%/ano, máquinas 10%, móveis 10%, veículos 20%...), com piso de 10% do valor. Se você souber o valor de mercado real, informe — ele manda;</li>
          <li><strong>Avaliação patrimonial (o piso):</strong> caixa e bancos (você informa o saldo) + contas a receber + estoque a custo + dinheiro na China (remessas pagas de operações que ainda não viraram estoque, com campo de ajuste) + patrimônio físico depreciado − contas a pagar. Tudo menos o caixa vem sozinho do ERP;</li>
          <li><strong>Avaliação por lucro (a régua do mercado):</strong> lucro médio mensal (o ERP sugere pela média dos últimos meses de contas pagas; você pode fixar outro valor) anualizado × o múltiplo da barrinha 1×–15×. Referências reais: operação simples 2–3×, marca + receita recorrente 4–6×, negócio escalável 8×+;</li>
          <li><strong>Leitura final:</strong> a faixa de negociação entre o piso patrimonial e o valor pelo lucro. Se o lucro vale mais que o patrimônio, a diferença é o <em>goodwill</em> (marca, carteira, operação rodando).</li>
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">Só quem vê custos (master/administrador) acessa esta tela. Dever de casa que a torna precisa: cadastrar os bens uma vez e manter o saldo de caixa atualizado ao consultar.</p>
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

      <p className="text-[11px] text-muted-foreground text-center mt-6">Manual vivo — evolui junto com o sistema · Atualizado em <strong>20/08/2026</strong>. Sentiu falta de algo? Avise o Mauricio, que avisa o Claude. 🔧</p>
    </div>
  );
}
