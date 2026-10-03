-- 02/10/2026 — PayPal → Financeiro.
-- Venda pelo site: recebimento PAGO na conta PayPal pelo valor cheio + a taxa do PayPal como saída paga (o líquido fica na conta).
-- Saque: transferência PayPal → banco (saída na conta PayPal; a entrada no banco só nasce quando o saque está casado
-- com a linha do extrato do banco). Estorno: saída na conta PayPal como devolução de venda.
insert into public.extrato_categoria_fin (categoria, slug, nome, dre, dre_grupo) values
  ('Venda pelo site (PayPal)',      'sale',          'Venda',                       null, null),
  ('Saque do PayPal para o banco',  'transferencia', 'Transferência entre contas',  null, null),
  ('Estorno de venda (PayPal)',     'devolucao_venda', 'Devolução de Venda (reembolso)', null, null),
  ('Taxa do PayPal',                'taxa_paypal',   'Taxa do PayPal',              'despesa', null)
on conflict (categoria) do nothing;
-- a taxa do PayPal fica fora da DRE até a venda do site entrar na receita (e-commerce é a última etapa); no Financeiro já aparece
insert into public.financial_categories (id, nome, slug, sistema, ativo, dre, dre_grupo) values
  ('fincat_transferencia', 'Transferência entre contas', 'transferencia', true, true, null, null),
  ('fincat_taxa_paypal',   'Taxa do PayPal',             'taxa_paypal',   false, true, 'despesa', null)
on conflict (slug) do nothing;

create or replace function public.paypal_para_financeiro_interno() returns jsonb
language plpgsql security definer set search_path = public as $$
declare m record; v_conta uuid; v_banco uuid; v_id text; v_slug text; n_novo int := 0; n_saque_banco int := 0;
begin
  for m in
    select e.*, (e.data at time zone 'America/Sao_Paulo')::date as dia
      from extrato_movimentos e
     where e.fonte = 'paypal' and e.categoria is not null and e.categoria_confirmada and e.valor <> 0
     order by e.data
  loop
    select a.id into v_conta from cash_accounts a where a.ativo and m.conta ilike a.nome || '%' order by a.created_date limit 1;
    v_slug := extrato_categoria_resolver(m.categoria, m.valor < 0);
    v_id := 'extp' || left(md5(m.id), 20);
    if m.financeiro_id is null then
      if m.tipo = 'venda' then
        insert into financial_entries (id, type, description, category, reference_id, reference_type, amount, due_date, payment_date, status, payment_method, notes, created_date, updated_date, created_by, account_id)
        values (v_id, 'receivable', left(coalesce(m.descricao, 'Venda pelo site') || coalesce(' · ' || m.contraparte, ''), 200), v_slug, m.id, 'extrato',
                coalesce(m.bruto, m.valor), m.dia::text, m.dia::text, 'paid', 'paypal', 'Lançado sozinho a partir do PayPal (valor cheio; a taxa é outro lançamento)', now(), now(), 'extrato', v_conta)
        on conflict (id) do nothing;
        if m.taxa is not null and m.taxa <> 0 then
          insert into financial_entries (id, type, description, category, reference_id, reference_type, amount, due_date, payment_date, status, payment_method, notes, created_date, updated_date, created_by, account_id)
          values ('extp' || left(md5(m.id || ':taxa'), 20), 'payable', left('Taxa do PayPal — ' || coalesce(m.descricao, ''), 200), 'taxa_paypal', m.id || ':taxa', 'extrato',
                  abs(m.taxa), m.dia::text, m.dia::text, 'paid', 'paypal', 'Lançado sozinho a partir do PayPal', now(), now(), 'extrato', v_conta)
          on conflict (id) do nothing;
        end if;
      else
        insert into financial_entries (id, type, description, category, reference_id, reference_type, amount, due_date, payment_date, status, payment_method, notes, created_date, updated_date, created_by, account_id)
        values (v_id, case when m.valor > 0 then 'receivable' else 'payable' end, left(coalesce(m.descricao, m.categoria), 200), v_slug, m.id, 'extrato',
                abs(m.valor), m.dia::text, m.dia::text, 'paid', 'paypal', 'Lançado sozinho a partir do PayPal', now(), now(), 'extrato', v_conta)
        on conflict (id) do nothing;
      end if;
      update extrato_movimentos set financeiro_id = v_id, updated_date = now() where id = m.id;
      n_novo := n_novo + 1;
    end if;
    -- saque casado com o extrato do banco: a entrada no banco nasce aqui, na data em que o banco recebeu
    if m.tipo = 'saque' and m.casado_com is not null and m.casado_tipo = 'saque' then
      select a.id, (b.data at time zone 'America/Sao_Paulo')::date into v_banco, m.dia
        from extrato_movimentos b join cash_accounts a on a.ativo and b.conta ilike a.nome || '%'
       where b.id = m.casado_com order by a.created_date limit 1;
      if v_banco is not null and not exists (select 1 from financial_entries where id = 'extp' || left(md5(m.id || ':banco'), 20)) then
        insert into financial_entries (id, type, description, category, reference_id, reference_type, amount, due_date, payment_date, status, payment_method, notes, created_date, updated_date, created_by, account_id)
        values ('extp' || left(md5(m.id || ':banco'), 20), 'receivable', 'Saque do PayPal recebido no banco', 'transferencia', m.id || ':banco', 'extrato',
                abs(m.valor), m.dia::text, m.dia::text, 'paid', 'transfer', 'Lançado sozinho: saque do PayPal casado com o extrato do banco', now(), now(), 'extrato', v_banco);
        n_saque_banco := n_saque_banco + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('paypal_novos', n_novo, 'paypal_saques_no_banco', n_saque_banco);
end $$;
revoke all on function public.paypal_para_financeiro_interno() from public, anon, authenticated;

-- função principal: agora também lança o PayPal
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

  return jsonb_build_object('novos', n_novo, 'ligados', n_ligado, 'atualizados', n_atual) || fatura_para_financeiro_interno() || paypal_para_financeiro_interno() || jsonb_build_object('saldos_conferidos', atualizar_saldo_conferido());
end $$;
revoke all on function public.extrato_para_financeiro() from public, anon;
grant execute on function public.extrato_para_financeiro() to authenticated, service_role;



-- Regra dele (02/10/2026): o que entra na DRE se decide no cadastro de categorias, e o padrão é ENTRAR.
-- Categorias que estavam sem grupo passam a entrar; custo de mercadoria e as estruturais ficam fixas na própria DRE.
update public.financial_categories set dre_grupo = 'financeira', dre = 'despesa' where slug in ('taxa_paypal', 'card_fee') and dre_grupo is null;
update public.financial_categories set dre_grupo = 'comercial',  dre = 'despesa' where slug = 'marketplace_fee' and dre_grupo is null;
update public.financial_categories set dre_grupo = 'outras',     dre = 'despesa' where slug = 'other' and dre_grupo is null;
update public.extrato_categoria_fin set dre_grupo = 'financeira' where slug = 'taxa_paypal' and dre_grupo is null;
update public.financial_categories set dre_grupo = 'imposto', dre = 'despesa' where slug = 'tax' and dre_grupo is null;
