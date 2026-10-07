-- 07/10/2026 — Mercado Pago como conta do Financeiro (ordem do dono "Pode colocar o Mercado Pago como conta no Financeiro").
-- Conta 'Mercado Pago' em cash_accounts; função mercadopago_para_financeiro_interno(): (1) saque CASADO com o extrato do banco vira
-- transferência: saída da conta Mercado Pago (data do MP) + entrada no Itaú (data do banco), sem depender de confirmação (o casamento é
-- a prova); (2) frete/retenção/estorno confirmados na Conciliação viram lançamento pago na conta Mercado Pago;
-- (3) VENDA NUNCA vira lançamento (a receita do Mercado Livre já entra pelos pedidos — evitar receita dobrada).
insert into cash_accounts (id, nome, saldo_inicial, ativo, metodos, created_date, updated_date)
select gen_random_uuid(), 'Mercado Pago', 0, true, '{mercadopago}', now(), now()
 where not exists (select 1 from cash_accounts where nome = 'Mercado Pago');

create or replace function public.mercadopago_para_financeiro_interno() returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare m record; v_conta uuid; v_banco uuid; v_dia_banco date; v_id text; v_slug text; n_novo int := 0; n_saque int := 0;
begin
  select a.id into v_conta from cash_accounts a where a.ativo and a.nome = 'Mercado Pago' limit 1;
  if v_conta is null then return jsonb_build_object('mercadopago_novos', 0, 'mercadopago_saques_no_banco', 0, 'aviso', 'sem conta Mercado Pago'); end if;
  for m in
    select e.*, (e.data at time zone 'America/Sao_Paulo')::date as dia
      from extrato_movimentos e
     where e.fonte = 'mercadopago' and e.valor <> 0 and e.tipo <> 'venda'
     order by e.data
  loop
    v_id := 'extm' || left(md5(m.id), 20);
    -- (1) saque casado: as duas pernas da transferência
    if m.tipo = 'saque' and m.casado_com is not null and m.casado_tipo = 'saque' then
      select a.id, (b.data at time zone 'America/Sao_Paulo')::date into v_banco, v_dia_banco
        from extrato_movimentos b join cash_accounts a on a.ativo and b.conta ilike a.nome || '%'
       where b.id = m.casado_com order by a.created_date limit 1;
      if m.financeiro_id is null then
        insert into financial_entries (id, type, description, category, reference_id, reference_type, amount, due_date, payment_date, status, payment_method, notes, created_date, updated_date, created_by, account_id)
        values (v_id, 'payable', 'Saque do Mercado Pago para o banco', 'transferencia', m.id, 'extrato', abs(m.valor), m.dia::text, m.dia::text, 'paid', 'transfer',
                'Lançado sozinho: saque do Mercado Pago casado com o extrato do banco', now(), now(), 'extrato', v_conta)
        on conflict (id) do nothing;
        update extrato_movimentos set financeiro_id = v_id, updated_date = now() where id = m.id;
        n_novo := n_novo + 1;
      end if;
      if v_banco is not null and not exists (select 1 from financial_entries where id = 'extm' || left(md5(m.id || ':banco'), 20)) then
        insert into financial_entries (id, type, description, category, reference_id, reference_type, amount, due_date, payment_date, status, payment_method, notes, created_date, updated_date, created_by, account_id)
        values ('extm' || left(md5(m.id || ':banco'), 20), 'receivable', 'Saque do Mercado Pago recebido no banco', 'transferencia', m.id || ':banco', 'extrato',
                abs(m.valor), v_dia_banco::text, v_dia_banco::text, 'paid', 'transfer', 'Lançado sozinho: saque do Mercado Pago casado com o extrato do banco', now(), now(), 'extrato', v_banco);
        update extrato_movimentos set financeiro_id = 'extm' || left(md5(m.id || ':banco'), 20), updated_date = now() where id = m.casado_com and financeiro_id is null;
        n_saque := n_saque + 1;
      end if;
    -- (2) frete / retenção / estorno: só depois de confirmado na Conciliação
    -- (2) frete / retenção / estorno, e saque SEM par (ex.: transferência para a conta MP da Saber): só depois de confirmado na Conciliação
    elsif m.categoria is not null and m.categoria_confirmada and m.financeiro_id is null then
      v_slug := extrato_categoria_resolver(m.categoria, m.valor < 0);
      insert into financial_entries (id, type, description, category, reference_id, reference_type, amount, due_date, payment_date, status, payment_method, notes, created_date, updated_date, created_by, account_id)
      values (v_id, case when m.valor > 0 then 'receivable' else 'payable' end, left(coalesce(m.descricao, m.categoria), 200), v_slug, m.id, 'extrato',
              abs(m.valor), m.dia::text, m.dia::text, 'paid', 'mercadopago', 'Lançado sozinho a partir do relatório do Mercado Pago', now(), now(), 'extrato', v_conta)
      on conflict (id) do nothing;
      update extrato_movimentos set financeiro_id = v_id, updated_date = now() where id = m.id;
      n_novo := n_novo + 1;
    end if;
  end loop;
  return jsonb_build_object('mercadopago_novos', n_novo, 'mercadopago_saques_no_banco', n_saque);
end $function$;

CREATE OR REPLACE FUNCTION public.extrato_para_financeiro()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  return jsonb_build_object('novos', n_novo, 'ligados', n_ligado, 'atualizados', n_atual) || fatura_para_financeiro_interno() || paypal_para_financeiro_interno() || mercadopago_para_financeiro_interno() || jsonb_build_object('saldos_conferidos', atualizar_saldo_conferido());
end $function$

;
