-- 02/10/2026 — CONCILIAÇÃO DO CAIXA: todos os extratos de fora (PayPal, Mercado Pago, banco) caem aqui, um movimento por linha.
-- Depois cada movimento é casado com uma venda, uma conta do Financeiro ou outro movimento (saque de um = entrada de outro).
create table if not exists public.extrato_movimentos (
  id text primary key,                 -- <fonte>:<id do movimento na origem>
  fonte text not null,                 -- paypal | mercadopago | banco
  conta text not null,                 -- rótulo da conta (PayPal Robooster, Mercado Pago ROUTER 66, Itaú …)
  data timestamptz not null,
  tipo text not null,                  -- venda | saque | estorno | taxa | transferencia | outro
  descricao text,
  valor numeric not null,              -- efeito no saldo da conta (entrada +, saída −), já líquido de taxa
  bruto numeric,                       -- valor cheio da venda, quando houver
  taxa numeric,                        -- taxa cobrada (negativa)
  moeda text default 'BRL',
  referencia text,                     -- nº do pedido / fatura / id do pagamento
  contraparte text,                    -- quem pagou ou recebeu
  saldo_apos numeric,
  casado_com text,                     -- id do que fecha com este movimento (outro movimento, venda, lançamento)
  casado_tipo text,                    -- extrato | ml_pedido | financeiro | manual
  situacao text default 'a_conciliar', -- a_conciliar | conciliado | ignorado
  codigo_origem text,                  -- código do evento na origem (ex.: T0006 do PayPal)
  bruto_json jsonb,
  created_date timestamptz default now(),
  updated_date timestamptz default now()
);
create index if not exists extrato_mov_data_idx on public.extrato_movimentos (data desc);
create index if not exists extrato_mov_fonte_idx on public.extrato_movimentos (fonte, conta);
alter table public.extrato_movimentos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname='extrato_movimentos_ver') then
    create policy extrato_movimentos_ver on public.extrato_movimentos for select using (pode('financeiro','ver'));
  end if;
end $$;
grant select on public.extrato_movimentos to authenticated;
grant all on public.extrato_movimentos to service_role;
-- depois de criar: docker kill -s SIGUSR1 $(docker ps --format '{{.Names}}' | grep supabase_rest)

-- 02/10/2026 — categoria sugerida/confirmada de cada movimento e de onde veio o arquivo
alter table public.extrato_movimentos add column if not exists categoria text, add column if not exists categoria_confirmada boolean default false, add column if not exists arquivo text;
