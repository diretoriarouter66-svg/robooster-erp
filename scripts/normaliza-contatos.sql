-- 04/09/2026 — padrão de dados no cadastro de contatos (ordem do Mauricio):
-- nomes/cidade com Primeira Letra Maiúscula e o resto minúsculo (conectores "de, da, do…" ficam
-- minúsculos), e-mail minúsculo, UF maiúscula, telefone SEMPRE no formato +DDI+número (+5511985084040).
-- Vale para QUALQUER caminho de gravação (ERP, sync-crm.py, importações): é trigger no banco.
create or replace function norm_phone(p text) returns text language plpgsql immutable as $$
declare d text; plus boolean;
begin
  if p is null or btrim(p) = '' then return null; end if;
  plus := left(btrim(p), 1) = '+';
  d := regexp_replace(p, '\D', '', 'g');
  if d = '' then return null; end if;
  if plus then return '+' || d; end if;                       -- veio com DDI explícito
  if left(d, 2) = '00' then return '+' || substr(d, 3); end if; -- 00 + DDI
  if left(d, 1) = '0' and length(d) in (11, 12) then d := substr(d, 2); end if; -- 0 + DDD
  if length(d) in (10, 11) then return '+55' || d; end if;     -- DDD + número: Brasil
  if length(d) in (12, 13) and left(d, 2) = '55' then return '+' || d; end if;
  return '+' || d;
end $$;

create or replace function norm_nome(t text) returns text language plpgsql immutable as $$
declare w text; saida text := ''; i int := 0;
        minus text[] := array['de','da','do','das','dos','e','em','di','del','della','van','von','y'];
begin
  if t is null then return null; end if;
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  if t = '' then return null; end if;
  foreach w in array regexp_split_to_array(t, ' ') loop
    i := i + 1;
    if i > 1 and lower(w) = any(minus) then saida := saida || ' ' || lower(w);
    else saida := saida || case when i > 1 then ' ' else '' end || upper(left(w, 1)) || lower(substr(w, 2));
    end if;
  end loop;
  return saida;
end $$;

create or replace function contatos_normaliza() returns trigger language plpgsql as $$
begin
  new.name := norm_nome(new.name);
  new.trade_name := norm_nome(new.trade_name);
  new.contact_name := norm_nome(new.contact_name);
  new.city := norm_nome(new.city);
  new.neighborhood := norm_nome(new.neighborhood);
  new.address := norm_nome(new.address);
  new.state := nullif(upper(btrim(new.state)), '');
  new.email := nullif(lower(btrim(new.email)), '');
  new.phone := norm_phone(new.phone);
  new.whatsapp := norm_phone(new.whatsapp);
  return new;
end $$;
drop trigger if exists contatos_normaliza_trg on contatos;
create trigger contatos_normaliza_trg before insert or update on contatos
  for each row execute function contatos_normaliza();
-- aplica nos registros existentes (o trigger faz o trabalho)
update contatos set name = name;
-- nome do cliente copiado nos pedidos acompanha
update sale_orders o set customer_name = c.name from contatos c where c.id = o.customer_id and o.customer_name is distinct from c.name;

-- 04/09 (pedido dele): CPF/CNPJ sempre com pontuação: 000.000.000-00 e 00.000.000/0000-00
create or replace function norm_documento(t text) returns text language plpgsql immutable as $$
declare d text;
begin
  if t is null or btrim(t) = '' then return null; end if;
  d := regexp_replace(t, '\D', '', 'g');
  if length(d) = 11 then return substr(d,1,3)||'.'||substr(d,4,3)||'.'||substr(d,7,3)||'-'||substr(d,10,2); end if;
  if length(d) = 14 then return substr(d,1,2)||'.'||substr(d,3,3)||'.'||substr(d,6,3)||'/'||substr(d,9,4)||'-'||substr(d,13,2); end if;
  return btrim(t); -- documento estrangeiro ou incompleto: fica como veio
end $$;
create or replace function contatos_normaliza() returns trigger language plpgsql as $$
begin
  new.name := norm_nome(new.name);
  new.trade_name := norm_nome(new.trade_name);
  new.contact_name := norm_nome(new.contact_name);
  new.city := norm_nome(new.city);
  new.neighborhood := norm_nome(new.neighborhood);
  new.address := norm_nome(new.address);
  new.state := nullif(upper(btrim(new.state)), '');
  new.email := nullif(lower(btrim(new.email)), '');
  new.phone := norm_phone(new.phone);
  new.whatsapp := norm_phone(new.whatsapp);
  new.document := norm_documento(new.document);
  new.zip_code := case when new.zip_code is null then null when length(regexp_replace(new.zip_code,'\D','','g')) = 8 then substr(regexp_replace(new.zip_code,'\D','','g'),1,5)||'-'||substr(regexp_replace(new.zip_code,'\D','','g'),6,3) else btrim(new.zip_code) end;
  return new;
end $$;
update contatos set name = name;
