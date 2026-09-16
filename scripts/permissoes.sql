-- =====================================================================
-- Permissões por tipo de contato — Robooster ERP (2026-07-15)
--
-- PROBLEMA: as 44 tabelas do ERP usavam a policy `auth_all` com qual=true —
-- qualquer usuário logado lia e escrevia TUDO (financeiro, DRE, custos).
-- Ao dar login para Colaborador/Técnico/Contador, isso vira um vazamento.
--
-- SOLUÇÃO: cada tabela pertence a um MÓDULO; cada TIPO de contato tem
-- permissão de ver/editar por módulo (tabela public.permissoes, editável).
-- O tipo vem do contato vinculado ao login (contatos.user_id -> auth.users).
--
-- REDE DE SEGURANÇA: quem é master em cofre_membros passa por tudo, sempre.
-- Isso garante que Mauricio e Roberta nunca se tranquem fora do ERP.
-- =====================================================================

-- 1) Matriz de permissões (dá para ajustar por SQL/tela depois) ---------
create table if not exists public.permissoes (
  tipo         text not null,
  modulo       text not null,
  ver          boolean not null default false,
  editar       boolean not null default false,
  created_date timestamptz not null default now(),
  primary key (tipo, modulo)
);
alter table public.permissoes enable row level security;
drop policy if exists permissoes_leitura on public.permissoes;
create policy permissoes_leitura on public.permissoes
  for select to authenticated using (true);   -- a tela precisa saber o que mostrar
grant select on public.permissoes to authenticated;
-- sem policy de escrita: só service_role/postgres altera a matriz.

-- 2) Quem sou eu -------------------------------------------------------
-- tipos do contato vinculado ao meu login (+ 'Master' se eu for do cofre)
create or replace function public.meus_tipos()
returns text[] language sql stable security definer set search_path = public
as $$
  select coalesce(
           (select array(select jsonb_array_elements_text(c.tipos))
              from public.contatos c
             where c.user_id = auth.uid()
             limit 1),
           '{}'::text[]
         )
         || case when exists (select 1 from public.cofre_membros
                               where user_id = auth.uid() and nivel = 'master')
                 then array['Master'] else '{}'::text[] end;
$$;

create or replace function public.sou_master()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.cofre_membros
                  where user_id = auth.uid() and nivel = 'master');
$$;

-- 3) Posso? ------------------------------------------------------------
create or replace function public.pode(p_modulo text, p_acao text default 'ver')
returns boolean language sql stable security definer set search_path = public
as $$
  select public.sou_master()          -- master passa sempre (rede de segurança)
      or exists (
           select 1 from public.permissoes p
            where p.modulo = p_modulo
              and p.tipo = any (public.meus_tipos())
              and (case when p_acao = 'editar' then p.editar else p.ver end)
         );
$$;

revoke all on function public.meus_tipos(), public.sou_master(), public.pode(text, text) from public, anon;
grant execute on function public.meus_tipos(), public.sou_master(), public.pode(text, text) to authenticated;

-- 4) Matriz padrão -----------------------------------------------------
-- Diretor: tudo. Contador: números (financeiro/DRE/tributário) + consulta.
-- Técnico: produtos e estoque. Colaborador: operação comercial, sem financeiro.
-- Ajustar depois é um UPDATE nesta tabela — não precisa mexer no código.
insert into public.permissoes (tipo, modulo, ver, editar) values
  ('Diretor','produtos',true,true),   ('Diretor','contatos',true,true),
  ('Diretor','comercial',true,true),  ('Diretor','estoque',true,true),
  ('Diretor','importacao',true,true), ('Diretor','financeiro',true,true),
  ('Diretor','precificador',true,true),('Diretor','config',true,true),

  ('Contador','produtos',true,false), ('Contador','contatos',true,false),
  ('Contador','comercial',true,false),('Contador','estoque',true,false),
  ('Contador','importacao',true,false),('Contador','financeiro',true,true),
  ('Contador','precificador',false,false),('Contador','config',true,true),

  ('Técnico','produtos',true,true),   ('Técnico','contatos',true,false),
  ('Técnico','comercial',false,false),('Técnico','estoque',true,true),
  ('Técnico','importacao',false,false),('Técnico','financeiro',false,false),
  ('Técnico','precificador',false,false),('Técnico','config',false,false),

  ('Colaborador','produtos',true,true), ('Colaborador','contatos',true,true),
  ('Colaborador','comercial',true,true),('Colaborador','estoque',true,true),
  ('Colaborador','importacao',true,false),('Colaborador','financeiro',false,false),
  ('Colaborador','precificador',true,false),('Colaborador','config',false,false)
