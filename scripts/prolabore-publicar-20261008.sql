-- 08/10/2026 — "PUBLICAR DRE" (aprovado pelo dono): PARTE B de scripts/prolabore-participacoes.sql (a Parte A já estava aplicada).
-- Backup antes: /root/backups-erp/dre-publicar-20261008/ (financial_entries, financial_categories, extrato_categoria_fin,
--               dre_distribuicao_config, prolabore_abatimentos).
-- Rollback da tela: docker service update --image robooster-erp:manual-20261007 robooster_erp_erp
-- Desfazer estes dados: bloco "DESFAZER a parte B" no fim de scripts/prolabore-participacoes.sql
--   (+ update dre_distribuicao_config set acumulado_desde = null where id = 'socio').
begin;
  -- "Retirada de sócio" passa a se chamar "Distribuição de lucros" (mesmo slug; abaixo da linha, informativa como já era).
  -- A classificação da Conciliação ("Retirada de sócio", chave do extrato) não muda.
  update public.financial_categories set nome = 'Distribuição de lucros', updated_date = now() where slug = 'retirada_de_socio';
  update public.extrato_categoria_fin set nome = 'Distribuição de lucros' where slug = 'retirada_de_socio';
  -- Pró-labore R$ 2.000: setembro é abatido da retirada de 22/09 (R$ 5.000 → 3.000) ⇒ set = 2.000 + 6.738,20 = 8.738,20
  select public.prolabore_mensal('2026-09-01');
  select public.prolabore_mensal('2026-10-01');
  -- Retirada planejada R$ 48.000/mês; lucro acumulado a partir de set/2026 (1º mês completo — jan–ago sem receita na DRE)
  update public.dre_distribuicao_config set retirada_mensal = 48000, acumulado_desde = '2026-09-01', ativo = true, updated_date = now()
   where id = 'socio';
  -- conferência
  select category, count(*), sum(amount) from public.financial_entries
   where category in ('retirada_de_socio', 'pro_labore') group by 1 order by 1;
  select * from public.prolabore_abatimentos;
  select public.base_despesas_fixas();
commit;
