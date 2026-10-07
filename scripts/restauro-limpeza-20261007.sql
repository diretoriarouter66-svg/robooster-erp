-- RESTAURA OS DADOS APAGADOS NA LIMPEZA DE 06/10/2026 — pedido do Mauricio em 07/10/2026 00h18:
-- "Você pode voltar os dados que estavam antes no ERP que ficou tudo cagado".
-- Fonte: /root/backups-erp/limpeza-corte-20261006/tabelas-afetadas-antes.sql (cópia de 06/10 20h32), carregada no esquema
-- restauro_20261007. Só insere o que falta, pelo id: o que entrou ou mudou depois da limpeza fica como está
-- (1 nota de outubro nova; 3 vendas de outubro do ML atualizadas). session_replication_role = replica devolve as linhas
-- exatamente como eram, sem disparar gatilhos (o gatilho de estoque mexeria no saldo dos produtos).
-- Também volta a definição antiga de base_despesas_fixas() (sem data de corte nem base provisória).

begin;
set local session_replication_role = replica;

do $$
declare n int;
begin
  select count(*) into n from restauro_20261007.ml_pedidos r where not exists (select 1 from public.ml_pedidos p where p.id = r.id);
  if n <> 30 then raise exception 'antes: faltam % vendas do ML (esperado 30)', n; end if;
  select count(*) into n from restauro_20261007.fiscal_notas r where not exists (select 1 from public.fiscal_notas p where p.id = r.id);
  if n <> 72 then raise exception 'antes: faltam % notas (esperado 72)', n; end if;
  select count(*) into n from restauro_20261007.extrato_movimentos r where not exists (select 1 from public.extrato_movimentos p where p.id = r.id);
  if n <> 65 then raise exception 'antes: faltam % linhas de extrato (esperado 65)', n; end if;
  select count(*) into n from restauro_20261007.financial_entries r where not exists (select 1 from public.financial_entries p where p.id = r.id);
  if n <> 63 then raise exception 'antes: faltam % lançamentos (esperado 63)', n; end if;
  select count(*) into n from restauro_20261007.sale_orders r where not exists (select 1 from public.sale_orders p where p.id = r.id);
  if n <> 1 then raise exception 'antes: faltam % pedidos (esperado 1)', n; end if;
  select count(*) into n from restauro_20261007.stock_movements r where not exists (select 1 from public.stock_movements p where p.id = r.id);
  if n <> 84 then raise exception 'antes: faltam % movimentos de estoque (esperado 84)', n; end if;
  select count(*) into n from restauro_20261007.nfe_avulsas r where not exists (select 1 from public.nfe_avulsas p where p.id = r.id);
  if n <> 1 then raise exception 'antes: faltam % notas avulsas (esperado 1)', n; end if;
  select count(*) into n from restauro_20261007.contatos r where not exists (select 1 from public.contatos p where p.id = r.id);
  if n <> 1 then raise exception 'antes: faltam % contatos (esperado 1)', n; end if;
end $$;

insert into public.ml_pedidos select r.* from restauro_20261007.ml_pedidos r where not exists (select 1 from public.ml_pedidos p where p.id = r.id);
insert into public.fiscal_notas select r.* from restauro_20261007.fiscal_notas r where not exists (select 1 from public.fiscal_notas p where p.id = r.id);
insert into public.extrato_movimentos select r.* from restauro_20261007.extrato_movimentos r where not exists (select 1 from public.extrato_movimentos p where p.id = r.id);
insert into public.financial_entries select r.* from restauro_20261007.financial_entries r where not exists (select 1 from public.financial_entries p where p.id = r.id);
insert into public.sale_orders select r.* from restauro_20261007.sale_orders r where not exists (select 1 from public.sale_orders p where p.id = r.id);
insert into public.stock_movements select r.* from restauro_20261007.stock_movements r where not exists (select 1 from public.stock_movements p where p.id = r.id);
insert into public.nfe_avulsas select r.* from restauro_20261007.nfe_avulsas r where not exists (select 1 from public.nfe_avulsas p where p.id = r.id);
insert into public.contatos select r.* from restauro_20261007.contatos r where not exists (select 1 from public.contatos p where p.id = r.id);