on conflict (tipo, modulo) do nothing;

-- 5) Tabela -> módulo e troca das policies -----------------------------
do $$
declare
  mapa jsonb := jsonb_build_object(
    'produtos',     jsonb_build_array('products','product_categories','categorias'),
    'contatos',     jsonb_build_array('contatos','customers','suppliers','tipos_contato','socios','users'),
    'comercial',    jsonb_build_array('sale_orders','purchase_orders','sales_channels','product_pricing'),
    'estoque',      jsonb_build_array('stock_movements'),
    'importacao',   jsonb_build_array('import_operations','import_items','import_processes'),
    'financeiro',   jsonb_build_array('financial_entries','dre_salvos'),
    'config',       jsonb_build_array('config_tributaria'),
    'precificador', jsonb_build_array(
        'prec_bling_token','prec_canal','prec_competitor_analysis','prec_empresa','prec_preco',
        'prec_produto_empresa','prec_produto_master','prec_promotion_campaign',
        'router_bling_token','router_companies','router_company_settings','router_competitor_analysis',
        'router_product_pricing','router_products','router_promotion_campaigns','router_sales_channels',
        'saber_bling_token','saber_companies','saber_company_settings','saber_competitor_analysis',
        'saber_product_pricing','saber_products','saber_promotion_campaigns','saber_sales_channels')
  );
  modulo text; tabela text;
begin
  for modulo in select jsonb_object_keys(mapa) loop
    for tabela in select jsonb_array_elements_text(mapa -> modulo) loop
      if to_regclass('public.' || tabela) is null then continue; end if;

      execute format('drop policy if exists auth_all on public.%I', tabela);
      execute format('drop policy if exists %I_ver on public.%I', tabela, tabela);
      execute format('drop policy if exists %I_ins on public.%I', tabela, tabela);
      execute format('drop policy if exists %I_upd on public.%I', tabela, tabela);
      execute format('drop policy if exists %I_del on public.%I', tabela, tabela);

      execute format(
        'create policy %I_ver on public.%I for select to authenticated using (public.pode(%L, %L))',
        tabela, tabela, modulo, 'ver');
      execute format(
        'create policy %I_ins on public.%I for insert to authenticated with check (public.pode(%L, %L))',
        tabela, tabela, modulo, 'editar');
      execute format(
        'create policy %I_upd on public.%I for update to authenticated using (public.pode(%L, %L)) with check (public.pode(%L, %L))',
        tabela, tabela, modulo, 'editar', modulo, 'editar');
      execute format(
        'create policy %I_del on public.%I for delete to authenticated using (public.pode(%L, %L))',
        tabela, tabela, modulo, 'editar');
    end loop;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- 20/08/2026 — módulos novos: OS ("servicos") e visão de custo/lucro ("custos")
INSERT INTO public.permissoes (tipo, modulo, ver, editar) VALUES
  ('Diretor','servicos',true,true), ('Colaborador','servicos',true,true),
  ('Técnico','servicos',true,true), ('Contador','servicos',true,false),
  ('Diretor','custos',true,true),  ('Contador','custos',true,false),
  ('Colaborador','custos',false,false), ('Técnico','custos',false,false)
ON CONFLICT (tipo, modulo) DO UPDATE SET ver=EXCLUDED.ver, editar=EXCLUDED.editar;
