-- 02/10/2026 — Saldo da conta ancorado no extrato do banco.
-- O arquivo OFX informa o saldo da conta numa data (LEDGERBAL). Guardamos esse saldo e a conta do ERP passa a
-- partir dele: saldo de hoje = saldo conferido + lançamentos pagos depois da data conferida. Antes disso, o ERP
-- somava "saldo inicial + recebidos − pagos" desde sempre, o que nunca bate com o banco porque transferências,
-- aplicações e a fatura do cartão não viram lançamento.
create table if not exists public.extrato_saldos (
  id           bigserial primary key,
  conta        text not null,
  data         date not null,
  saldo        numeric not null,
  arquivo      text,
  created_date timestamptz default now(),
  unique (conta, data)
);
alter table public.extrato_saldos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'extrato_saldos_ver') then
    create policy extrato_saldos_ver on public.extrato_saldos for select using (pode('financeiro','ver'));
  end if;
end $$;
grant select on public.extrato_saldos to authenticated;

alter table public.cash_accounts add column if not exists saldo_conferido numeric;
alter table public.cash_accounts add column if not exists saldo_conferido_em date;
alter table public.cash_accounts add column if not exists saldo_conferido_origem text;

-- leva o saldo mais recente do extrato para a conta do ERP com o mesmo nome
create or replace function public.atualizar_saldo_conferido() returns int
language plpgsql security definer set search_path = public as $$
declare a record; s record; n int := 0;
begin
  for a in select id, nome from cash_accounts where ativo loop
    select x.saldo, x.data, x.arquivo into s from extrato_saldos x where x.conta ilike a.nome || '%' order by x.data desc, x.id desc limit 1;
    if s.data is not null then
      update cash_accounts set saldo_conferido = s.saldo, saldo_conferido_em = s.data, saldo_conferido_origem = s.arquivo, updated_date = now()
       where id = a.id and (saldo_conferido is distinct from s.saldo or saldo_conferido_em is distinct from s.data);
      if found then n := n + 1; end if;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.atualizar_saldo_conferido() from public, anon, authenticated;

-- função principal: agora também atualiza o saldo conferido no fim
create or replace function public.extrato_para_financeiro() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m record; v_slug text; v_nome text; v_dre text; v_grupo text; v_id text; v_conta uuid; v_tipo text; v_met text;
  n_novo int := 0; n_ligado int := 0; n_atual int := 0;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin') or pode('financeiro', 'editar')) then
    raise exception 'sem permissão para lançar no Financeiro';
  end if;

  for m in
    select e.*, (e.data at time zone 'America/Sao_Paulo')::date as dia
      from extrato_movimentos e
     where e.fonte = 'banco' and e.categoria is not null and e.categoria_confirmada
       and e.tipo not in ('transferencia', 'saque') and e.valor <> 0
     order by e.data
  loop
    v_slug := null; v_nome := null; v_dre := null; v_grupo := null;
    select c.slug, c.nome, c.dre, c.dre_grupo into v_slug, v_nome, v_dre, v_grupo from extrato_categoria_fin c where c.categoria = m.categoria;
    if v_slug is null then
      v_slug := trim(both '_' from regexp_replace(lower(translate(m.categoria,
                 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]+', '_', 'g'));
      v_nome  := m.categoria;
      v_dre   := case when m.valor < 0 then 'despesa' end;
      v_grupo := case when m.valor < 0 then 'outras' end;
      insert into extrato_categoria_fin (categoria, slug, nome, dre, dre_grupo) values (m.categoria, v_slug, v_nome, v_dre, v_grupo) on conflict (categoria) do nothing;
    end if;
    insert into financial_categories (id, nome, slug, sistema, ativo, dre, dre_grupo)
    values ('fincat_' || left(md5(v_slug), 17), v_nome, v_slug, false, true, v_dre, v_grupo)
    on conflict (slug) do nothing;

    v_tipo := case when m.valor > 0 then 'receivable' else 'payable' end;
    v_met  := case when m.descricao ilike 'PIX%' then 'pix'
                   when m.descricao ilike 'BOLETO%' then 'boleto'
                   when m.descricao ilike 'RECEBIMENTO REDE%' then 'credit_card'
                   else 'transfer' end;
    select a.id into v_conta from cash_accounts a where a.ativo and m.conta ilike a.nome || '%' order by a.created_date limit 1;

    if m.financeiro_id is null then
      v_id := null;
      select f.id into v_id
        from financial_entries f
       where f.type = v_tipo and f.status = 'paid' and coalesce(f.reference_type, '') <> 'extrato'
         and abs(f.amount - abs(m.valor)) < 0.005
         and f.payment_date ~ '^\d{4}-\d{2}-\d{2}' and abs(left(f.payment_date, 10)::date - m.dia) <= 3
         and (f.account_id is null or v_conta is null or f.account_id = v_conta)
         and not exists (select 1 from extrato_movimentos x where x.financeiro_id = f.id)
       order by abs(left(f.payment_date, 10)::date - m.dia)
       limit 1;
      if v_id is not null then
        n_ligado := n_ligado + 1;
      else
        v_id := 'ext' || left(md5(m.id), 21);
        insert into financial_entries (id, type, description, category, reference_id, reference_type, amount, due_date, payment_date,
                                       status, payment_method, notes, created_date, updated_date, created_by, account_id)
        values (v_id, v_tipo, left(m.descricao, 200), v_slug, m.id, 'extrato', abs(m.valor), m.dia::text, m.dia::text,
                'paid', v_met, 'Lançado sozinho a partir do extrato: ' || m.conta, now(), now(), 'extrato', v_conta)
        on conflict (id) do nothing;
        n_novo := n_novo + 1;
      end if;
      update extrato_movimentos set financeiro_id = v_id, updated_date = now() where id = m.id;
    else
      update financial_entries set category = v_slug, updated_date = now()
       where id = m.financeiro_id and reference_type = 'extrato' and category is distinct from v_slug;
      if found then n_atual := n_atual + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('novos', n_novo, 'ligados', n_ligado, 'atualizados', n_atual) || fatura_para_financeiro_interno() || jsonb_build_object('saldos_conferidos', atualizar_saldo_conferido());
end $$;
revoke all on function public.extrato_para_financeiro() from public, anon;
grant execute on function public.extrato_para_financeiro() to authenticated, service_role;

