-- 06/10/2026 — DESPESA FIXA marcada em cada despesa (pedido dele: "toda despesa criada tem que ter um seletor se é ou
-- não despesa fixa, e o sistema calcula isso em toda parte do ERP"). Substitui a lista "Despesas Fixas Mensais" e o
-- "Índice de Custo Fixo" digitado da Configuração Tributária (que saem da tela no mesmo deploy).
--
-- Regra: a CATEGORIA define o padrão (financial_categories.fixa_padrao), como já é com o "Na DRE"; todo lançamento a
-- pagar nasce com esse padrão — inclusive os que o sistema cria sozinho do extrato do Itaú, da fatura do cartão e do
-- PayPal — e pode ser mudado caso a caso (financial_entries.fixa + fixa_manual). Trocar o padrão da categoria reclassifica
-- os lançamentos dela que não foram mudados à mão.
--
-- Um número só: base_despesas_fixas() → média mensal das despesas fixas pagas (mesma regra de mês da DRE Realizada) e o
-- percentual que elas representam no faturamento das notas de saída autorizadas, nos últimos 3 meses fechados com fixas.

alter table public.financial_categories add column if not exists fixa_padrao boolean not null default false;
alter table public.financial_entries   add column if not exists fixa boolean;
alter table public.financial_entries   add column if not exists fixa_manual boolean not null default false;

-- padrão aprovado por ele em 06/10 (Anúncios, frete, compras, taxas e hospedagem anual ficam variáveis)
update public.financial_categories set fixa_padrao = true
 where slug in ('rent','salary','encargos_da_folha','fgts','contabilidade','faxina','energia_eletrica','agua',
                'telefone_e_internet','locaweb_lwsa','assinatura_de_software');

create or replace function public.fin_fixa_padrao() returns trigger
language plpgsql set search_path = public as $$
begin
  if NEW.type is distinct from 'payable' then
    NEW.fixa := false; NEW.fixa_manual := false; return NEW;
  end if;
  if TG_OP = 'INSERT' then
    if NEW.fixa is null or not coalesce(NEW.fixa_manual, false) then
      NEW.fixa := coalesce((select c.fixa_padrao from public.financial_categories c where c.slug = NEW.category), false);
      NEW.fixa_manual := false;
    end if;
  elsif NEW.category is distinct from OLD.category and not coalesce(NEW.fixa_manual, false) then
    NEW.fixa := coalesce((select c.fixa_padrao from public.financial_categories c where c.slug = NEW.category), false);
  end if;
  if NEW.fixa is null then NEW.fixa := false; end if;
  return NEW;
end $$;

drop trigger if exists trg_fin_fixa on public.financial_entries;
create trigger trg_fin_fixa before insert or update on public.financial_entries
  for each row execute function public.fin_fixa_padrao();

-- trocar o padrão da categoria reclassifica os lançamentos dela que seguem o padrão (os mudados à mão ficam como estão)
create or replace function public.fin_cat_fixa_propaga() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.fixa_padrao is distinct from OLD.fixa_padrao then
    update public.financial_entries set fixa = NEW.fixa_padrao
     where category = NEW.slug and type = 'payable' and not coalesce(fixa_manual, false);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_cat_fixa_propaga on public.financial_categories;
create trigger trg_cat_fixa_propaga after update of fixa_padrao on public.financial_categories
  for each row execute function public.fin_cat_fixa_propaga();

-- lançamentos que já existem: recebem o padrão da categoria
update public.financial_entries e set fixa = coalesce(c.fixa_padrao, false), fixa_manual = false
  from public.financial_categories c
 where c.slug = e.category and e.type = 'payable';
update public.financial_entries set fixa = false where fixa is null;

-- Base única para toda a análise. Mês da despesa = mesma regra da DRE Realizada: fatura do cartão conta no mês anterior
-- ao vencimento; o resto, pago, pelo mês do pagamento. Só despesas que entram na DRE. Faturamento = notas de saída
-- autorizadas (as duas empresas). Meses = os 3 últimos meses FECHADOS com despesa fixa lançada.
-- Quem não tem acesso ao Financeiro recebe só o percentual (Precificação e Estoque & Caixa precisam dele).
create or replace function public.base_despesas_fixas() returns json
language plpgsql stable security definer set search_path = public as $$
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
end $$;

revoke all on function public.base_despesas_fixas() from public, anon;
grant execute on function public.base_despesas_fixas() to authenticated;

comment on column public.config_tributaria.despesas_fixas is 'LEGADO (06/10/2026): substituído pela marcação "Despesa fixa" no Financeiro e por base_despesas_fixas(); não é mais lido pelo ERP.';
comment on column public.config_tributaria.indice_custo_fixo is 'LEGADO (06/10/2026): substituído por base_despesas_fixas().pct (percentual sobre o faturamento); não é mais lido pelo ERP.';
