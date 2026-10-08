-- 08/10/2026 — PRÓ-LABORE (despesa fixa) + DISTRIBUIÇÃO DE LUCROS + PARTICIPAÇÃO NOS LUCROS na DRE (fase de TESTES do ERP)
-- Decisões do dono (08/10):
--   v1: "o pró-labore é uma retirada mensal de R$ 50 mil; no futuro Larissa e Giovanni, cada um com 10% do lucro".
--   v2 (substitui v1): "O pró-labore é R$ 2.000; o restante é distribuição de lucros." Os R$ 8.738,20 que saíram para ele
--       em setembro são a retirada inteira: R$ 2.000 de pró-labore + R$ 6.738,20 de distribuição (não contar em dobro).
--       Retirada planejada do sócio: R$ 48.000/mês (configurável).
--
-- PARTE A (estrutura, aditiva — aplicada em 08/10; a tela publicada não lê nada disto):
--   * dre_participacoes  — Larissa 10% e Giovanni 10%, DESLIGADAS ("futuro");
--   * dre_distribuicao_config — retirada planejada do sócio (R$ 48.000/mês) e o mês de início do lucro acumulado;
--   * prolabore_abatimentos — registro de cada retirada do banco que teve o pró-labore abatido (para desfazer);
--   * prolabore_mensal(mês, valor = 2000) — categoria "Pró-labore" + lançamento do mês + ABATIMENTO na retirada;
--   * extrato_para_financeiro(): o casamento automático "lançamento manual de mesmo valor ±3 dias" NÃO pega o pró-labore
--     (antes, um pagamento qualquer de R$ 2.000 perto do fim do mês poderia ser engolido por ele).
-- PARTE B (só no "PUBLICAR DRE", junto com a imagem nova — ver o fim do arquivo).

-- ============================== PARTE A ==============================
create table if not exists public.dre_participacoes (
  id           text primary key default md5(random()::text || clock_timestamp()::text),
  nome         text not null,
  percentual   numeric not null check (percentual >= 0 and percentual <= 100),  -- % do lucro líquido positivo do mês
  ativo        boolean not null default false,
  desde        date,                                   -- vale a partir deste mês (null = desde sempre)
  observacao   text,
  ordem        int not null default 0,
  created_date timestamptz not null default now(),     -- armadilha nº 1 do ERP: toda tabela precisa de created_date
  updated_date timestamptz,
  created_by   text
);
alter table public.dre_participacoes enable row level security;
drop policy if exists dre_part_ver on public.dre_participacoes;
drop policy if exists dre_part_ins on public.dre_participacoes;
drop policy if exists dre_part_upd on public.dre_participacoes;
drop policy if exists dre_part_del on public.dre_participacoes;
create policy dre_part_ver on public.dre_participacoes for select to authenticated using (pode('financeiro', 'ver'));
create policy dre_part_ins on public.dre_participacoes for insert to authenticated with check (pode('financeiro', 'editar'));
create policy dre_part_upd on public.dre_participacoes for update to authenticated using (pode('financeiro', 'editar'));
create policy dre_part_del on public.dre_participacoes for delete to authenticated using (pode('financeiro', 'editar'));
revoke all on public.dre_participacoes from anon;
grant select, insert, update, delete on public.dre_participacoes to authenticated;
insert into public.dre_participacoes (id, nome, percentual, ativo, desde, observacao, ordem, created_by) values
  ('part_larissa',  'Larissa',  10, false, null, 'futuro — decisão de 08/10/2026', 1, 'decisao-20261008'),
  ('part_giovanni', 'Giovanni', 10, false, null, 'futuro — decisão de 08/10/2026', 2, 'decisao-20261008')
on conflict (id) do nothing;

-- Retirada planejada do sócio (bloco "Distribuição de lucros" da DRE). Uma linha ativa.
create table if not exists public.dre_distribuicao_config (
  id              text primary key default md5(random()::text || clock_timestamp()::text),
  nome            text not null default 'Sócio',
  retirada_mensal numeric not null default 0 check (retirada_mensal >= 0),
  desde           date,            -- retirada planejada vale a partir deste mês (null = sempre)
  acumulado_desde date,            -- lucro acumulado conta a partir deste mês (null = 1º mês com dado no ERP)
  ativo           boolean not null default true,
  observacao      text,
  created_date    timestamptz not null default now(),
  updated_date    timestamptz,
  created_by      text
);
alter table public.dre_distribuicao_config enable row level security;
drop policy if exists dre_dist_ver on public.dre_distribuicao_config;
drop policy if exists dre_dist_ins on public.dre_distribuicao_config;
drop policy if exists dre_dist_upd on public.dre_distribuicao_config;
drop policy if exists dre_dist_del on public.dre_distribuicao_config;
create policy dre_dist_ver on public.dre_distribuicao_config for select to authenticated using (pode('financeiro', 'ver'));
create policy dre_dist_ins on public.dre_distribuicao_config for insert to authenticated with check (pode('financeiro', 'editar'));
create policy dre_dist_upd on public.dre_distribuicao_config for update to authenticated using (pode('financeiro', 'editar'));
create policy dre_dist_del on public.dre_distribuicao_config for delete to authenticated using (pode('financeiro', 'editar'));
revoke all on public.dre_distribuicao_config from anon;
grant select, insert, update, delete on public.dre_distribuicao_config to authenticated;
insert into public.dre_distribuicao_config (id, nome, retirada_mensal, desde, acumulado_desde, ativo, observacao, created_by)
values ('socio', 'Mauricio', 48000, null, null, true, 'pró-labore R$ 2.000 + distribuição planejada R$ 48.000 — decisão de 08/10/2026', 'decisao-20261008')
on conflict (id) do nothing;

