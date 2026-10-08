-- 08/10/2026 — PRÓ-LABORE como despesa fixa + PARTICIPAÇÃO NOS LUCROS na DRE (fase de TESTES do ERP)
-- Decisão do dono (08/10): "o pró-labore é uma retirada mensal de R$ 50 mil (hoje); no futuro ainda terá a Larissa e o
-- Giovanni, cada um com direito a 10% do lucro da empresa".
--
-- PARTE A (estrutura, aditiva — aplicada em 08/10, invisível para a tela publicada):
--   * tabela dre_participacoes (nome, percentual, ativo, desde) + Larissa 10% e Giovanni 10% DESLIGADAS;
--   * função prolabore_mensal(mes, valor) — cria (se faltar) a categoria "Pró-labore" e o lançamento do mês.
-- PARTE B (só no "PUBLICAR DRE", junto com a imagem nova — a DRE publicada leria o pró-labore em dobro em outubro):
--   select prolabore_mensal('2026-09-01'); select prolabore_mensal('2026-10-01');
--   + cron diário (idempotente) na produção:  55 5 * * * ... psql -c "select prolabore_mensal()"
-- DESFAZER a parte B:  delete from financial_entries where reference_type = 'prolabore';
--                      delete from financial_categories where slug = 'pro_labore';   (só sem lançamentos)

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

-- Pró-labore do mês: lançamento PAGO no último dia útil (seg–sex; feriado não é considerado), despesa fixa,
-- SEM conta de banco (não mexe no saldo do Itaú nem aparece na Conciliação como "pagou e o extrato não mostra").
-- Idempotente: um lançamento por mês (id prolabore-AAAA-MM). Mês já lançado não é alterado (mudou à mão, fica).
create or replace function public.prolabore_mensal(p_mes date default null, p_valor numeric default 50000)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  mes   date := date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Sao_Paulo')::date))::date;
  dia   date := (date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Sao_Paulo')::date)) + interval '1 month - 1 day')::date;
  chave text;
  nomes text[] := array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
begin
  while extract(isodow from dia) > 5 loop dia := dia - 1; end loop;
  chave := to_char(mes, 'YYYY-MM');
  insert into public.financial_categories (id, nome, slug, sistema, ativo, dre, dre_grupo, fixa_padrao, created_by)
  values ('fincat_pro_labore', 'Pró-labore', 'pro_labore', false, true, 'despesa', 'pessoal', true, 'prolabore_mensal')
  on conflict (slug) do nothing;
  if exists (select 1 from public.financial_entries where id = 'prolabore-' || chave) then
    return 'já existia: prolabore-' || chave;
  end if;
  insert into public.financial_entries (id, type, description, category, reference_id, reference_type, amount,
                                        due_date, payment_date, status, payment_method, account_id, notes, fixa, fixa_manual,
                                        created_date, updated_date, created_by)
  values ('prolabore-' || chave, 'payable', 'Pró-labore — ' || nomes[extract(month from mes)::int] || '/' || extract(year from mes),
          'pro_labore', 'prolabore:' || chave, 'prolabore', p_valor,
          to_char(dia, 'YYYY-MM-DD'), to_char(dia, 'YYYY-MM-DD'), 'paid', null, null, 'teste — decisão de 08/10', true, false,
          now(), now(), 'prolabore_mensal()');
  return 'criado: prolabore-' || chave || ' em ' || to_char(dia, 'DD/MM/YYYY') || ' R$ ' || p_valor;
end $$;
revoke all on function public.prolabore_mensal(date, numeric) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ============================== PARTE B (só no "PUBLICAR DRE") ==============================
-- select public.prolabore_mensal('2026-09-01');
-- select public.prolabore_mensal('2026-10-01');
