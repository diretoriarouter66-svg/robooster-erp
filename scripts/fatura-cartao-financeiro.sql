-- 02/10/2026 — Fatura do cartão → Financeiro.
-- Cada fatura vira um lançamento A PAGAR por categoria (compras menos estornos da categoria), com vencimento = vencimento
-- da fatura; a soma dos lançamentos é o total da fatura. Quando o extrato do banco traz o pagamento da fatura
-- (mesmo valor, perto do vencimento), os lançamentos passam a PAGOS e a linha do banco fica casada com a fatura.
-- Na DRE, a fatura conta no mês ANTERIOR ao vencimento (competência: fatura que vence em outubro = compras de setembro).

insert into public.extrato_categoria_fin (categoria, slug, nome, dre, dre_grupo) values
  ('Hospedagem e servidores (Hostinger)', 'hospedagem_e_servidores', 'Hospedagem e servidores (Hostinger)', 'despesa', 'administrativa'),
  ('Assinatura de software',              'assinatura_de_software',  'Assinatura de software',              'despesa', 'administrativa'),
  ('Anúncios (Google Ads)',               'anuncios_google_ads',     'Anúncios (Google Ads)',               'despesa', 'comercial'),
  ('Anuidade do cartão',                  'anuidade_do_cartao',      'Anuidade do cartão',                  'despesa', 'financeira'),
  ('Compra no Mercado Livre',             'compra_no_mercado_livre', 'Compra no Mercado Livre',             'despesa', 'outras')
on conflict (categoria) do nothing;

