-- Fase 3 — Acesso do app (Robooster ERP)
-- Libera o papel `authenticated` (usuários logados via Supabase Auth) em todas as
-- tabelas do domínio, com RLS habilitada. `anon` (chave pública) NÃO recebe acesso.
-- Storage: bucket público `uploads` para imagens de produto.

do $$
declare
  t text;
  tabelas text[] := array[
    'categorias','config_tributaria','contatos','customers','dre_salvos',
    'financial_entries','import_items','import_operations','import_processes',
    'product_categories','product_pricing','products','purchase_orders',
    'sale_orders','sales_channels','socios','stock_movements','suppliers',
    'tipos_contato','users'
  ];
begin
  foreach t in array tabelas loop
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists auth_all on public.%I;', t);
    execute format(
      'create policy auth_all on public.%I for all to authenticated using (true) with check (true);', t
    );
  end loop;
end $$;

-- ---- Storage: bucket público de uploads ----------------------------------
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do update set public = true;

-- Upload por usuários logados; leitura pública (bucket público).
drop policy if exists uploads_insert on storage.objects;
create policy uploads_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads');

drop policy if exists uploads_select on storage.objects;
create policy uploads_select on storage.objects
  for select to public
  using (bucket_id = 'uploads');

drop policy if exists uploads_update on storage.objects;
create policy uploads_update on storage.objects
  for update to authenticated
  using (bucket_id = 'uploads');
