-- 01/10/2026 fechamento com valores reais (DI + despesas + acerto), gravado em jsonb na operação
alter table public.import_operations add column if not exists fechamento jsonb;
