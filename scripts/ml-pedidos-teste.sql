-- 02/10/2026 — Mercado Livre no ERP em MODO DE TESTE (até a virada de jan/2027).
-- Pedidos lidos do Mercado Livre (só leitura), das duas contas, com o casamento item -> produto do ERP,
-- a taxa e o frete reais e, para conferência, o pedido e a nota que o Bling emitiu para a mesma venda.
-- Nesta fase NÃO viram pedido de venda, NÃO movem estoque e NÃO emitem nota.
create table if not exists public.ml_pedidos (
  id text primary key,                 -- id do pedido no Mercado Livre
  conta text not null,                 -- router | saber (conta do ML)
  ml_user_id bigint,
  pack_id text,
  shipment_id text,
  status text,
  status_detalhe text,
  data_pedido timestamptz,
  data_fechado timestamptz,
  total numeric,                       -- valor dos produtos pago pelo comprador
  pago numeric,
  taxa_ml numeric,                     -- soma de sale_fee × quantidade
  frete_vendedor numeric,              -- frete descontado do vendedor
  frete_comprador numeric,
  liquido numeric,                     -- total − taxa − frete do vendedor
  tipo_anuncio text,
  logistica text,                      -- fulfillment (Full), cross_docking, drop_off, self_service…
  comprador_apelido text,
  comprador jsonb,                     -- dados fiscais (nome, documento, endereço) para a nota
  itens jsonb,                         -- [{item_id, titulo, sku_anuncio, variation_id, qtd, preco, taxa, product_id, product_sku, kit}]
  mapeado boolean default false,       -- todos os itens casaram com produto do ERP
  pendencias text,                     -- por que não está pronto para virar pedido/nota
  pagamentos jsonb,
  bling_pedido_id text, bling_numero text, bling_total numeric, bling_situacao text,
  bling_nf_numero text, bling_nf_chave text, bling_nf_situacao text,
  sale_order_id text,                  -- pedido de venda gerado no ERP (fases seguintes)
  nfe_teste_ref text, nfe_teste_status text,
  bruto jsonb,
  created_date timestamptz default now(),
  updated_date timestamptz default now()
);
create index if not exists ml_pedidos_data_idx on public.ml_pedidos (data_pedido desc);
alter table public.ml_pedidos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname='ml_pedidos_ver') then
    create policy ml_pedidos_ver on public.ml_pedidos for select using (pode('comercial','ver'));
  end if;
end $$;
grant select on public.ml_pedidos to authenticated;
grant all on public.ml_pedidos to service_role;

-- Kits (composições do Bling, formato E): o anúncio vende o kit, o estoque e a nota saem das peças.
create table if not exists public.product_kits (
  sku_kit text not null,
  conta text not null,                 -- router | saber (de qual cadastro veio)
  nome text,
  componentes jsonb not null,          -- [{sku, bling_id, quantidade}]
  bling_id bigint,
  updated_date timestamptz default now(),
  primary key (sku_kit, conta)
);
alter table public.product_kits enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname='product_kits_ver') then
    create policy product_kits_ver on public.product_kits for select using (pode('comercial','ver'));
  end if;
end $$;
grant select on public.product_kits to authenticated;
grant all on public.product_kits to service_role;
-- Depois de criar tabela nova: recarregar o cache da API (o NOTIFY não pega nesta instalação):
--   docker kill -s SIGUSR1 $(docker ps --format '{{.Names}}' | grep supabase_rest)

-- 02/10/2026 — conciliação do recebimento (Mercado Pago), por pedido: o que o Mercado Pago realmente creditou,
-- quando liberou, quanto estornou e as cobranças (taxa de venda, taxa de processamento, frete).
alter table public.ml_pedidos add column if not exists mp_liquido numeric, add column if not exists mp_status text,
  add column if not exists mp_liberacao timestamptz, add column if not exists mp_liberado boolean,
  add column if not exists mp_estornado numeric, add column if not exists mp_cobrancas jsonb, add column if not exists mp_alerta text;
-- e as colunas da nota de teste (homologação)
alter table public.ml_pedidos add column if not exists nfe_teste_numero text, add column if not exists nfe_teste_mensagem text,
  add column if not exists nfe_teste_total numeric, add column if not exists nfe_comparacao jsonb;
