CREATE TABLE public.cofre_empresas (
    id text NOT NULL,
    nome text NOT NULL,
    ativa boolean DEFAULT true,
    created_date timestamp with time zone DEFAULT now(),
    updated_date timestamp with time zone,
    created_by text
);
ALTER TABLE public.cofre_empresas OWNER TO postgres;
CREATE TABLE public.competitor_analysis (
    id text NOT NULL,
    product_id text NOT NULL,
    company_name text NOT NULL,
    competitor_price numeric,
    city text,
    state text,
    whatsapp text,
    website text,
    product_type text DEFAULT 'identico'::text,
    similar_model_description text,
    ads_platforms jsonb DEFAULT '[]'::jsonb,
    ad_level text,
    observations text,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone,
    created_by text
);
ALTER TABLE public.competitor_analysis OWNER TO postgres;
CREATE TABLE public.ml_config (
    id text NOT NULL,
    app_id text,
    app_secret text,
    redirect_uri text,
    ativo boolean DEFAULT true,
    created_date timestamp with time zone DEFAULT now()
);
ALTER TABLE public.ml_config OWNER TO postgres;
CREATE TABLE public.ml_token (
    id text NOT NULL,
    user_id text,
    access_token text,
    refresh_token text,
    expires_at numeric,
    pkce_verifier text,
    ml_user_id text,
    ml_nickname text,
    created_date timestamp with time zone DEFAULT now(),
    updated_date timestamp with time zone,
    created_by text
);
ALTER TABLE public.ml_token OWNER TO postgres;
CREATE TABLE public.nfe_avulsas (
    id text NOT NULL,
    data date,
    tipo text DEFAULT 'saida'::text NOT NULL,
    preset text,
    natureza_operacao text,
    finalidade integer DEFAULT 1,
    cfop text,
    csosn text DEFAULT '900'::text,
    contato_id text,
    exterior jsonb,
    chave_referenciada text,
    items jsonb DEFAULT '[]'::jsonb,
    di jsonb,
    frete numeric DEFAULT 0,
    informacoes_adicionais text,
    nfe_ref text,
    nfe_ambiente text,
    nfe_status text,
    nfe_chave text,
    nfe_numero text,
    nfe_serie text,
    nfe_mensagem text,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone,
    created_by text
);
ALTER TABLE public.nfe_avulsas OWNER TO postgres;
CREATE TABLE public.patrimonio (
    id text NOT NULL,
    nome text NOT NULL,
    categoria text,
    quantidade integer DEFAULT 1,
    valor_aquisicao numeric DEFAULT 0,
    data_aquisicao date,
    taxa_depreciacao_aa numeric,
    valor_mercado numeric,
    localizacao text,
    numero_serie text,
    observacoes text,
    ativo boolean DEFAULT true,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone,
    created_by text
);
ALTER TABLE public.patrimonio OWNER TO postgres;
CREATE TABLE public.service_orders (
    id text NOT NULL,
    numero integer,
    contato_id text,
    cliente_nome text,
    tecnico text,
    data date,
    status text DEFAULT 'aberta'::text,
    equipamento text,
    descricao text,
    horas numeric,
    valor_hora numeric,
    despesas jsonb DEFAULT '[]'::jsonb,
    desconto_brl numeric DEFAULT 0,
    vencimento date,
    observacoes text,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone,
    created_by text
);
ALTER TABLE public.service_orders OWNER TO postgres;
CREATE TABLE public.valuation_config (
    id text NOT NULL,
    caixa_bancos numeric DEFAULT 0,
    ajuste_china numeric DEFAULT 0,
    lucro_mensal numeric,
    multiplo numeric DEFAULT 3,
    updated_date timestamp with time zone,
    created_date timestamp with time zone DEFAULT now(),
    created_by text
);
ALTER TABLE public.valuation_config OWNER TO postgres;
ALTER TABLE ONLY public.cofre_empresas
    ADD CONSTRAINT cofre_empresas_nome_key UNIQUE (nome);
ALTER TABLE ONLY public.cofre_empresas
    ADD CONSTRAINT cofre_empresas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.competitor_analysis
    ADD CONSTRAINT competitor_analysis_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ml_config
    ADD CONSTRAINT ml_config_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ml_token
    ADD CONSTRAINT ml_token_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.nfe_avulsas
    ADD CONSTRAINT nfe_avulsas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.patrimonio
    ADD CONSTRAINT patrimonio_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT service_orders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.valuation_config
    ADD CONSTRAINT valuation_config_pkey PRIMARY KEY (id);
