-- 02/10/2026 — migração do catálogo do Bling (Router66 + Saber) para o ERP, um CNPJ só.
-- Guarda, por produto, o código e o id que ele tinha em cada conta do Bling
-- ({"router":{"sku":"2247","bling_id":123},"saber":{"sku":"2047","bling_id":456},"icms_origem":1}).
-- Serve para: (1) o espelho diário de estoque até a virada de jan/2027; (2) casar pedido do Mercado Livre de cada conta.
alter table public.products add column if not exists codigos_origem jsonb;
notify pgrst, 'reload schema';