-- Cada abatimento: a retirada do banco (lançamento do extrato, categoria Distribuição de lucros) que "contém" o pró-labore.
create table if not exists public.prolabore_abatimentos (
  mes             text primary key,          -- AAAA-MM
  prolabore_id    text not null,             -- prolabore-AAAA-MM
  lancamento_id   text not null,             -- lançamento da retirada (extrato) que foi abatido
  valor_original  numeric not null,
  valor_abatido   numeric not null,
  created_date    timestamptz not null default now()
);
alter table public.prolabore_abatimentos enable row level security;
drop policy if exists prolab_ab_ver on public.prolabore_abatimentos;
create policy prolab_ab_ver on public.prolabore_abatimentos for select to authenticated using (pode('financeiro', 'ver'));
revoke all on public.prolabore_abatimentos from anon;
grant select on public.prolabore_abatimentos to authenticated;

-- Pró-labore do mês (idempotente; rodar todo dia para o mês corrente E o anterior):
--  1) categoria "Pró-labore" (pessoal, despesa fixa) se faltar;
--  2) lançamento prolabore-AAAA-MM: R$ valor, PAGO no último dia útil (seg–sex; feriado não conta), sem conta de banco,
--     "teste — decisão de 08/10". Mês já lançado não é recriado nem alterado (mudou à mão, fica);
--  3) ABATIMENTO: o pró-labore sai do banco junto com a retirada do sócio. Se no mês há retirada lançada pelo extrato
--     (categoria slug retirada_de_socio = "Distribuição de lucros") de valor >= pró-labore e o pró-labore ainda não tem
--     conta, a MAIOR retirada do mês perde o valor do pró-labore e o pró-labore passa a ser pago nela (mesma conta e data).
--     O banco continua somando igual; a distribuição fica só com o que passou do pró-labore. Registro em prolabore_abatimentos.
drop function if exists public.prolabore_mensal(date, numeric);
create or replace function public.prolabore_mensal(p_mes date default null, p_valor numeric default 2000)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ref   date := coalesce(p_mes, (now() at time zone 'America/Sao_Paulo')::date);
  mes   date := date_trunc('month', ref)::date;
  dia   date := (date_trunc('month', ref) + interval '1 month - 1 day')::date;
  chave text;
  nomes text[] := array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  pl    record;
  r     record;
  msg   text;