CREATE INDEX competitor_analysis_prod_idx ON public.competitor_analysis USING btree (product_id);
CREATE POLICY ce_del ON public.cofre_empresas FOR DELETE TO authenticated USING (public.eh_master());
CREATE POLICY ce_ins ON public.cofre_empresas FOR INSERT TO authenticated WITH CHECK (public.eh_master());
CREATE POLICY ce_upd ON public.cofre_empresas FOR UPDATE TO authenticated USING (public.eh_master());
CREATE POLICY ce_ver ON public.cofre_empresas FOR SELECT TO authenticated USING ((public.eh_master() OR public.eh_membro_cofre()));
ALTER TABLE public.cofre_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY competitor_del ON public.competitor_analysis FOR DELETE TO authenticated USING (public.pode('custos'::text, 'editar'::text));
CREATE POLICY competitor_ins ON public.competitor_analysis FOR INSERT TO authenticated WITH CHECK (public.pode('custos'::text, 'editar'::text));
CREATE POLICY competitor_upd ON public.competitor_analysis FOR UPDATE TO authenticated USING (public.pode('custos'::text, 'editar'::text));
CREATE POLICY competitor_ver ON public.competitor_analysis FOR SELECT TO authenticated USING (public.pode('custos'::text, 'ver'::text));
ALTER TABLE public.ml_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfe_avulsas ENABLE ROW LEVEL SECURITY;
CREATE POLICY nfe_avulsas_del ON public.nfe_avulsas FOR DELETE TO authenticated USING (public.pode('custos'::text, 'editar'::text));
CREATE POLICY nfe_avulsas_ins ON public.nfe_avulsas FOR INSERT TO authenticated WITH CHECK (public.pode('custos'::text, 'editar'::text));
CREATE POLICY nfe_avulsas_upd ON public.nfe_avulsas FOR UPDATE TO authenticated USING (public.pode('custos'::text, 'editar'::text));
CREATE POLICY nfe_avulsas_ver ON public.nfe_avulsas FOR SELECT TO authenticated USING (public.pode('custos'::text, 'ver'::text));
ALTER TABLE public.patrimonio ENABLE ROW LEVEL SECURITY;
CREATE POLICY patrimonio_del ON public.patrimonio FOR DELETE TO authenticated USING (public.pode('custos'::text, 'editar'::text));
CREATE POLICY patrimonio_ins ON public.patrimonio FOR INSERT TO authenticated WITH CHECK (public.pode('custos'::text, 'editar'::text));
CREATE POLICY patrimonio_upd ON public.patrimonio FOR UPDATE TO authenticated USING (public.pode('custos'::text, 'editar'::text));
CREATE POLICY patrimonio_ver ON public.patrimonio FOR SELECT TO authenticated USING (public.pode('custos'::text, 'ver'::text));
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_orders_del ON public.service_orders FOR DELETE TO authenticated USING (public.pode('servicos'::text, 'editar'::text));
CREATE POLICY service_orders_ins ON public.service_orders FOR INSERT TO authenticated WITH CHECK (public.pode('servicos'::text, 'editar'::text));
CREATE POLICY service_orders_upd ON public.service_orders FOR UPDATE TO authenticated USING (public.pode('servicos'::text, 'editar'::text));
CREATE POLICY service_orders_ver ON public.service_orders FOR SELECT TO authenticated USING (public.pode('servicos'::text, 'ver'::text));
ALTER TABLE public.valuation_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY vc_ins ON public.valuation_config FOR INSERT TO authenticated WITH CHECK (public.pode('custos'::text, 'editar'::text));
CREATE POLICY vc_upd ON public.valuation_config FOR UPDATE TO authenticated USING (public.pode('custos'::text, 'editar'::text));
CREATE POLICY vc_ver ON public.valuation_config FOR SELECT TO authenticated USING (public.pode('custos'::text, 'ver'::text));
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE public.cofre_empresas TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE public.cofre_empresas TO authenticated;
GRANT ALL ON TABLE public.cofre_empresas TO service_role;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE public.competitor_analysis TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE public.competitor_analysis TO authenticated;
GRANT ALL ON TABLE public.competitor_analysis TO service_role;
GRANT ALL ON TABLE public.ml_config TO service_role;
GRANT ALL ON TABLE public.ml_token TO service_role;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE public.nfe_avulsas TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE public.nfe_avulsas TO authenticated;
GRANT ALL ON TABLE public.nfe_avulsas TO service_role;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE public.patrimonio TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE public.patrimonio TO authenticated;
GRANT ALL ON TABLE public.patrimonio TO service_role;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE public.service_orders TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE public.service_orders TO authenticated;
GRANT ALL ON TABLE public.service_orders TO service_role;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE public.valuation_config TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,UPDATE ON TABLE public.valuation_config TO authenticated;
GRANT ALL ON TABLE public.valuation_config TO service_role;

-- ===== Complementos de 20/08/2026 (fora do dump acima) =====
-- Colunas novas em tabelas existentes
ALTER TABLE products ADD COLUMN IF NOT EXISTS volumes_extras jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS garantia_meses integer;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS contribuinte_icms text;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS municipal_registration text;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS credito_aprovado boolean DEFAULT false;
ALTER TABLE sale_orders ADD COLUMN IF NOT EXISTS pagamentos jsonb;
ALTER TABLE sale_orders ADD COLUMN IF NOT EXISTS transportadora text;
ALTER TABLE sale_orders ADD COLUMN IF NOT EXISTS frete_por_conta integer;
ALTER TABLE sale_orders ADD COLUMN IF NOT EXISTS volumes_qtd integer;
ALTER TABLE sale_orders ADD COLUMN IF NOT EXISTS peso_bruto numeric;
ALTER TABLE sale_orders ADD COLUMN IF NOT EXISTS entrega_diferente boolean DEFAULT false;
ALTER TABLE sale_orders ADD COLUMN IF NOT EXISTS endereco_entrega jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS sale_orders_order_number_uniq ON sale_orders (order_number) WHERE order_number IS NOT NULL;

