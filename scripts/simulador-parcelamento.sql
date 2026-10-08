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

-- ===== PUBLICADO 08/10/2026 ("PUBLICAR SIMULADOR", versão ccfca08) =====
-- ERP: robooster-erp:simulador-20261008 em robooster_erp_erp.
--   ROLLBACK do ERP: docker service update --image robooster-erp:sanfona-20261008 robooster_erp_erp
-- emitir-nfe: patch aplicado em /root/supabase/docker/volumes/functions/emitir-nfe/index.ts + docker service update --force supabase_supabase_functions
--   ROLLBACK da função: cp /root/supabase/docker/volumes/functions/emitir-nfe/index.ts.bak-20261008-simulador \
--     /root/supabase/docker/volumes/functions/emitir-nfe/index.ts && docker service update --force supabase_supabase_functions
--   (pedido sem acréscimo emite igual a antes: o rateio só roda com acrescimo_parcelamento > 0)
-- Teste em HOMOLOGAÇÃO: pedido de teste (só SQL, sem estoque/financeiro) 24.000 + acréscimo 1.805 → NF-e nº 33 série 1 autorizada,
--   XML vProd 24000.00, vOutro 1805.00, vNF 25805.00 = total do pedido, infCpl com a frase; nota cancelada e pedido apagado.
--   XML guardado em /root/backups-erp/nfe-homolog-33-simulador-20261008.xml