begin
  while extract(isodow from dia) > 5 loop dia := dia - 1; end loop;
  chave := to_char(mes, 'YYYY-MM');
  insert into public.financial_categories (id, nome, slug, sistema, ativo, dre, dre_grupo, fixa_padrao, created_by)
  values ('fincat_pro_labore', 'Pró-labore', 'pro_labore', false, true, 'despesa', 'pessoal', true, 'prolabore_mensal')
  on conflict (slug) do nothing;

  if exists (select 1 from public.financial_entries where id = 'prolabore-' || chave) then
    msg := 'já existia: prolabore-' || chave;
  else
    insert into public.financial_entries (id, type, description, category, reference_id, reference_type, amount,
                                          due_date, payment_date, status, payment_method, account_id, notes, fixa, fixa_manual,
                                          created_date, updated_date, created_by)
    values ('prolabore-' || chave, 'payable', 'Pró-labore — ' || nomes[extract(month from mes)::int] || '/' || extract(year from mes),
            'pro_labore', 'prolabore:' || chave, 'prolabore', p_valor,
            to_char(dia, 'YYYY-MM-DD'), to_char(dia, 'YYYY-MM-DD'), 'paid', null, null, 'teste — decisão de 08/10', true, false,
            now(), now(), 'prolabore_mensal()');
    msg := 'criado: prolabore-' || chave || ' em ' || to_char(dia, 'DD/MM/YYYY') || ' R$ ' || p_valor;
  end if;

  select * into pl from public.financial_entries where id = 'prolabore-' || chave;
  if pl.account_id is null and pl.status = 'paid' and coalesce(pl.amount, 0) > 0
     and not exists (select 1 from public.prolabore_abatimentos a where a.mes = chave) then
    select f.* into r
      from public.financial_entries f
     where f.category = 'retirada_de_socio' and f.type = 'payable' and f.status = 'paid'
       and f.reference_type = 'extrato' and left(f.payment_date, 7) = chave and f.amount >= pl.amount
     order by f.amount desc, f.payment_date desc
     limit 1;
    if found then
      insert into public.prolabore_abatimentos (mes, prolabore_id, lancamento_id, valor_original, valor_abatido)
      values (chave, pl.id, r.id, r.amount, pl.amount);
      update public.financial_entries
         set amount = r.amount - pl.amount, updated_date = now(),
             notes = coalesce(notes, '') || ' | R$ ' || replace(to_char(pl.amount, 'FM9999990.00'), '.', ',') || ' desta retirada = pró-labore de '
                     || chave || ' (' || pl.id || '); distribuição = o restante — decisão de 08/10'
       where id = r.id;
      update public.financial_entries
         set account_id = r.account_id, payment_method = r.payment_method, payment_date = r.payment_date, due_date = r.payment_date,
             updated_date = now(),
             notes = coalesce(notes, '') || ' — pago dentro da retirada de ' || to_char(left(r.payment_date, 10)::date, 'DD/MM')
                     || ' (R$ ' || replace(to_char(r.amount, 'FM9999990.00'), '.', ',') || ', lançamento ' || r.id || ')'
       where id = pl.id;
      msg := msg || '; abatido da retirada ' || r.id || ' de ' || r.payment_date || ' (R$ ' || r.amount || ' → ' || (r.amount - pl.amount) || ')';
    end if;
  end if;
  return msg;
end $$;
revoke all on function public.prolabore_mensal(date, numeric) from public, anon, authenticated;

-- extrato_para_financeiro: o casamento "lançamento manual pago de mesmo valor ±3 dias" ignora o pró-labore.
-- (Backup da definição anterior: /root/backups-erp/extrato_para_financeiro-antes-20261008.sql.)
do $$
declare d text := pg_get_functiondef('public.extrato_para_financeiro'::regproc);
begin
  if position('''extrato'', ''prolabore''' in d) = 0 then
    d := replace(d, $q$coalesce(f.reference_type, '') <> 'extrato'$q$, $q$coalesce(f.reference_type, '') not in ('extrato', 'prolabore')$q$);
    execute d;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ============================== PARTE B (só no "PUBLICAR DRE") ==============================
-- begin;
--   -- "Retirada de sócio" passa a se chamar "Distribuição de lucros" (mesmo slug; continua informativa, abaixo da linha).
--   -- O nome que a Conciliação mostra para classificar o extrato ("Retirada de sócio") não muda.
--   update public.financial_categories set nome = 'Distribuição de lucros', updated_date = now() where slug = 'retirada_de_socio';
--   update public.extrato_categoria_fin set nome = 'Distribuição de lucros' where slug = 'retirada_de_socio';
--   select public.prolabore_mensal('2026-09-01');   -- R$ 2.000; abate da retirada de 22/09 (R$ 5.000 → 3.000): set = 2.000 + 6.738,20
--   select public.prolabore_mensal('2026-10-01');   -- R$ 2.000 em 30/10, sem conta (sem retirada de outubro lançada ainda)
-- commit;
-- cron (produção, diário, idempotente — mês corrente e o anterior, para abater quando o extrato chegar):
--   55 5 * * * docker exec $(docker ps --format '{{.Names}}'|grep supabase_db) psql -U postgres -d postgres -c "select prolabore_mensal(); select prolabore_mensal((date_trunc('month', now()) - interval '1 day')::date);"
--
-- DESFAZER a parte B (volta ao estado de 08/10 antes da publicação):
-- begin;
--   update public.financial_entries f set amount = a.valor_original, updated_date = now(),
--          notes = regexp_replace(f.notes, ' \| R\$ [^|]* desta retirada = pró-labore de .*$', '')
--     from public.prolabore_abatimentos a where f.id = a.lancamento_id;
--   delete from public.prolabore_abatimentos;
--   delete from public.financial_entries where reference_type = 'prolabore';
--   delete from public.financial_categories where slug = 'pro_labore';
--   update public.financial_categories set nome = 'Retirada de sócio' where slug = 'retirada_de_socio';
--   update public.extrato_categoria_fin set nome = 'Retirada de sócio' where slug = 'retirada_de_socio';
-- commit;