-- resolve (e cria, se preciso) a categoria do Financeiro para uma categoria do extrato; devolve o slug
create or replace function public.extrato_categoria_resolver(p_categoria text, p_saida boolean) returns text
language plpgsql security definer set search_path = public as $$
declare v_slug text; v_nome text; v_dre text; v_grupo text;
begin
  select c.slug, c.nome, c.dre, c.dre_grupo into v_slug, v_nome, v_dre, v_grupo from extrato_categoria_fin c where c.categoria = p_categoria;
  if v_slug is null then
    v_slug := trim(both '_' from regexp_replace(lower(translate(p_categoria,
               'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]+', '_', 'g'));
    v_nome  := p_categoria;
    v_dre   := case when p_saida then 'despesa' end;
    v_grupo := case when p_saida then 'outras' end;
    insert into extrato_categoria_fin (categoria, slug, nome, dre, dre_grupo) values (p_categoria, v_slug, v_nome, v_dre, v_grupo) on conflict (categoria) do nothing;
  end if;
  insert into financial_categories (id, nome, slug, sistema, ativo, dre, dre_grupo)
  values ('fincat_' || left(md5(v_slug), 17), v_nome, v_slug, false, true, v_dre, v_grupo)
  on conflict (slug) do nothing;
  return v_slug;
end $$;
revoke all on function public.extrato_categoria_resolver(text, boolean) from public, anon, authenticated;

create or replace function public.fatura_para_financeiro_interno() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f record; g record; b record; v_id text; v_conta uuid; v_ref text;
  n_novo int := 0; n_atual int := 0; n_pago int := 0;
begin
  for f in
    select e.conta, e.referencia, (substring(e.referencia from '\d{4}-\d{2}-\d{2}'))::date as venc, sum(-e.valor) as total
      from extrato_movimentos e
     where e.fonte = 'cartao' and e.referencia ~ '^fatura \d{4}-\d{2}-\d{2}'
     group by 1, 2
  loop
    v_ref := 'fatura:' || f.conta || ':' || f.venc;
    select a.id into v_conta from cash_accounts a where a.ativo and f.conta ilike '%' || a.nome || '%' order by a.created_date limit 1;

    -- garante a categoria no Financeiro ANTES de somar (linha criada dentro da própria consulta não seria vista por ela)
    perform extrato_categoria_resolver(d.categoria, true)
       from (select distinct e.categoria from extrato_movimentos e
              where e.fonte = 'cartao' and e.conta = f.conta and e.referencia = f.referencia
                and e.categoria is not null and e.categoria_confirmada) d;

    for g in
      select m.slug, max(c.nome) as nome, sum(-e.valor) as liquido, count(*) as n
        from extrato_movimentos e
        join extrato_categoria_fin m on m.categoria = e.categoria
        join financial_categories c on c.slug = m.slug
       where e.fonte = 'cartao' and e.conta = f.conta and e.referencia = f.referencia
         and e.categoria is not null and e.categoria_confirmada
       group by m.slug
    loop
      v_id := 'extc' || left(md5(v_ref || ':' || g.slug), 20);
      if abs(g.liquido) < 0.005 then
        -- compras e estornos da categoria se anulam: nada a pagar
        delete from financial_entries where id = v_id and reference_type = 'extrato';
      elsif exists (select 1 from financial_entries where id = v_id) then
        update financial_entries
           set amount = abs(g.liquido), type = case when g.liquido > 0 then 'payable' else 'receivable' end,
               description = 'Fatura ' || f.conta || ' venc. ' || to_char(f.venc, 'DD/MM/YYYY') || ' — ' || g.nome || ' (' || g.n || ' lanç.)',
               updated_date = now()
         where id = v_id and reference_type = 'extrato'
           and (abs(amount - abs(g.liquido)) >= 0.005 or type <> case when g.liquido > 0 then 'payable' else 'receivable' end);
        if found then n_atual := n_atual + 1; end if;
      else
        insert into financial_entries (id, type, description, category, reference_id, reference_type, amount, due_date, payment_date,
                                       status, payment_method, notes, created_date, updated_date, created_by, account_id)
        values (v_id, case when g.liquido > 0 then 'payable' else 'receivable' end,
                'Fatura ' || f.conta || ' venc. ' || to_char(f.venc, 'DD/MM/YYYY') || ' — ' || g.nome || ' (' || g.n || ' lanç.)',
                g.slug, v_ref || ':' || g.slug, 'extrato', abs(g.liquido), f.venc::text, null,
                'pending', 'credit_card', 'Lançado sozinho a partir da fatura do cartão (compras menos estornos da categoria)', now(), now(), 'extrato', v_conta);
        n_novo := n_novo + 1;
      end if;
      update extrato_movimentos e set financeiro_id = case when abs(g.liquido) < 0.005 then null else v_id end, updated_date = now()
       where e.fonte = 'cartao' and e.conta = f.conta and e.referencia = f.referencia and e.categoria_confirmada
         and e.categoria in (select m.categoria from extrato_categoria_fin m where m.slug = g.slug)
         and e.financeiro_id is distinct from case when abs(g.liquido) < 0.005 then null else v_id end;
    end loop;

    -- categoria que deixou de ter lançamento na fatura (o dono trocou a categoria na Conciliação)
    delete from financial_entries fe
     where fe.reference_type = 'extrato' and fe.reference_id like v_ref || ':%'
       and not exists (select 1 from extrato_movimentos e where e.financeiro_id = fe.id);

    -- pagamento da fatura no extrato do banco: mesmo valor, de 5 dias antes a 10 dias depois do vencimento
    select e.id, (e.data at time zone 'America/Sao_Paulo')::date as dia into b
      from extrato_movimentos e
     where e.fonte = 'banco' and e.valor < 0 and abs(e.valor + f.total) < 0.005
       and e.categoria ilike 'Pagamento da fatura%'
       and (e.data at time zone 'America/Sao_Paulo')::date between f.venc - 5 and f.venc + 10
       and (e.casado_com is null or e.casado_com = v_ref)
     order by e.data limit 1;
    if b.id is not null then
      update financial_entries set status = 'paid', payment_date = b.dia::text, updated_date = now()
       where reference_type = 'extrato' and reference_id like v_ref || ':%' and status <> 'paid';
      if found then n_pago := n_pago + 1; end if;
      update extrato_movimentos set casado_com = v_ref, casado_tipo = 'fatura', situacao = 'casado', updated_date = now()
       where id = b.id and casado_com is distinct from v_ref;
    end if;
  end loop;
  return jsonb_build_object('fatura_novos', n_novo, 'fatura_atualizados', n_atual, 'faturas_pagas', n_pago);
end $$;
revoke all on function public.fatura_para_financeiro_interno() from public, anon, authenticated;

-- função principal: mesma de dre-grupos.sql, agora chamando a da fatura no fim
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

  return jsonb_build_object('novos', n_novo, 'ligados', n_ligado, 'atualizados', n_atual) || fatura_para_financeiro_interno();
end $$;
revoke all on function public.extrato_para_financeiro() from public, anon;
grant execute on function public.extrato_para_financeiro() to authenticated, service_role;
