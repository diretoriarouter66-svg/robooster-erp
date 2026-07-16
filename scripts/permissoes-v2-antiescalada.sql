-- =====================================================================
-- Permissões v2 — trava anti-escalada (2026-07-15)
--
-- BURACO ENCONTRADO NO TESTE: quem pode editar contatos (Colaborador) podia
-- abrir o próprio cadastro, trocar `tipos` para ["Diretor"] e ganhar acesso ao
-- financeiro. Confirmado: UPDATE 1 -> financeiro passou a devolver 16 linhas.
--
-- Causa: os `tipos` que concedem permissão moram na MESMA tabela que os
-- usuários precisam editar para trabalhar (cadastrar clientes/fornecedores).
--
-- Correção: um trigger que só deixa MASTER mexer nos campos que dão poder
-- (`tipos` e `user_id`). Os outros campos (nome, e-mail, endereço...) seguem
-- editáveis por quem tem permissão no módulo 'contatos'.
-- =====================================================================

create or replace function public.contatos_trava_privilegio()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  -- master faz o que quiser
  if public.sou_master() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.tipos is distinct from old.tipos then
      raise exception 'Só o acesso master pode alterar os tipos de um contato'
        using errcode = '42501';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'Só o acesso master pode vincular ou desvincular um login'
        using errcode = '42501';
    end if;
  elsif tg_op = 'INSERT' then
    -- ninguém cria contato já com login vinculado, nem com tipo que dá poder
    if new.user_id is not null then
      raise exception 'Só o acesso master pode vincular um login a um contato'
        using errcode = '42501';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(coalesce(new.tipos, '[]'::jsonb)) t(v)
      where t.v in ('Diretor', 'Contador', 'Técnico', 'Colaborador')
    ) then
      raise exception 'Só o acesso master pode criar contatos dos tipos que acessam o ERP'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists contatos_trava_privilegio_trg on public.contatos;
create trigger contatos_trava_privilegio_trg
  before insert or update on public.contatos
  for each row execute function public.contatos_trava_privilegio();

-- Mesma lógica para a matriz de permissões: ela já é somente-leitura para
-- `authenticated` (não há policy de escrita), mas deixamos explícito.
revoke insert, update, delete on public.permissoes from authenticated;
