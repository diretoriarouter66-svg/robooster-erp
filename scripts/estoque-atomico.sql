-- Saldo de estoque atômico (2026-07-23)
--
-- Antes, o saldo era read-modify-write no NAVEGADOR: a tela lia o produto,
-- calculava o saldo novo, inseria o movimento e depois atualizava o produto.
-- Dois usuários simultâneos podiam ler o mesmo saldo e gravar por cima.
--
-- Agora o banco é a autoridade: um trigger BEFORE INSERT em stock_movements
-- tranca a linha do produto (FOR UPDATE), calcula saldo_anterior/saldo_novo,
-- rejeita saldo negativo e atualiza products.stock_quantity — tudo na mesma
-- transação do INSERT. O que o frontend mandar nesses campos é sobrescrito.
--
-- SECURITY DEFINER: quem pode movimentar estoque (RLS do INSERT em
-- stock_movements) não precisa de permissão de edição em products — a
-- atualização do saldo é consequência do movimento, e roda como owner.

create or replace function public.trg_movimento_estoque()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo numeric;
begin
  select stock_quantity into v_saldo
    from public.products
   where id = new.product_id
     for update;

  if not found then
    raise exception 'Produto % não encontrado para movimentar estoque', new.product_id;
  end if;

  v_saldo := coalesce(v_saldo, 0);
  new.quantidade := coalesce(new.quantidade, 0);
  new.saldo_anterior := v_saldo;
  new.saldo_novo := v_saldo + new.quantidade;

  if new.saldo_novo < 0 then
    raise exception 'Estoque insuficiente: saldo atual %, movimento %', v_saldo, new.quantidade;
  end if;

  -- Espelhos do schema original (inglês), mantidos por compatibilidade
  new.previous_stock := new.saldo_anterior;
  new.new_stock := new.saldo_novo;

  update public.products
     set stock_quantity = new.saldo_novo,
         updated_date = now()
   where id = new.product_id;

  return new;
end;
$$;

drop trigger if exists movimento_estoque_atomico on public.stock_movements;
create trigger movimento_estoque_atomico
  before insert on public.stock_movements
  for each row
  execute function public.trg_movimento_estoque();
