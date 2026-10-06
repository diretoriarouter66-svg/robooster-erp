-- LIMPEZA DO ERP COM DATA DE CORTE 01/10/2026 — ordem do Mauricio "PODE LIMPAR" (06/10/2026)
-- Plano aprovado: doc "ERP · O que funciona e a limpeza de 01/10" (https://claude.ai/artifact/4FiSTc5CRNQgta85ufhjKn).
-- FICA: produtos (134 do Bling com estoque, 40 RB do Container 01, torno 2252 inativo), importação Container 01 com remessas
--       e numerário, PV-1001 e PV-1003 (em aberto) + base instalada, OS nº 1, outubro inteiro, fatura do cartão de 09/10,
--       saldos de abertura (extrato_saldos), cadastros, configurações, patrimônio.
-- SAI:  vendas do ML de setembro, notas do Bling de ago/set, extrato do Itaú de setembro e PayPal (com os lançamentos que
--       geraram), PV-1002 e o sinal, movimentos de estoque dos RB (saldo continua 0: o gatilho de estoque só age em INSERT),
--       rascunho de NF de devolução e o contato criado só para ele.
-- Cópia antes: /root/backups-erp/limpeza-corte-20261006/ (banco completo + tabelas afetadas) e Drive Backups-ERP.
-- A transação confere as contagens antes e depois; qualquer diferença aborta tudo (nada gravado).
-- Junto: data de corte nas rotinas erp-ml-pedidos.py, erp-nf-bling.py, erp-extrato-paypal.py e erp-extrato-arquivos.py.

begin;

do $$
declare n int; corte constant date := '2026-10-01';
begin
  select count(*) into n from ml_pedidos where (data_pedido at time zone 'America/Sao_Paulo')::date < corte;
  if n <> 30 then raise exception 'antes: ml_pedidos de setembro esperado 30, achado %', n; end if;
  select count(*) into n from fiscal_notas where (data_emissao at time zone 'America/Sao_Paulo')::date < corte;
  if n <> 72 then raise exception 'antes: fiscal_notas ago/set esperado 72, achado %', n; end if;
  select count(*) into n from extrato_movimentos where fonte in ('banco', 'paypal') and (data at time zone 'America/Sao_Paulo')::date < corte;
  if n <> 65 then raise exception 'antes: extrato banco+paypal esperado 65, achado %', n; end if;
  select count(*) into n from extrato_movimentos where fonte in ('banco', 'paypal') and (data at time zone 'America/Sao_Paulo')::date >= corte;
  if n <> 0 then raise exception 'antes: há % movimento(s) de banco/paypal de outubro — rever o plano', n; end if;
  select count(*) into n from financial_entries where reference_type = 'extrato' and reference_id not like 'fatura:%';
  if n <> 62 then raise exception 'antes: lançamentos do extrato (sem fatura) esperado 62, achado %', n; end if;
  select count(*) into n from financial_entries where reference_type = 'extrato' and reference_id not like 'fatura:%'
     and coalesce(payment_date, due_date) >= '2026-10-01';
  if n <> 0 then raise exception 'antes: % lançamento(s) do extrato são de outubro — rever o plano', n; end if;
  select count(*) into n from financial_entries f join sale_orders s on s.id = f.reference_id
   where f.reference_type = 'sale_order' and s.order_number = 'PV-1002';
  if n <> 1 then raise exception 'antes: lançamentos do PV-1002 esperado 1, achado %', n; end if;
  select count(*) into n from stock_movements m join products p on p.id = m.product_id where p.sku like 'RB-%';
  if n <> 84 then raise exception 'antes: movimentos de estoque RB esperado 84, achado %', n; end if;
  select count(*) into n from nfe_avulsas;
  if n <> 1 then raise exception 'antes: nfe_avulsas esperado 1, achado %', n; end if;
  select count(*) into n from contatos where created_by = 'devolucoes-automaticas';
  if n <> 1 then raise exception 'antes: contato automático esperado 1, achado %', n; end if;
end $$;

delete from ml_pedidos where (data_pedido at time zone 'America/Sao_Paulo')::date < '2026-10-01';
delete from fiscal_notas where (data_emissao at time zone 'America/Sao_Paulo')::date < '2026-10-01';
delete from extrato_movimentos where fonte in ('banco', 'paypal') and (data at time zone 'America/Sao_Paulo')::date < '2026-10-01';
delete from financial_entries where reference_type = 'extrato' and reference_id not like 'fatura:%';
delete from financial_entries f using sale_orders s where f.reference_type = 'sale_order' and f.reference_id = s.id and s.order_number = 'PV-1002';
delete from sale_orders where order_number = 'PV-1002';
delete from stock_movements m using products p where p.id = m.product_id and p.sku like 'RB-%';
delete from nfe_avulsas where created_by = 'devolucoes-automaticas';
delete from contatos where created_by = 'devolucoes-automaticas';

do $$
declare n int; v numeric;
begin
  select count(*) into n from ml_pedidos; if n <> 3 then raise exception 'depois: ml_pedidos esperado 3, achado %', n; end if;
  select count(*) into n from fiscal_notas; if n <> 2 then raise exception 'depois: fiscal_notas esperado 2, achado %', n; end if;
  select count(*) into n from extrato_movimentos; if n <> 23 then raise exception 'depois: extrato esperado 23, achado %', n; end if;
  select count(*) into n from extrato_movimentos where fonte <> 'cartao'; if n <> 0 then raise exception 'depois: sobrou extrato que não é do cartão (%)', n; end if;
  select count(*) into n from financial_entries; if n <> 13 then raise exception 'depois: financeiro esperado 13, achado %', n; end if;
  select count(*) into n from sale_orders where order_number in ('PV-1001', 'PV-1003'); if n <> 2 then raise exception 'depois: PV-1001/1003 esperado 2, achado %', n; end if;
  select count(*) into n from sale_orders; if n <> 2 then raise exception 'depois: pedidos esperado 2, achado %', n; end if;
  select count(*) into n from stock_movements; if n <> 139 then raise exception 'depois: movimentos esperado 139, achado %', n; end if;
  select count(*) into n from nfe_avulsas; if n <> 0 then raise exception 'depois: nfe_avulsas esperado 0, achado %', n; end if;
  select count(*) into n from contatos; if n <> 9 then raise exception 'depois: contatos esperado 9, achado %', n; end if;
  select count(*) into n from products; if n <> 175 then raise exception 'depois: produtos esperado 175, achado %', n; end if;
  select coalesce(sum(stock_quantity), 0) into v from products where sku not like 'RB-%'; if v <> 1727 then raise exception 'depois: estoque Bling esperado 1727, achado %', v; end if;
  select coalesce(sum(stock_quantity), 0) into v from products where sku like 'RB-%'; if v <> 0 then raise exception 'depois: estoque RB esperado 0, achado %', v; end if;
  select count(*) into n from base_instalada; if n <> 2 then raise exception 'depois: base instalada esperado 2, achado %', n; end if;
  select count(*) into n from service_orders; if n <> 1 then raise exception 'depois: OS esperado 1, achado %', n; end if;
  select count(*) into n from import_operations; if n <> 1 then raise exception 'depois: importação esperado 1, achado %', n; end if;
  select count(*) into n from patrimonio; if n <> 93 then raise exception 'depois: patrimônio esperado 93, achado %', n; end if;
  select count(*) into n from product_pricing; if n <> 555 then raise exception 'depois: preços esperado 555, achado %', n; end if;
  select count(*) into n from extrato_saldos; if n <> 6 then raise exception 'depois: saldos esperado 6, achado %', n; end if;
end $$;

-- DESPESA FIXA: base provisória de setembro/2026 até existir o 1º mês fechado depois do corte.
-- Mês fechado = já passou, é de 10/2026 em diante e tem o extrato do banco carregado (sem o extrato, as fixas do mês
-- estão incompletas e a base sairia baixa). Antes da limpeza a função devolvia set/2026: fixas 15.650,27 ÷ faturamento
-- 144.391,66 = 0,108388 (definição anterior guardada em /root/backups-erp/limpeza-corte-20261006/).
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
  -- DATA DE CORTE (06/10/2026, "PODE LIMPAR"): o ERP guarda só o que aconteceu de 01/10/2026 em diante.
  corte text := '2026-10';
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
  -- mês com o extrato do banco carregado: sem ele, as despesas fixas do mês estão incompletas
  banco as (
    select distinct to_char(m.data at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes
      from public.extrato_movimentos m where m.fonte = 'banco'
  ),
  -- meses = os 3 últimos meses FECHADOS (já passaram, da data de corte em diante, com o extrato do banco carregado)
  -- e com despesa fixa lançada (mês só com extrato do PayPal não conta: diluiria a média)
  meses as (
    select f.mes from fix f join banco b on b.mes = f.mes
     where f.v > 0 and f.mes < mes_atual and f.mes >= corte
     order by f.mes desc limit 3
  ),
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
  select case
           -- BASE PROVISÓRIA (06/10/2026): setembro/2026, cujos dados saíram do ERP na limpeza
           when tot.n = 0 and ver_valores then json_build_object(
             'meses', json_build_array(json_build_object('mes', '2026-09', 'fixas', 15650.27, 'faturamento', 144391.66)),
             'meses_usados', 1, 'media_fixas', 15650.27, 'media_faturamento', 144391.66, 'pct', 0.108388, 'provisoria', true)
           when tot.n = 0 then json_build_object('meses_usados', 1, 'pct', 0.108388, 'provisoria', true)
           when ver_valores then json_build_object(
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
end $function$;

do $$
declare j json;
begin
  j := public.base_despesas_fixas();
  if (j ->> 'pct')::numeric <> 0.108388 or coalesce((j ->> 'provisoria')::boolean, false) is not true then
    raise exception 'depois: base de despesa fixa inesperada: %', j;
  end if;
end $$;

commit;