-- financial_categories: RLS (era a única tabela sem)
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_categories FROM anon;
CREATE POLICY fincat_ver ON public.financial_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY fincat_ins ON public.financial_categories FOR INSERT TO authenticated WITH CHECK (pode('financeiro','editar'));
CREATE POLICY fincat_upd ON public.financial_categories FOR UPDATE TO authenticated USING (pode('financeiro','editar'));
CREATE POLICY fincat_del ON public.financial_categories FOR DELETE TO authenticated USING (pode('financeiro','editar'));

-- financial_entries: OS concluída por quem tem 'servicos' lança nas categorias de OS
DROP POLICY IF EXISTS financial_entries_ins ON public.financial_entries;
CREATE POLICY financial_entries_ins ON public.financial_entries FOR INSERT TO authenticated
  WITH CHECK (pode('financeiro','editar') OR (pode('servicos','editar') AND reference_type='service_order' AND category IN ('servicos_os','despesas_viagem_os')));
DROP POLICY IF EXISTS financial_entries_del ON public.financial_entries;
CREATE POLICY financial_entries_del ON public.financial_entries FOR DELETE TO authenticated
  USING (pode('financeiro','editar') OR (pode('servicos','editar') AND reference_type='service_order'));
DROP POLICY IF EXISTS financial_entries_ver ON public.financial_entries;
CREATE POLICY financial_entries_ver ON public.financial_entries FOR SELECT TO authenticated
  USING (pode('financeiro','ver') OR (pode('servicos','ver') AND reference_type='service_order'));

-- purchase_orders migrou do módulo comercial para custos
DROP POLICY IF EXISTS purchase_orders_ver ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_ins ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_upd ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_del ON public.purchase_orders;
CREATE POLICY purchase_orders_ver ON public.purchase_orders FOR SELECT TO authenticated USING (pode('custos','ver'));
CREATE POLICY purchase_orders_ins ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (pode('custos','editar'));
CREATE POLICY purchase_orders_upd ON public.purchase_orders FOR UPDATE TO authenticated USING (pode('custos','editar'));
CREATE POLICY purchase_orders_del ON public.purchase_orders FOR DELETE TO authenticated USING (pode('custos','editar'));

-- Categorias de sistema da OS
INSERT INTO public.financial_categories (id, nome, slug, sistema, ativo) VALUES
  (substr(md5(random()::text),1,24),'Receita de Serviços (OS)','servicos_os',true,true),
  (substr(md5(random()::text),1,24),'Despesas de Viagem (OS)','despesas_viagem_os',true,true)
ON CONFLICT (slug) DO NOTHING;

-- TRUNCATE fora de anon/authenticated em todo o schema (não passa por RLS)
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE TRUNCATE ON public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;

-- ===== Reanálise final (lupa total) =====
-- Colaborador fatura pedido: ramo comercial nas policies do financeiro
DROP POLICY IF EXISTS financial_entries_ins ON public.financial_entries;
CREATE POLICY financial_entries_ins ON public.financial_entries FOR INSERT TO authenticated
  WITH CHECK (pode('financeiro','editar')
    OR (pode('servicos','editar') AND reference_type='service_order' AND category IN ('servicos_os','despesas_viagem_os'))
    OR (pode('comercial','editar') AND reference_type='sale_order' AND category='sale'));
DROP POLICY IF EXISTS financial_entries_upd ON public.financial_entries;
CREATE POLICY financial_entries_upd ON public.financial_entries FOR UPDATE TO authenticated
  USING (pode('financeiro','editar') OR (pode('comercial','editar') AND reference_type='sale_order'));
DROP POLICY IF EXISTS financial_entries_del ON public.financial_entries;
CREATE POLICY financial_entries_del ON public.financial_entries FOR DELETE TO authenticated
  USING (pode('financeiro','editar')
    OR (pode('servicos','editar') AND reference_type='service_order')
    OR (pode('comercial','editar') AND reference_type='sale_order'));
DROP POLICY IF EXISTS financial_entries_ver ON public.financial_entries;
CREATE POLICY financial_entries_ver ON public.financial_entries FOR SELECT TO authenticated
  USING (pode('financeiro','ver')
    OR (pode('servicos','ver') AND reference_type='service_order')
    OR (pode('comercial','ver') AND reference_type='sale_order'));
CREATE UNIQUE INDEX IF NOT EXISTS service_orders_numero_uniq ON service_orders (numero) WHERE numero IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_uniq ON products (sku) WHERE sku IS NOT NULL AND sku <> '';
