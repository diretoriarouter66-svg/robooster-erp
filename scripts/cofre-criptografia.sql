-- =====================================================================
-- Cofre de Acessos — criptografia de coluna (2026-07-15)
--
-- Objetivo: um dump/vazamento do Postgres NÃO pode expor as senhas.
--
-- Como: os campos secretos são guardados cifrados (pgcrypto, pgp_sym armored).
-- A chave fica no **Supabase Vault**, que por sua vez é cifrado pela chave-raiz
-- do pgsodium — e essa raiz vem de um script FORA do banco
-- (pgsodium.getkey_script = /usr/lib/postgresql/bin/pgsodium_getkey.sh).
-- Portanto o dump carrega só ciphertext; sem o servidor, não abre.
--
-- Estrutura:
--   public.credenciais_raw  -> tabela real, cifrada, SEM acesso p/ authenticated
--   public.credenciais      -> VIEW que decifra e aplica master/colaborador
--                              (roda como owner=postgres; filtro no WHERE)
--   triggers INSTEAD OF     -> escrita cifra de volta; só master escreve
--
-- O app (adaptador base44Client) continua falando com "credenciais" e não
-- percebe a diferença.
-- =====================================================================

-- 1) Chave de criptografia no Vault ----------------------------------
do $$
declare k text;
begin
  if not exists (select 1 from vault.secrets where name = 'cofre_credenciais_key') then
    k := encode(extensions.gen_random_bytes(32), 'base64');
    perform vault.create_secret(k, 'cofre_credenciais_key',
      'Chave simétrica das credenciais do Controle de Acessos (ERP)');
  end if;
end $$;

create or replace function public.cofre_key()
returns text language sql stable security definer
set search_path = public, vault
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'cofre_credenciais_key' limit 1 $$;

revoke all on function public.cofre_key() from public, anon, authenticated;

-- 2) Cifra / decifra --------------------------------------------------
create or replace function public.cofre_enc(v text)
returns text language sql stable security definer
set search_path = public, extensions, vault
as $$
  select case when v is null or v = '' then null
              else extensions.armor(extensions.pgp_sym_encrypt(v, public.cofre_key())) end;
$$;

create or replace function public.cofre_dec(v text)
returns text language sql stable security definer
set search_path = public, extensions, vault
as $$
  select case when v is null then null
              else extensions.pgp_sym_decrypt(extensions.dearmor(v), public.cofre_key()) end;
$$;

revoke all on function public.cofre_enc(text) from public, anon;
revoke all on function public.cofre_dec(text) from public, anon;

-- 3) Tabela real ------------------------------------------------------
alter table public.credenciais rename to credenciais_raw;
-- created_by: o adaptador manda esse campo em todo create()
alter table public.credenciais_raw add column if not exists created_by text;

-- cifra os dados já existentes (idempotente: só o que ainda está em claro)
update public.credenciais_raw set
  password          = public.cofre_enc(password),
  api_key           = public.cofre_enc(api_key),
  pin               = public.cofre_enc(pin),
  security_code     = public.cofre_enc(security_code),
  two_factor_secret = public.cofre_enc(two_factor_secret),
  access_info       = public.cofre_enc(access_info)
where password is not null or api_key is not null or pin is not null
   or security_code is not null or two_factor_secret is not null or access_info is not null;

-- as policies antigas moram na tabela renomeada; a autorização agora é da view
drop policy if exists credenciais_select on public.credenciais_raw;
drop policy if exists credenciais_insert on public.credenciais_raw;
drop policy if exists credenciais_update on public.credenciais_raw;
drop policy if exists credenciais_delete on public.credenciais_raw;
revoke all on public.credenciais_raw from authenticated, anon;

-- 4) View que o app enxerga ------------------------------------------
drop view if exists public.credenciais;
create view public.credenciais with (security_barrier = true) as
select
  id, service_name, category, company, access_link, email, username,
  public.cofre_dec(password)          as password,
  public.cofre_dec(api_key)           as api_key,
  public.cofre_dec(pin)               as pin,
  public.cofre_dec(security_code)     as security_code,
  public.cofre_dec(two_factor_secret) as two_factor_secret,
  recovery_email, recovery_phone,
  public.cofre_dec(access_info)       as access_info,
  expiry_date, is_master, legacy_id, created_date, updated_date, created_by
from public.credenciais_raw
where public.eh_master()
   or (is_master = false and public.eh_membro_cofre());

alter view public.credenciais owner to postgres;

-- 5) Escrita pela view (INSTEAD OF) — cifra de volta; só master -------
create or replace function public.credenciais_ins()
returns trigger language plpgsql security definer
set search_path = public, extensions, vault
as $$
begin
  if not public.eh_master() then
    raise exception 'Apenas o acesso master pode criar credenciais' using errcode = '42501';
  end if;
  insert into public.credenciais_raw (
    id, service_name, category, company, access_link, email, username,
    password, api_key, pin, security_code, two_factor_secret,
    recovery_email, recovery_phone, access_info, expiry_date, is_master,
    legacy_id, created_date, updated_date, created_by)
  values (
    coalesce(new.id, encode(extensions.gen_random_bytes(12), 'hex')),
    new.service_name, new.category, new.company, new.access_link, new.email, new.username,
    public.cofre_enc(new.password), public.cofre_enc(new.api_key), public.cofre_enc(new.pin),
    public.cofre_enc(new.security_code), public.cofre_enc(new.two_factor_secret),
    new.recovery_email, new.recovery_phone, public.cofre_enc(new.access_info),
    new.expiry_date, coalesce(new.is_master, true), new.legacy_id,
    coalesce(new.created_date, now()), now(), new.created_by);
  return new;
end $$;

create or replace function public.credenciais_upd()
returns trigger language plpgsql security definer
set search_path = public, extensions, vault
as $$
begin
  if not public.eh_master() then
    raise exception 'Apenas o acesso master pode alterar credenciais' using errcode = '42501';
  end if;
  update public.credenciais_raw set
    service_name = new.service_name, category = new.category, company = new.company,
    access_link = new.access_link, email = new.email, username = new.username,
    password          = public.cofre_enc(new.password),
    api_key           = public.cofre_enc(new.api_key),
    pin               = public.cofre_enc(new.pin),
    security_code     = public.cofre_enc(new.security_code),
    two_factor_secret = public.cofre_enc(new.two_factor_secret),
    recovery_email = new.recovery_email, recovery_phone = new.recovery_phone,
    access_info    = public.cofre_enc(new.access_info),
    expiry_date = new.expiry_date, is_master = new.is_master,
    updated_date = now(), created_by = new.created_by
  where id = old.id;
  return new;
end $$;

create or replace function public.credenciais_del()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if not public.eh_master() then
    raise exception 'Apenas o acesso master pode excluir credenciais' using errcode = '42501';
  end if;
  delete from public.credenciais_raw where id = old.id;
  return old;
end $$;

drop trigger if exists credenciais_ins_trg on public.credenciais;
drop trigger if exists credenciais_upd_trg on public.credenciais;
drop trigger if exists credenciais_del_trg on public.credenciais;
create trigger credenciais_ins_trg instead of insert on public.credenciais
  for each row execute function public.credenciais_ins();
create trigger credenciais_upd_trg instead of update on public.credenciais
  for each row execute function public.credenciais_upd();
create trigger credenciais_del_trg instead of delete on public.credenciais
  for each row execute function public.credenciais_del();

-- 6) Permissões -------------------------------------------------------
grant select, insert, update, delete on public.credenciais to authenticated;
revoke all on public.credenciais from anon;
