-- Robooster ERP — schema gerado a partir de base44/entities/*.jsonc (Fase 2)
-- id text PK | created_date/updated_date timestamptz | created_by text

-- Categoria  (3 campos)
CREATE TABLE IF NOT EXISTS public."categorias" (
  id text PRIMARY KEY,
  "ativa" boolean,
  "descricao" text,
  "nome" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- ConfigTributaria  (17 campos)
CREATE TABLE IF NOT EXISTS public."config_tributaria" (
  id text PRIMARY KEY,
  "nome" text,
  "presuncao_irpj" numeric,
  "presuncao_csll" numeric,
  "aliq_irpj" numeric,
  "aliq_csll" numeric,
  "adicional_irpj_aliq" numeric,
  "adicional_irpj_limite" numeric,
  "pis_venda" numeric,
  "cofins_venda" numeric,
  "icms_interestadual_importado" numeric,
  "lc224_limite_anual" numeric,
  "irrf_dividendos" numeric,
  "irrf_piso_residente" numeric,
  "cambio_usd" numeric,
  "comissao_vendedor_padrao" numeric,
  "indice_custo_fixo" numeric,
  "despesas_fixas" jsonb,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- Contato  (24 campos)
CREATE TABLE IF NOT EXISTS public."contatos" (
  id text PRIMARY KEY,
  "name" text,
  "trade_name" text,
  "tipos" jsonb,
  "person_type" text,
  "document" text,
  "state_registration" text,
  "contact_name" text,
  "email" text,
  "phone" text,
  "whatsapp" text,
  "zip_code" text,
  "address" text,
  "address_number" text,
  "address_complement" text,
  "neighborhood" text,
  "city" text,
  "state" text,
  "country" text,
  "currency" text,
  "payment_terms" text,
  "channel" text,
  "status" text,
  "notes" text,
  "legacy_id" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- Customer  (18 campos)
CREATE TABLE IF NOT EXISTS public."customers" (
  id text PRIMARY KEY,
  "name" text,
  "trade_name" text,
  "person_type" text,
  "document" text,
  "state_registration" text,
  "email" text,
  "phone" text,
  "whatsapp" text,
  "zip_code" text,
  "state" text,
  "city" text,
  "neighborhood" text,
  "address" text,
  "address_number" text,
  "address_complement" text,
  "channel" text,
  "status" text,
  "notes" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- DRESalvo  (9 campos)
CREATE TABLE IF NOT EXISTS public."dre_salvos" (
  id text PRIMARY KEY,
  "comissao" numeric,
  "meses_venda" numeric,
  "mix_geo" jsonb,
  "nome" text,
  "operacao_id" text,
  "operacao_nome" text,
  "preco_overrides" jsonb,
  "resultado" jsonb,
  "saldo_credor_icms" numeric,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- FinancialEntry  (11 campos)
CREATE TABLE IF NOT EXISTS public."financial_entries" (
  id text PRIMARY KEY,
  "type" text,
  "description" text,
  "category" text,
  "reference_id" text,
  "reference_type" text,
  "amount" numeric,
  "due_date" text,
  "payment_date" text,
  "status" text,
  "payment_method" text,
  "notes" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- ImportItem  (11 campos)
CREATE TABLE IF NOT EXISTS public."import_items" (
  id text PRIMARY KEY,
  "import_process_id" text,
  "product_id" text,
  "product_name" text,
  "product_sku" text,
  "quantity" numeric,
  "unit_price_fob" numeric,
  "total_fob" numeric,
  "unit_cost_landed_brl" numeric,
  "total_landed_brl" numeric,
  "ncm" text,
  "weight_kg" numeric,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- ImportOperation  (21 campos)
CREATE TABLE IF NOT EXISTS public."import_operations" (
  id text PRIMARY KEY,
  "cambio" numeric,
  "comissao_perc" numeric,
  "container_tipo" text,
  "data" text,
  "despesas_locais_usd" numeric,
  "frete_container_usd" numeric,
  "frete_internacional_usd" numeric,
  "itens" jsonb,
  "nome" text,
  "prazo_venda_meses" numeric,
  "purchase_order_id" text,
  "resultado_cubagem" jsonb,
  "resultado_importacao" jsonb,
  "resultado_venda" jsonb,
  "seguro_usd" numeric,
  "status" text,
  "tipo_venda" text,
  "vendas" jsonb,
  "pct_declarado" numeric,
  "remessas" jsonb,
  "estoque_lancado" boolean,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- ImportProcess  (40 campos)
CREATE TABLE IF NOT EXISTS public."import_processes" (
  id text PRIMARY KEY,
  "reference" text,
  "supplier_id" text,
  "supplier_name" text,
  "status" text,
  "incoterm" text,
  "origin_country" text,
  "currency" text,
  "exchange_rate" numeric,
  "total_fob_usd" numeric,
  "total_fob_brl" numeric,
  "freight_international" numeric,
  "insurance" numeric,
  "cif_value_brl" numeric,
  "ii_rate" numeric,
  "ii_value" numeric,
  "ipi_rate" numeric,
  "ipi_value" numeric,
  "pis_rate" numeric,
  "pis_value" numeric,
  "cofins_rate" numeric,
  "cofins_value" numeric,
  "icms_rate" numeric,
  "icms_value" numeric,
  "afrmm_value" numeric,
  "siscomex_fee" numeric,
  "customs_broker_fee" numeric,
  "storage_fee" numeric,
  "inland_freight" numeric,
  "other_expenses" numeric,
  "total_taxes" numeric,
  "total_expenses" numeric,
  "total_landed_cost" numeric,
  "fiscal_benefit_type" text,
  "fiscal_benefit_description" text,
  "fiscal_benefit_discount" numeric,
  "di_number" text,
  "di_date" text,
  "estimated_arrival" text,
  "actual_arrival" text,
  "notes" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- Product  (40 campos)
CREATE TABLE IF NOT EXISTS public."products" (
  id text PRIMARY KEY,
  "sku" text,
  "name" text,
  "model" text,
  "description" text,
  "brand" text,
  "category_id" text,
  "category_name" text,
  "ncm" text,
  "origin_country" text,
  "unit" text,
  "weight_kg" numeric,
  "height_cm" numeric,
  "width_cm" numeric,
  "length_cm" numeric,
  "empilhavel" boolean,
  "pode_deitar" boolean,
  "cost_fob_usd" numeric,
  "cost_landed_brl" numeric,
  "custo_manual_brl" numeric,
  "seller_commission_percent" numeric,
  "sale_price" numeric,
  "markup_percent" numeric,
  "ii_rate" numeric,
  "ipi_rate" numeric,
  "pis_rate" numeric,
  "cofins_rate" numeric,
  "icms_rate" numeric,
  "beneficio_5291" boolean,
  "ex_tarifario" boolean,
  "ex_tarifario_validade" text,
  "ipi_recuperavel" boolean,
  "stock_quantity" numeric,
  "min_stock" numeric,
  "image_url" text,
  "images" jsonb,
  "video_url" text,
  "barcode" text,
  "status" text,
  "supplier_id" text,
  "notes" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- ProductCategory  (2 campos)
CREATE TABLE IF NOT EXISTS public."product_categories" (
  id text PRIMARY KEY,
  "name" text,
  "description" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- ProductPricing  (5 campos)
CREATE TABLE IF NOT EXISTS public."product_pricing" (
  id text PRIMARY KEY,
  "channel_id" text,
  "notes" text,
  "price" numeric,
  "price_promotional" numeric,
  "product_id" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- PurchaseOrder  (13 campos)
CREATE TABLE IF NOT EXISTS public."purchase_orders" (
  id text PRIMARY KEY,
  "po_number" text,
  "supplier_id" text,
  "supplier_name" text,
  "status" text,
  "currency" text,
  "exchange_rate" numeric,
  "items" jsonb,
  "subtotal" numeric,
  "total_brl" numeric,
  "payment_terms" text,
  "expected_delivery" text,
  "import_process_id" text,
  "notes" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- SaleOrder  (21 campos)
CREATE TABLE IF NOT EXISTS public."sale_orders" (
  id text PRIMARY KEY,
  "order_number" text,
  "customer_id" text,
  "customer_name" text,
  "channel" text,
  "status" text,
  "items" jsonb,
  "subtotal" numeric,
  "discount" numeric,
  "shipping_cost" numeric,
  "total" numeric,
  "payment_method" text,
  "payment_status" text,
  "tracking_code" text,
  "invoice_number" text,
  "notes" text,
  "installments" numeric,
  "installment_interval_days" numeric,
  "first_due_days" numeric,
  "financial_entry_id" text,
  "stock_deducted" boolean,
  "channel_id" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- SalesChannel  (8 campos)
CREATE TABLE IF NOT EXISTS public."sales_channels" (
  id text PRIMARY KEY,
  "name" text,
  "type" text,
  "commission_percent" numeric,
  "fixed_fee" numeric,
  "is_master" boolean,
  "active" boolean,
  "dias_liberacao" numeric,
  "aliq_icms_venda" numeric,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- Socio  (3 campos)
CREATE TABLE IF NOT EXISTS public."socios" (
  id text PRIMARY KEY,
  "nome" text,
  "percentual_participacao" numeric,
  "residente_fiscal_brasil" boolean,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- StockMovement  (20 campos)
CREATE TABLE IF NOT EXISTS public."stock_movements" (
  id text PRIMARY KEY,
  "product_id" text,
  "product_name" text,
  "product_sku" text,
  "sku" text,
  "type" text,
  "quantity" numeric,
  "previous_stock" numeric,
  "new_stock" numeric,
  "reference_type" text,
  "reference_id" text,
  "unit_cost" numeric,
  "notes" text,
  "tipo" text,
  "quantidade" numeric,
  "saldo_anterior" numeric,
  "saldo_novo" numeric,
  "origem_tipo" text,
  "origem_id" text,
  "origem_ref" text,
  "motivo" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- Supplier  (15 campos)
CREATE TABLE IF NOT EXISTS public."suppliers" (
  id text PRIMARY KEY,
  "company_name" text,
  "trade_name" text,
  "type" text,
  "document" text,
  "country" text,
  "city" text,
  "address" text,
  "contact_name" text,
  "email" text,
  "phone" text,
  "whatsapp" text,
  "payment_terms" text,
  "currency" text,
  "status" text,
  "notes" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- TipoContato  (2 campos)
CREATE TABLE IF NOT EXISTS public."tipos_contato" (
  id text PRIMARY KEY,
  "nome" text,
  "ativa" boolean,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);

-- User  (1 campos)
CREATE TABLE IF NOT EXISTS public."users" (
  id text PRIMARY KEY,
  "role" text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by text
);
