-- 03/10/2026 — Notas fiscais de saída emitidas (hoje pelo Bling; a partir da virada, pelo próprio ERP) para o fechamento mensal.
create table if not exists public.fiscal_notas (
  id            text primary key,          -- 'bling:<empresa>:<id>'
  origem        text not null,             -- bling | erp
  empresa       text not null,             -- router | saber
  numero        text,
  serie         text,
  chave         text,
  data_emissao  timestamptz,
  situacao      text,                      -- autorizada | cancelada | denegada | rejeitada | pendente
  situacao_cod  int,
  valor         numeric,
  valor_frete   numeric,
  contato_nome  text,
  contato_doc   text,
  contato_uf    text,
  pedido_loja   text,                      -- numeroPedidoLoja (id do pedido/pack do Mercado Livre)
  natureza_id   bigint,
  link_danfe    text,
  bruto         jsonb,
  created_date  timestamptz default now(),
  updated_date  timestamptz default now()
);
create index if not exists fiscal_notas_emissao_idx on public.fiscal_notas (data_emissao);
create index if not exists fiscal_notas_pedido_idx  on public.fiscal_notas (pedido_loja);
alter table public.fiscal_notas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'fiscal_notas_ver') then
    create policy fiscal_notas_ver on public.fiscal_notas for select using (pode('financeiro','ver') or pode('comercial','ver'));
  end if;
end $$;
grant select on public.fiscal_notas to authenticated;
