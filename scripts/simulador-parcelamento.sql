-- SIMULADOR DE PAGAMENTO (entrada + parcelas) — pedido do Mauricio, 08/10/2026.
-- PARTE A (aplicada na fase de prévia; só colunas novas, vazias — nada muda para a tela que está no ar):
alter table public.sale_orders       add column if not exists acrescimo_parcelamento numeric;  -- R$ do acréscimo (entra no total e na NF como outras despesas)
alter table public.sale_orders       add column if not exists simulacao_pagamento   jsonb;    -- parâmetros da simulação aplicada (entrada, n, %, acréscimo…)
comment on column public.sale_orders.acrescimo_parcelamento is 'Acréscimo de parcelamento (R$) do simulador; já incluído em total; NF-e: valor_outras_despesas rateado.';
notify pgrst, 'reload schema';

-- PARTE B (só com "PUBLICAR SIMULADOR"): nenhuma alteração de banco. Publicar = imagem do ERP + edge function
-- emitir-nfe com o rateio do acréscimo em valor_outras_despesas (scripts/emitir-nfe-acrescimo-20261008.patch).
-- O juro do simulador é a taxa da operadora × nº de parcelas (config_tributaria.taxas_operadoras) — sem tabela própria.
-- Correção do dono 08/10: a coluna config_tributaria.acrescimo_parcelas (1ª versão) foi APAGADA:
alter table public.config_tributaria drop column if exists acrescimo_parcelas;

-- DESFAZER (só se nenhum pedido usar):
-- alter table public.sale_orders drop column if exists acrescimo_parcelamento, drop column if exists simulacao_pagamento;
