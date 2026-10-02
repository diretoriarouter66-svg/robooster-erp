-- 02/10/2026 — Extrato → Financeiro.
-- Cada lançamento do extrato do banco com categoria confirmada vira lançamento PAGO no Financeiro
-- (financial_entries, reference_type = 'extrato'). Transferências entre contas ficam de fora.
-- Se já existe lançamento pago à mão com o mesmo valor (até 3 dias de diferença), liga em vez de duplicar.
-- A DRE Realizada passa a ler as despesas do mês pelas categorias marcadas com dre = 'despesa'.

alter table public.financial_categories add column if not exists dre text;   -- 'despesa' | 'informativo' | null
alter table public.extrato_movimentos   add column if not exists financeiro_id text;
create index if not exists extrato_movimentos_fin_idx on public.extrato_movimentos (financeiro_id);

-- De-para: categoria do extrato → categoria do Financeiro e papel na DRE.
create table if not exists public.extrato_categoria_fin (
  categoria    text primary key,
  slug         text not null,
  nome         text not null,
  dre          text,
  created_date timestamptz default now()
);
alter table public.extrato_categoria_fin enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'extrato_categoria_fin_ver') then
    create policy extrato_categoria_fin_ver on public.extrato_categoria_fin for select using (pode('financeiro','ver'));
  end if;
end $$;
grant select on public.extrato_categoria_fin to authenticated;

insert into public.extrato_categoria_fin (categoria, slug, nome, dre) values
  ('Recebimento de cartão (maquininha Rede)', 'sale',    'Venda',    null),
  ('Recebimento de cliente (Pix)',            'sale',    'Venda',    null),
  ('Recebimento de cliente',                  'sale',    'Venda',    null),
  ('Salários',                                'salary',  'Salário',  'despesa'),
  ('Aluguel',                                 'rent',    'Aluguel',  'despesa'),
  ('Correios',                                'freight', 'Frete',    'despesa'),
  -- DAS já entra na DRE pela receita do mês (competência); o pagamento no banco é só informativo
  ('Imposto federal',                         'tax',     'Imposto',  'informativo'),
  -- não são despesa: distribuição ao sócio, amortização de empréstimo, compra que vira estoque
  ('Retirada de sócio',                       'retirada_de_socio',    'Retirada de sócio',                 'informativo'),
  ('Parcela de empréstimo (capital de giro)', 'parcela_de_emprestimo', 'Parcela de empréstimo (capital de giro)', 'informativo'),
  ('Compra de peças',                         'compra_de_pecas',      'Compra de peças',                   'informativo'),
  ('Locaweb/LWSA (a confirmar o que é)',      'locaweb_lwsa',         'Locaweb/LWSA',                      'despesa')
on conflict (categoria) do nothing;

update public.financial_categories set dre = 'despesa'     where slug in ('salary', 'rent', 'freight') and dre is null;
update public.financial_categories set dre = 'informativo' where slug = 'tax' and dre is null;

create or replace function public.extrato_para_financeiro() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m record; v_slug text; v_nome text; v_dre text; v_id text; v_conta uuid; v_tipo text; v_met text;
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
    v_slug := null; v_nome := null; v_dre := null;
    select c.slug, c.nome, c.dre into v_slug, v_nome, v_dre from extrato_categoria_fin c where c.categoria = m.categoria;
    if v_slug is null then
      -- categoria criada pelo dono na tela: nasce no Financeiro com o mesmo nome; saída conta como despesa
      v_slug := trim(both '_' from regexp_replace(lower(translate(m.categoria,
                 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]+', '_', 'g'));
      v_nome := m.categoria;
      v_dre  := case when m.valor < 0 then 'despesa' end;
      insert into extrato_categoria_fin (categoria, slug, nome, dre) values (m.categoria, v_slug, v_nome, v_dre) on conflict (categoria) do nothing;
    end if;
    insert into financial_categories (id, nome, slug, sistema, ativo, dre)
    values ('fincat_' || left(md5(v_slug), 17), v_nome, v_slug, false, true, v_dre)
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
      -- o dono mudou a categoria na Conciliação: o lançamento que nasceu do extrato acompanha
      update financial_entries set category = v_slug, updated_date = now()
       where id = m.financeiro_id and reference_type = 'extrato' and category is distinct from v_slug;
      if found then n_atual := n_atual + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('novos', n_novo, 'ligados', n_ligado, 'atualizados', n_atual);
end $$;

revoke all on function public.extrato_para_financeiro() from public, anon;
grant execute on function public.extrato_para_financeiro() to authenticated, service_role;
