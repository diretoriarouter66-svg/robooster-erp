-- =====================================================================
-- Cofre de Acessos (Controle de Acessos) — Robooster ERP
-- Criado em 2026-07-15. Substitui o app "Controle de Acessos" do Base44.
--
-- Modelo de segurança (IMPORTANTE):
--   O frontend do ERP faz `role: user_metadata?.role || 'admin'`, ou seja,
--   NÃO dá para confiar no papel vindo da tela. Além disso, user_metadata é
--   editável pelo próprio usuário via supabase.auth.updateUser(). Por isso a
--   autorização do cofre vive SÓ no banco, em cofre_membros — tabela que
--   nenhum usuário logado consegue escrever (não há policy de INSERT/UPDATE/
--   DELETE para `authenticated`; só service_role/postgres altera).
--
--   As demais tabelas do ERP usam policy `auth_all` com qual=true (libera tudo
--   para quem está logado). O cofre NÃO segue esse padrão de propósito.
-- =====================================================================

-- 1) Quem participa do cofre e em que nível ---------------------------
create table if not exists public.cofre_membros (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nivel      text not null check (nivel in ('master', 'colaborador')),
  nome       text,
  criado_em  timestamptz not null default now()
);

alter table public.cofre_membros enable row level security;

-- cada um enxerga apenas a própria linha (a tela usa isso p/ saber o nível)
drop policy if exists cofre_membros_self on public.cofre_membros;
create policy cofre_membros_self on public.cofre_membros
  for select to authenticated
  using (user_id = auth.uid());
-- sem policies de escrita: só service_role/postgres gerencia membros.

-- 2) Função de autorização -------------------------------------------
-- security definer: lê cofre_membros ignorando o RLS da própria tabela.
create or replace function public.eh_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cofre_membros
    where user_id = auth.uid() and nivel = 'master'
  );
$$;

create or replace function public.eh_membro_cofre()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cofre_membros where user_id = auth.uid()
  );
$$;

revoke all on function public.eh_master() from public, anon;
revoke all on function public.eh_membro_cofre() from public, anon;
grant execute on function public.eh_master() to authenticated;
grant execute on function public.eh_membro_cofre() to authenticated;

-- 3) As credenciais ---------------------------------------------------
-- id é TEXT para casar com a convenção do adaptador (genId() = 24 hex).
create table if not exists public.credenciais (
  id                text primary key,
  service_name      text not null,
  category          text,
  company           text,
  access_link       text,
  email             text,
  username          text,
  password          text,
  api_key           text,
  pin               text,
  security_code     text,
  two_factor_secret text,
  recovery_email    text,
  recovery_phone    text,
  access_info       text,
  expiry_date       date,
  -- true  = só master (você e a Roberta) enxerga  [PADRÃO SEGURO]
  -- false = liberada para os colaboradores do cofre
  is_master         boolean not null default true,
  legacy_id         text,          -- id original no Base44 (rastreabilidade)
  created_date      timestamptz not null default now(),
  updated_date      timestamptz not null default now()
);

create index if not exists credenciais_company_idx  on public.credenciais (company);
create index if not exists credenciais_category_idx on public.credenciais (category);
create index if not exists credenciais_master_idx   on public.credenciais (is_master);

alter table public.credenciais enable row level security;

-- LEITURA: master vê tudo; colaborador do cofre vê só as liberadas.
drop policy if exists credenciais_select on public.credenciais;
create policy credenciais_select on public.credenciais
  for select to authenticated
  using (
    public.eh_master()
    or (is_master = false and public.eh_membro_cofre())
  );

-- ESCRITA: só master cria/edita/apaga.
drop policy if exists credenciais_insert on public.credenciais;
create policy credenciais_insert on public.credenciais
  for insert to authenticated
  with check (public.eh_master());

drop policy if exists credenciais_update on public.credenciais;
create policy credenciais_update on public.credenciais
  for update to authenticated
  using (public.eh_master())
  with check (public.eh_master());

drop policy if exists credenciais_delete on public.credenciais;
create policy credenciais_delete on public.credenciais
  for delete to authenticated
  using (public.eh_master());

-- updated_date automático
create or replace function public.credenciais_touch()
returns trigger language plpgsql as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

drop trigger if exists credenciais_touch_trg on public.credenciais;
create trigger credenciais_touch_trg
  before update on public.credenciais
  for each row execute function public.credenciais_touch();

-- 4) Permissões de tabela (o RLS acima é quem filtra de fato) ---------
grant select, insert, update, delete on public.credenciais to authenticated;
grant select on public.cofre_membros to authenticated;
revoke all on public.credenciais  from anon;
revoke all on public.cofre_membros from anon;
