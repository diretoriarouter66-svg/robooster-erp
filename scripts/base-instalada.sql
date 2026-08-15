-- Base Instalada (15/08/2026): cliente ↔ máquinas que ele possui.
-- Alimentada automaticamente pelos pedidos faturados + registro manual (histórico pré-ERP).
CREATE TABLE IF NOT EXISTS base_instalada (
  id text PRIMARY KEY,
  contato_id text NOT NULL,
  product_id text NOT NULL,
  sale_order_id text,
  numero_serie text,
  data_venda date,
  origem text DEFAULT 'manual', -- 'pedido' | 'manual'
  notes text,
  created_date timestamptz DEFAULT now(),
  updated_date timestamptz,
  created_by text
);
ALTER TABLE base_instalada ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS base_instalada_ver ON base_instalada;
DROP POLICY IF EXISTS base_instalada_ins ON base_instalada;
DROP POLICY IF EXISTS base_instalada_upd ON base_instalada;
DROP POLICY IF EXISTS base_instalada_del ON base_instalada;
CREATE POLICY base_instalada_ver ON base_instalada FOR SELECT TO authenticated USING (pode('comercial','ver'));
CREATE POLICY base_instalada_ins ON base_instalada FOR INSERT TO authenticated WITH CHECK (pode('comercial','editar'));
CREATE POLICY base_instalada_upd ON base_instalada FOR UPDATE TO authenticated USING (pode('comercial','editar'));
CREATE POLICY base_instalada_del ON base_instalada FOR DELETE TO authenticated USING (pode('comercial','editar'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS lead_time_dias int DEFAULT 0; -- dias entre pedir reposição e ela chegar (importação: meses)
