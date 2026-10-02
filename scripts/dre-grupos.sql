-- 02/10/2026 — DRE Realizada no modelo da planilha da empresa: cada categoria do Financeiro pertence a um grupo da DRE.
-- dre_grupo: assistencia | administrativa | pessoal | comercial | outras | financeira | receita_financeira | imposto | informativo | null (não entra)
alter table public.financial_categories   add column if not exists dre_grupo text;
alter table public.extrato_categoria_fin  add column if not exists dre_grupo text;

update public.financial_categories c set dre_grupo = g.grupo
  from (values
    ('agua','administrativa'), ('rent','administrativa'), ('energia_eletrica','administrativa'), ('faxina','administrativa'),
    ('contabilidade','administrativa'), ('telefone_e_internet','administrativa'), ('locaweb_lwsa','administrativa'),
    ('salary','pessoal'), ('fgts','pessoal'), ('encargos_da_folha','pessoal'),
    ('transporte_para_o_mercado_livre_full_mensal','comercial'), ('compra_de_insumos','comercial'), ('freight','comercial'),
    ('despesas_viagem_os','comercial'),
    ('compra_de_pecas','assistencia'),
    ('tarifa_bancaria','financeira'),
    ('rendimento_de_aplicacao','receita_financeira'),
    ('iof','imposto'), ('taxa_municipal','imposto'),
    ('retirada_de_socio','informativo'), ('parcela_de_emprestimo','informativo')
  ) as g(slug, grupo)
 where c.slug = g.slug and c.dre_grupo is null;
update public.extrato_categoria_fin m set dre_grupo = c.dre_grupo from public.financial_categories c where c.slug = m.slug and m.dre_grupo is null;
update public.extrato_categoria_fin set dre_grupo = 'receita_financeira' where categoria = 'Rendimento de aplicação' and dre_grupo is null;

-- a função passa a levar o grupo para a categoria nova; categoria criada pelo dono na tela nasce em 'outras'
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

  return jsonb_build_object('novos', n_novo, 'ligados', n_ligado, 'atualizados', n_atual);
end $$;
revoke all on function public.extrato_para_financeiro() from public, anon;
grant execute on function public.extrato_para_financeiro() to authenticated, service_role;

-- Publicação (02/10/2026): o pagamento "Receita Federal" do extrato é encargo da folha, não DAS (conferido com a planilha de DRE da empresa).
update public.extrato_categoria_fin set slug = 'encargos_da_folha', nome = 'Encargos da folha (Receita Federal)', dre = 'despesa', dre_grupo = 'pessoal' where categoria = 'Imposto federal';
select public.extrato_para_financeiro();
