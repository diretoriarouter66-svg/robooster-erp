// Adaptador Base44 -> Supabase.
//
// Reimplementa a MESMA interface do SDK do Base44 usada pelas telas
// (base44.entities.<X>.{list,filter,create,update,delete,bulkUpdate,get},
//  base44.auth.*, base44.integrations.Core.UploadFile) sobre supabase-js.
// Objetivo: alterar o mínimo possível do código das telas.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const UPLOAD_BUCKET = import.meta.env.VITE_SUPABASE_BUCKET || 'uploads';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// ---- Mapa entidade (Base44) -> tabela (Postgres) --------------------------
const TABLE = {
  Product: 'products',
  Categoria: 'categorias',
  Contato: 'contatos',
  TipoContato: 'tipos_contato',
  SalesChannel: 'sales_channels',
  ProductPricing: 'product_pricing',
  ConfigTributaria: 'config_tributaria',
  Socio: 'socios',
  ImportOperation: 'import_operations',
  StockMovement: 'stock_movements',
  SaleOrder: 'sale_orders',
  BaseInstalada: 'base_instalada',
  CrmConversa: 'crm_conversas',
  VisitorIdentidade: 'visitor_identidade',
  SiteEvento: 'site_eventos',
  FinancialEntry: 'financial_entries',
  FinancialCategory: 'financial_categories',
  CashAccount: 'cash_accounts',
  DRESalvo: 'dre_salvos',
  PurchaseOrder: 'purchase_orders',
  ServiceOrder: 'service_orders',
  // 16/09/2026 — devoluções de venda, transportadoras e histórico de custo (pedidos da Larissa)
  SaleReturn: 'sale_returns',
  Transportadora: 'transportadoras',
  ProductCostHistory: 'product_cost_history',
  NfeAvulsa: 'nfe_avulsas',
  CompetitorAnalysis: 'competitor_analysis',
  Patrimonio: 'patrimonio',
  ValuationConfig: 'valuation_config',
  // Cofre de acessos (migrado do app "Controle de Acessos" do Base44).
  // A visibilidade master/colaborador é garantida por RLS no Postgres — a tela
  // apenas reflete o que o banco devolve.
  Credential: 'credenciais',
  CofreMembro: 'cofre_membros',
  CofreEmpresa: 'cofre_empresas',
};

// ---- Utilitários ----------------------------------------------------------

// Gera um id no estilo do Base44 (24 caracteres hexadecimais).
function genId() {
  const bytes = new Uint8Array(12);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function nowIso() {
  return new Date().toISOString();
}

// E-mail do usuário logado (para created_by), lido da sessão local (sem rede).
let _cachedEmail = null;
supabase.auth.getSession().then(({ data }) => {
  _cachedEmail = data?.session?.user?.email || null;
});
supabase.auth.onAuthStateChange((_e, session) => {
  _cachedEmail = session?.user?.email || null;
});

// Aplica ordenação no formato Base44 ("campo" asc, "-campo" desc).
function applyOrder(query, order) {
  if (!order) return query;
  const desc = order.startsWith('-');
  const column = desc ? order.slice(1) : order;
  return query.order(column, { ascending: !desc, nullsFirst: false });
}

function unwrap({ data, error }) {
  if (error) {
    const err = new Error(error.message || 'Erro na consulta ao Supabase');
    err.status = error.code;
    err.details = error;
    throw err;
  }
  return data;
}

// ---- Fábrica de "entidade" -------------------------------------------------
function makeEntity(entityName) {
  const table = TABLE[entityName];
  if (!table) throw new Error(`Entidade desconhecida: ${entityName}`);

  return {
    // list(order = "-created_date", limit)
    async list(order = '-created_date', limit) {
      let q = supabase.from(table).select('*');
      q = applyOrder(q, order);
      if (limit) q = q.limit(limit);
      return unwrap(await q);
    },

    // filter(criteria, order, limit) — critérios de igualdade
    async filter(criteria = {}, order = '-created_date', limit) {
      let q = supabase.from(table).select('*');
      for (const [k, v] of Object.entries(criteria)) {
        q = v === null ? q.is(k, null) : q.eq(k, v);
      }
      q = applyOrder(q, order);
      if (limit) q = q.limit(limit);
      return unwrap(await q);
    },

    async get(id) {
      const data = unwrap(
        await supabase.from(table).select('*').eq('id', id).single()
      );
      return data;
    },

    async create(payload) {
      const row = {
        id: payload.id || genId(),
        ...payload,
        created_date: payload.created_date || nowIso(),
        updated_date: nowIso(),
        created_by: payload.created_by || _cachedEmail,
      };
      const data = unwrap(
        await supabase.from(table).insert(row).select().single()
      );
      return data;
    },

    async update(id, patch) {
      const row = { ...patch, updated_date: nowIso() };
      delete row.id; // nunca troca a chave
      const data = unwrap(
        await supabase.from(table).update(row).eq('id', id).select().single()
      );
      return data;
    },

    async delete(id) {
      unwrap(await supabase.from(table).delete().eq('id', id));
      return { id };
    },

    // bulkUpdate([{ id, ...campos }]) — atualiza vários registros
    async bulkUpdate(items = []) {
      const results = [];
      for (const item of items) {
        const { id, ...patch } = item;
        results.push(await this.update(id, patch));
      }
      return results;
    },
  };
}

const entities = new Proxy(
  {},
  {
    get(cache, name) {
      if (typeof name !== 'string') return undefined;
      if (!cache[name]) cache[name] = makeEntity(name);
      return cache[name];
    },
  }
);

// ---- Auth (Supabase Auth — e-mail/senha) ----------------------------------
function mapUser(u) {
  if (!u) return null;
  const meta = u.user_metadata || {};
  return {
    id: u.id,
    email: u.email,
    full_name: meta.full_name || meta.name || u.email,
    role: meta.role || 'admin',
    ...meta,
  };
}

const auth = {
  async me() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      const err = new Error('Não autenticado');
      err.status = 401;
      throw err;
    }
    return mapUser(data.user);
  },

  async loginViaEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha inválidos'
          : error.message
      );
    }
    return { access_token: data.session?.access_token, user: mapUser(data.user) };
  },

  async logout(redirectUrl) {
    await supabase.auth.signOut();
    if (typeof redirectUrl === 'string' && typeof window !== 'undefined') {
      window.location.href = redirectUrl.startsWith('http') ? redirectUrl : (redirectUrl || '/login');
    }
  },

  redirectToLogin(_fromUrl) {
    if (typeof window !== 'undefined') window.location.href = '/login';
  },

  setToken() {
    // Sessão gerenciada pelo supabase-js; no-op.
  },

  // Recuperação de senha (opcional, via Supabase Auth)
  async resetPasswordRequest(email) {
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  async resetPassword({ newPassword }) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  // Cadastro aberto e login social desativados por decisão do projeto.
  async register() {
    throw new Error('Cadastro fechado. Solicite acesso ao administrador.');
  },
  async verifyOtp() {
    throw new Error('Cadastro fechado.');
  },
  async resendOtp() {
    throw new Error('Cadastro fechado.');
  },
  loginWithProvider() {
    throw new Error('Login social desativado. Use e-mail e senha.');
  },
};

// ---- Integrações (upload de arquivo via Supabase Storage) -----------------
const integrations = {
  Core: {
    async UploadFile({ file }) {
      const ext = (file?.name?.split('.').pop() || 'bin').toLowerCase();
      const path = `${genId()}.${ext}`;
      const { error } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(path);
      return { file_url: data.publicUrl };
    },
  },
};

export const base44 = { entities, auth, integrations };
export default base44;
