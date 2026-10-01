-- 01/10/2026 pedido de compra: data do pedido e frete/outras despesas (conta a pagar + custo)
alter table public.purchase_orders add column if not exists order_date text, add column if not exists frete_outras_brl numeric;
