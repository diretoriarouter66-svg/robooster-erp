import { useEffect, useState } from "react";
import { supabase } from "@/api/base44Client";

// Cache de módulo: a permissão é carregada UMA vez por sessão de página e
// compartilhada entre Sidebar, guarda de rota e telas. A segurança de verdade
// é o RLS no Postgres — aqui é só para a interface não oferecer o que o banco
// vai negar. Por isso, em caso de FALHA na consulta, liberamos a interface
// ("todos"): esconder tudo já trancou o master fora do ERP uma vez.
let cache = null;
let promessa = null;
const ouvintes = new Set();

async function carregar() {
  if (cache) return cache;
  if (!promessa) {
    promessa = (async () => {
      try {
        const [{ data: perm, error: errPerm }, { data: membro }] = await Promise.all([
          supabase.rpc("meus_modulos"),
          supabase.from("cofre_membros").select("nivel"),
        ]);
        if (errPerm) {
          cache = { todos: true, mods: new Set(), master: false };
        } else {
          const mods = new Set((perm || []).map((r) => r.modulo));
          if ((membro || []).length > 0) mods.add("cofre");
          cache = {
            todos: false,
            mods,
            master: (membro || []).some((m) => m.nivel === "master"),
          };
        }
      } catch {
        cache = { todos: true, mods: new Set(), master: false };
      }
      ouvintes.forEach((fn) => fn(cache));
      return cache;
    })();
  }
  return promessa;
}

export function usePermissoes() {
  const [p, setP] = useState(cache);
  useEffect(() => {
    if (cache) { setP(cache); return; }
    ouvintes.add(setP);
    carregar();
    return () => ouvintes.delete(setP);
  }, []);

  // pode(modulo): enquanto carrega devolve false (esconde por padrão — as
  // telas usam isto para custo/lucro, que não pode piscar para quem não vê).
  const pode = (mod) => {
    if (!mod) return true;
    if (!p) return false;
    return p.todos || p.mods.has(mod);
  };
  return { carregando: !p, pode, master: p?.master || false, falhaAberta: p?.todos || false };
}
