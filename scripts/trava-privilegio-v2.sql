-- Trava anti-escalada v2 (2026-07-27)
--
-- BUG CORRIGIDO: a v1 barrava TODO contexto em que auth.uid() é NULL —
-- inclusive a Edge Function criar-acesso rodando com a service_role.
-- Resultado: o login era criado no Auth, mas o UPDATE de contatos.user_id
-- era rejeitado pela trava (e a função ignorava o erro) ⇒ contato sem
-- vínculo ⇒ meus_tipos() vazio ⇒ usuário entrava no ERP e não via nada.
-- Foi o que aconteceu com a Roberta e com o Mauricio em 16/07.
--
-- A trava existe para impedir que um usuário AUTENTICADO sem master eleve
-- os próprios privilégios via PostgREST. Conexões sem JWT (auth.uid() nulo)
-- são o postgres/service_role — que só existem no servidor e já podem tudo
-- por definição; barrá-las não adiciona segurança, só quebra as funções
-- administrativas.

create or replace function public.contatos_trava_privilegio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Contexto de servidor (service_role / postgres): sem JWT não há escalada
  -- de usuário possível — o chamador já é todo-poderoso.
  if auth.uid() is null then
    return new;
  end if;

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
end;
$$;
