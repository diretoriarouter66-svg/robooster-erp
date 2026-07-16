-- =====================================================================
-- Cofre — criptografia v2 (2026-07-15)
--
-- MOTIVO: no teste de vazamento do v1, 2 senhas apareceram em claro no dump.
-- Não vazaram do campo `password` (esse estava cifrado): a mesma string era
-- SENHA em um serviço e NOME DE USUÁRIO em outro — e `username` estava em claro.
--
-- Lição: num cofre, qualquer campo digitado pode conter segredo reaproveitado.
-- Agora ficam cifrados também: username, email, recovery_email, recovery_phone
-- e access_link.
--
-- Seguem em claro (metadados necessários p/ ordenar/agrupar/filtrar no banco,
-- e que não são credenciais): id, service_name, category, company, expiry_date,
-- is_master, legacy_id, created_date, updated_date, created_by.
-- =====================================================================

-- 1) cifra o que ainda está em claro (idempotente: pula o que já é PGP)
update public.credenciais_raw set
  username       = case when username       like '-----BEGIN PGP%' then username       else public.cofre_enc(username) end,
  email          = case when email          like '-----BEGIN PGP%' then email          else public.cofre_enc(email) end,
  recovery_email = case when recovery_email like '-----BEGIN PGP%' then recovery_email else public.cofre_enc(recovery_email) end,
  recovery_phone = case when recovery_phone like '-----BEGIN PGP%' then recovery_phone else public.cofre_enc(recovery_phone) end,
  access_link    = case when access_link    like '-----BEGIN PGP%' then access_link    else public.cofre_enc(access_link) end;

-- 2) view decifra os novos campos também
drop view if exists public.credenciais;
create view public.credenciais with (security_barrier = true) as
select
  id, service_name, category, company,
  public.cofre_dec(access_link)       as access_link,
  public.cofre_dec(email)             as email,
  public.cofre_dec(username)          as username,
  public.cofre_dec(password)          as password,
  public.cofre_dec(api_key)           as api_key,
  public.cofre_dec(pin)               as pin,
  public.cofre_dec(security_code)     as security_code,
  public.cofre_dec(two_factor_secret) as two_factor_secret,
  public.cofre_dec(recovery_email)    as recovery_email,
  public.cofre_dec(recovery_phone)    as recovery_phone,
  public.cofre_dec(access_info)       as access_info,
  expiry_date, is_master, legacy_id, created_date, updated_date, created_by
from public.credenciais_raw
where public.eh_master()
   or (is_master = false and public.eh_membro_cofre());

alter view public.credenciais owner to postgres;

-- 3) triggers cifram os novos campos na escrita
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
    new.service_name, new.category, new.company,
    public.cofre_enc(new.access_link), public.cofre_enc(new.email), public.cofre_enc(new.username),
    public.cofre_enc(new.password), public.cofre_enc(new.api_key), public.cofre_enc(new.pin),
    public.cofre_enc(new.security_code), public.cofre_enc(new.two_factor_secret),
    public.cofre_enc(new.recovery_email), public.cofre_enc(new.recovery_phone),
    public.cofre_enc(new.access_info),
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
    access_link       = public.cofre_enc(new.access_link),
    email             = public.cofre_enc(new.email),
    username          = public.cofre_enc(new.username),
    password          = public.cofre_enc(new.password),
    api_key           = public.cofre_enc(new.api_key),
    pin               = public.cofre_enc(new.pin),
    security_code     = public.cofre_enc(new.security_code),
    two_factor_secret = public.cofre_enc(new.two_factor_secret),
    recovery_email    = public.cofre_enc(new.recovery_email),
    recovery_phone    = public.cofre_enc(new.recovery_phone),
    access_info       = public.cofre_enc(new.access_info),
    expiry_date = new.expiry_date, is_master = new.is_master,
    updated_date = now(), created_by = new.created_by
  where id = old.id;
  return new;
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

grant select, insert, update, delete on public.credenciais to authenticated;
revoke all on public.credenciais from anon;

-- índices sobre colunas agora cifradas não servem mais
drop index if exists public.credenciais_company_idx;
create index if not exists credenciais_company_idx  on public.credenciais_raw (company);
create index if not exists credenciais_category_idx on public.credenciais_raw (category);
