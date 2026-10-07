-- DEVOLVE OS PREÇOS DO ERP (product_pricing) COMO ERAM ANTES DE 06/10/2026 12h33 — pedido do Mauricio em 07/10:
-- "o valor do que sobra no caixa independente do canal de venda deveria ser o mesmo e estava correto".
-- Em 06/10 eu troquei 395 preços pelos do Precificador/loja e apaguei 145 (item 3 da limpeza dos dados de teste); os preços
-- do ERP são formados a partir do canal Master, e só com eles o caixa sai igual em todo canal. Fonte: COPY de product_pricing
-- em /root/backups-erp/antes-limpeza-teste-20261006.sql, carregado em restauro_precos.product_pricing.
-- Cópia dos preços de hoje antes de restaurar: /root/backups-erp/precos-antes-de-restaurar-20261007.sql
begin;
do $$
declare n int;
begin
  select count(*) into n from restauro_precos.product_pricing r join public.product_pricing p using (id) where row(r.*)::text <> row(p.*)::text;
  if n <> 395 then raise exception 'antes: preços diferentes esperado 395, achado %', n; end if;
  select count(*) into n from restauro_precos.product_pricing r where not exists (select 1 from public.product_pricing p where p.id = r.id);
  if n <> 145 then raise exception 'antes: preços apagados esperado 145, achado %', n; end if;
  select count(*) into n from public.product_pricing p where not exists (select 1 from restauro_precos.product_pricing r where r.id = p.id);
  if n <> 0 then raise exception 'antes: há % preço(s) criados depois da cópia — rever', n; end if;
end $$;
update public.product_pricing p
   set channel_id = r.channel_id, notes = r.notes, price = r.price, price_promotional = r.price_promotional,
       product_id = r.product_id, created_date = r.created_date, updated_date = r.updated_date, created_by = r.created_by
  from restauro_precos.product_pricing r
 where p.id = r.id and row(r.*)::text <> row(p.*)::text;
insert into public.product_pricing select r.* from restauro_precos.product_pricing r
 where not exists (select 1 from public.product_pricing p where p.id = r.id);
do $$
declare n int;
begin
  select count(*) into n from public.product_pricing; if n <> 700 then raise exception 'depois: preços esperado 700, achado %', n; end if;
  select count(*) into n from restauro_precos.product_pricing r join public.product_pricing p using (id) where row(r.*)::text = row(p.*)::text;
  if n <> 700 then raise exception 'depois: preços iguais à cópia esperado 700, achado %', n; end if;
end $$;
commit;
