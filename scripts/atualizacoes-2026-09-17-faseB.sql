-- 17/09/2026 — Fase B do lote 3 da Larissa: cadastro de CFOP/natureza com texto padrão; campos de nota (seguro, outras despesas, desconto)
begin;
create table if not exists cfops (
  id text primary key,
  codigo text not null,                 -- ex.: 3102
  descricao text,                       -- ex.: Compra para comercialização (importação)
  natureza text,                        -- natureza da operação que sai na NF
  tipo text default 'saida',            -- entrada | saida
  csosn text default '900',
  finalidade integer default 1,         -- 1 normal, 2 complementar, 3 ajuste, 4 devolução
  info_padrao text,                     -- texto padrão das informações adicionais
  ativo boolean default true,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text
);
alter table cfops enable row level security;
drop policy if exists cfops_ver on cfops; create policy cfops_ver on cfops for select to authenticated using (pode('custos','ver'));
drop policy if exists cfops_ins on cfops; create policy cfops_ins on cfops for insert to authenticated with check (pode('custos','editar'));
drop policy if exists cfops_upd on cfops; create policy cfops_upd on cfops for update to authenticated using (pode('custos','editar'));
drop policy if exists cfops_del on cfops; create policy cfops_del on cfops for delete to authenticated using (pode('custos','editar'));
grant select, insert, update, delete on cfops to authenticated;
insert into cfops (id, codigo, descricao, natureza, tipo, csosn, finalidade, info_padrao) values
 (md5('3102'), '3102', 'Compra para comercialização (importação)', 'Compra para comercializacao - importacao', 'entrada', '900', 1, 'DI nº {di} · Data de registro da DI: {data_di}' || chr(10) || '{volumes}' || chr(10) || 'Despesas aduaneiras rateadas nos itens.'),
 (md5('3101'), '3101', 'Compra para industrialização (importação)', 'Compra para industrializacao - importacao', 'entrada', '900', 1, 'DI nº {di} · Data de registro da DI: {data_di}'),
 (md5('1202'), '1202', 'Devolução de venda (dentro do estado)', 'Devolucao de venda', 'entrada', '102', 4, 'Devolução de mercadoria referente à NF-e {ref}.'),
 (md5('2202'), '2202', 'Devolução de venda (outro estado)', 'Devolucao de venda', 'entrada', '102', 4, 'Devolução de mercadoria referente à NF-e {ref}.'),
 (md5('5202'), '5202', 'Devolução de compra (dentro do estado)', 'Devolucao de compra', 'saida', '102', 4, 'Devolução de compra referente à NF-e {ref}.'),
 (md5('6202'), '6202', 'Devolução de compra (outro estado)', 'Devolucao de compra', 'saida', '102', 4, 'Devolução de compra referente à NF-e {ref}.'),
 (md5('1915'), '1915', 'Entrada para conserto (dentro do estado)', 'Entrada de mercadoria para conserto ou reparo', 'entrada', '900', 1, 'Mercadoria recebida para conserto/reparo. Retorno ao remetente após o serviço.'),
 (md5('2915'), '2915', 'Entrada para conserto (outro estado)', 'Entrada de mercadoria para conserto ou reparo', 'entrada', '900', 1, 'Mercadoria recebida para conserto/reparo. Retorno ao remetente após o serviço.'),
 (md5('5916'), '5916', 'Retorno de conserto (dentro do estado)', 'Retorno de mercadoria recebida para conserto ou reparo', 'saida', '900', 1, 'Retorno de mercadoria recebida para conserto, referente à NF-e {ref}. Serviço cobrado à parte.'),
 (md5('6916'), '6916', 'Retorno de conserto (outro estado)', 'Retorno de mercadoria recebida para conserto ou reparo', 'saida', '900', 1, 'Retorno de mercadoria recebida para conserto, referente à NF-e {ref}. Serviço cobrado à parte.'),
 (md5('5915'), '5915', 'Remessa para conserto (dentro do estado)', 'Remessa de mercadoria para conserto ou reparo', 'saida', '900', 1, 'Remessa de mercadoria para conserto/reparo. Retorno previsto após o serviço.'),
 (md5('6915'), '6915', 'Remessa para conserto (outro estado)', 'Remessa de mercadoria para conserto ou reparo', 'saida', '900', 1, 'Remessa de mercadoria para conserto/reparo. Retorno previsto após o serviço.'),
 (md5('5102'), '5102', 'Venda de mercadoria (dentro do estado)', 'Venda de mercadoria', 'saida', '102', 1, 'Documento emitido por ME/EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI. Valor aproximado dos tributos: {tributos}.'),
 (md5('6102'), '6102', 'Venda de mercadoria (outro estado)', 'Venda de mercadoria', 'saida', '102', 1, 'Documento emitido por ME/EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI. Valor aproximado dos tributos: {tributos}.'),
 (md5('5949'), '5949', 'Outra saída não especificada', 'Outra saida', 'saida', '900', 1, ''),
 (md5('1949'), '1949', 'Outra entrada não especificada', 'Outra entrada', 'entrada', '900', 1, '')
on conflict (id) do nothing;
alter table nfe_avulsas add column if not exists seguro numeric default 0;
alter table nfe_avulsas add column if not exists outras_despesas numeric default 0;
alter table nfe_avulsas add column if not exists desconto numeric default 0;
alter table nfe_avulsas add column if not exists cfop_id text;
commit;
notify pgrst, 'reload schema';
