-- SIMULADOR DE PAGAMENTO (entrada + parcelas) — pedido do Mauricio, 08/10/2026.
-- PARTE A (aplicada na fase de prévia; só colunas novas, vazias — nada muda para a tela que está no ar):
alter table public.sale_orders       add column if not exists acrescimo_parcelamento numeric;  -- R$ do acréscimo (entra no total e na NF como outras despesas)
alter table public.sale_orders       add column if not exists simulacao_pagamento   jsonb;    -- parâmetros da simulação aplicada (entrada, n, %, acréscimo…)
alter table public.config_tributaria add column if not exists acrescimo_parcelas    jsonb;    -- {"1":"0","2":"11.11",…} % ao CLIENTE por nº de parcelas
comment on column public.config_tributaria.acrescimo_parcelas is 'Acréscimo ao CLIENTE por nº de parcelas (% sobre o saldo financiado). Diferente de taxas_operadoras (o que nós pagamos).';
comment on column public.sale_orders.acrescimo_parcelamento is 'Acréscimo de parcelamento (R$) do simulador; já incluído em total; NF-e: valor_outras_despesas rateado.';
notify pgrst, 'reload schema';

-- PARTE B (só com "PUBLICAR SIMULADOR"): nenhuma alteração de banco. Publicar = imagem do ERP + edge function
-- emitir-nfe com o rateio do acréscimo em valor_outras_despesas (scripts/emitir-nfe-acrescimo-20261008.patch).
-- A tabela de acréscimo NÃO é gravada por script: enquanto ele não salvar na tela, o ERP usa os valores iniciais do código.

-- DESFAZER (só se nenhum pedido usar):
-- alter table public.sale_orders drop column if exists acrescimo_parcelamento, drop column if exists simulacao_pagamento;
-- alter table public.config_tributaria drop column if exists acrescimo_parcelas;
