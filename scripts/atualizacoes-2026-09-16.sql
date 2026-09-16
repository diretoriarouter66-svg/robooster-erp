-- 16/09/2026 — pedidos da Larissa (15/09) + devolução de venda (regra do Mauricio: mês fechado não reabre)
begin;

-- PEDIDO DE VENDA: data da venda (competência), total devolvido
alter table sale_orders add column if not exists order_date date;
update sale_orders set order_date = (created_date at time zone 'America/Sao_Paulo')::date where order_date is null;
alter table sale_orders add column if not exists valor_devolvido numeric default 0;

-- DEVOLUÇÕES DE VENDA: evento próprio, com data própria (entra no mês em que acontece)
create table if not exists sale_returns (
  id text primary key,
  sale_order_id text not null,
  order_number text,
  customer_id text,
  customer_name text,
  data date not null,
  motivo text,
  items jsonb default '[]'::jsonb,          -- [{product_id, name, sku, quantity, unit_price, subtotal}]
  valor numeric default 0,                  -- valor devolvido ao cliente (produtos)
  comissao_estornada numeric default 0,     -- comissão do vendedor a descontar do próximo pagamento
  cmv_devolvido numeric default 0,          -- custo dos itens que voltaram ao estoque
  devolucao_total boolean default false,
  estoque_devolvido boolean default false,
  nfe_avulsa_id text,                       -- NF-e de devolução (nota avulsa, finalidade 4)
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text
);
alter table sale_returns enable row level security;
drop policy if exists sale_returns_ver on sale_returns; create policy sale_returns_ver on sale_returns for select to authenticated using (pode('comercial','ver'));
drop policy if exists sale_returns_ins on sale_returns; create policy sale_returns_ins on sale_returns for insert to authenticated with check (pode('comercial','editar'));
drop policy if exists sale_returns_upd on sale_returns; create policy sale_returns_upd on sale_returns for update to authenticated using (pode('comercial','editar')) with check (pode('comercial','editar'));
drop policy if exists sale_returns_del on sale_returns; create policy sale_returns_del on sale_returns for delete to authenticated using (pode('comercial','editar'));
grant select, insert, update, delete on sale_returns to authenticated;

-- Financeiro: quem edita comercial pode lançar/ver o reembolso da devolução (reference_type = sale_return)
drop policy if exists financial_entries_ret_ver on financial_entries; create policy financial_entries_ret_ver on financial_entries for select to authenticated using (pode('comercial','ver') and reference_type = 'sale_return');
drop policy if exists financial_entries_ret_ins on financial_entries; create policy financial_entries_ret_ins on financial_entries for insert to authenticated with check (pode('comercial','editar') and reference_type = 'sale_return');
drop policy if exists financial_entries_ret_upd on financial_entries; create policy financial_entries_ret_upd on financial_entries for update to authenticated using (pode('comercial','editar') and reference_type = 'sale_return');
drop policy if exists financial_entries_ret_del on financial_entries; create policy financial_entries_ret_del on financial_entries for delete to authenticated using (pode('comercial','editar') and reference_type = 'sale_return');
insert into financial_categories (id, nome, slug, sistema, ativo, created_date)
select md5('devolucao_venda'), 'Devolução de Venda (reembolso)', 'devolucao_venda', true, true, now()
where not exists (select 1 from financial_categories where slug = 'devolucao_venda');

-- ORDEM DE SERVIÇO: problema relatado, datas de entrada/conclusão, peças, forma de pagamento + conta
alter table service_orders
  add column if not exists problema text,
  add column if not exists data_entrada date,
  add column if not exists data_conclusao date,
  add column if not exists pecas jsonb default '[]'::jsonb,   -- [{product_id, name, sku, quantity, unit_price}]
  add column if not exists forma_pagamento text,
  add column if not exists account_id uuid;

-- TRANSPORTADORAS: cadastro simples para o autocompletar do pedido
create table if not exists transportadoras (
  id text primary key,
  nome text not null,
  cnpj text, telefone text, contato text, observacoes text,
  ativo boolean default true,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text
);
create unique index if not exists transportadoras_nome_uk on transportadoras (lower(nome));
alter table transportadoras enable row level security;
drop policy if exists transportadoras_ver on transportadoras; create policy transportadoras_ver on transportadoras for select to authenticated using (pode('comercial','ver') or pode('servicos','ver'));
drop policy if exists transportadoras_ins on transportadoras; create policy transportadoras_ins on transportadoras for insert to authenticated with check (pode('comercial','editar'));
drop policy if exists transportadoras_upd on transportadoras; create policy transportadoras_upd on transportadoras for update to authenticated using (pode('comercial','editar'));
drop policy if exists transportadoras_del on transportadoras; create policy transportadoras_del on transportadoras for delete to authenticated using (pode('comercial','editar'));
grant select, insert, update, delete on transportadoras to authenticated;
insert into transportadoras (id, nome) select md5('tr:'||lower(trim(transportadora))), trim(transportadora) from sale_orders where coalesce(trim(transportadora),'') <> '' on conflict do nothing;

-- HISTÓRICO DE CUSTO DO PRODUTO (o que o Tiny tinha): um registro por importação/alteração
create table if not exists product_cost_history (
  id text primary key,
  product_id text not null,
  custo numeric not null,
  origem text,          -- 'importacao' | 'manual'
  referencia text,      -- nome da operação de importação ou 'cadastro'
  data date default current_date,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text
);
create index if not exists product_cost_history_prod on product_cost_history (product_id, data);
alter table product_cost_history enable row level security;
drop policy if exists pch_ver on product_cost_history; create policy pch_ver on product_cost_history for select to authenticated using (pode('custos','ver'));
drop policy if exists pch_ins on product_cost_history; create policy pch_ins on product_cost_history for insert to authenticated with check (pode('produtos','editar') or pode('importacao','editar'));
drop policy if exists pch_del on product_cost_history; create policy pch_del on product_cost_history for delete to authenticated using (pode('produtos','editar'));
grant select, insert, update, delete on product_cost_history to authenticated;
-- ponto de partida: o custo vigente de cada produto vira o 1º registro
insert into product_cost_history (id, product_id, custo, origem, referencia, data)
select md5('pch0:'||id), id, case when coalesce(cost_landed_brl,0) > 0 then cost_landed_brl else custo_manual_brl end,
       case when coalesce(cost_landed_brl,0) > 0 then 'importacao' else 'manual' end, 'custo vigente em 16/09/2026', current_date
from products where coalesce(cost_landed_brl,0) > 0 or coalesce(custo_manual_brl,0) > 0
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