do $$
declare n int; v numeric;
begin
  select count(*) into n from ml_pedidos; if n <> 33 then raise exception 'depois: vendas do ML esperado 33, achado %', n; end if;
  select count(*) into n from fiscal_notas; if n <> 75 then raise exception 'depois: notas esperado 75, achado %', n; end if;
  select count(*) into n from extrato_movimentos; if n <> 88 then raise exception 'depois: extrato esperado 88, achado %', n; end if;
  select count(*) into n from financial_entries; if n <> 76 then raise exception 'depois: lançamentos esperado 76, achado %', n; end if;
  select count(*) into n from sale_orders; if n <> 3 then raise exception 'depois: pedidos esperado 3, achado %', n; end if;
  select count(*) into n from stock_movements; if n <> 223 then raise exception 'depois: movimentos esperado 223, achado %', n; end if;
  select count(*) into n from nfe_avulsas; if n <> 1 then raise exception 'depois: notas avulsas esperado 1, achado %', n; end if;
  select count(*) into n from contatos; if n <> 10 then raise exception 'depois: contatos esperado 10, achado %', n; end if;
  select coalesce(sum(stock_quantity), 0) into v from products where sku not like 'RB-%'; if v <> 1727 then raise exception 'depois: estoque Bling esperado 1727, achado %', v; end if;
  select coalesce(sum(stock_quantity), 0) into v from products where sku like 'RB-%'; if v <> 0 then raise exception 'depois: estoque RB esperado 0, achado %', v; end if;
end $$;

-- definição de base_despesas_fixas() de antes da limpeza (guardada em /root/backups-erp/limpeza-corte-20261006/)
CREATE OR REPLACE FUNCTION public.base_despesas_fixas()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  resultado json;
  ver_valores boolean := public.pode('financeiro', 'ver');
  mes_atual text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
begin
  with desp as (
    select case when e.reference_type = 'extrato' and e.reference_id like 'fatura:%'
                then to_char(date_trunc('month', left(e.due_date, 10)::date) - interval '1 month', 'YYYY-MM')
                else left(e.payment_date, 7) end as mes,
           e.amount as valor
      from public.financial_entries e
      join public.financial_categories c on c.slug = e.category
     where e.fixa is true and e.type = 'payable' and coalesce(e.status, '') <> 'cancelled'
       and c.dre_grupo is not null and c.dre_grupo not in ('informativo', 'receita_financeira')
       and ( (e.reference_type = 'extrato' and e.reference_id like 'fatura:%' and e.due_date ~ '^\d{4}-\d{2}-\d{2}')
          or (e.status = 'paid' and e.payment_date ~ '^\d{4}-\d{2}') )
  ),
  fix as (select mes, sum(valor) as v from desp group by mes),
  -- meses = os 3 últimos meses FECHADOS com despesa fixa lançada (mês só com extrato do PayPal não conta: diluiria a média)
  meses as (select mes from fix where v > 0 and mes < mes_atual order by mes desc limit 3),
  fat as (
    select to_char(n.data_emissao at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes, sum(n.valor) as v
      from public.fiscal_notas n
     where n.bruto ->> 'tipo' = '1' and n.situacao_cod in (5, 6, 7)
     group by 1
  ),
  base as (
    select m.mes, coalesce(f.v, 0)::numeric as fixas, coalesce(t.v, 0)::numeric as faturamento
      from meses m left join fix f using (mes) left join fat t using (mes)
  ),
  tot as (select count(*) as n, sum(fixas) as fixas, sum(faturamento) as fat from base)
  select case when ver_valores then json_build_object(
           'meses', (select coalesce(json_agg(json_build_object('mes', mes, 'fixas', round(fixas, 2), 'faturamento', round(faturamento, 2)) order by mes), '[]'::json) from base),
           'meses_usados', tot.n,
           'media_fixas', case when tot.n > 0 then round(tot.fixas / tot.n, 2) else 0 end,
           'media_faturamento', case when tot.n > 0 then round(tot.fat / tot.n, 2) else 0 end,
           'pct', case when coalesce(tot.fat, 0) > 0 then round(tot.fixas / tot.fat, 6) else 0 end)
         else json_build_object(
           'meses_usados', tot.n,
           'pct', case when coalesce(tot.fat, 0) > 0 then round(tot.fixas / tot.fat, 6) else 0 end)
         end
    into resultado
    from tot;
  return resultado;
end $function$

;

commit;
