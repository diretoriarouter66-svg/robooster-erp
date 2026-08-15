-- CRM no ERP (15/08/2026): espelho compacto do Chatwoot + ponte visitante↔telefone.
CREATE TABLE IF NOT EXISTS crm_conversas (
  phone text PRIMARY KEY,                 -- +55... normalizado
  contato_nome text,
  total_conversas int DEFAULT 0,
  ultima_mensagem_em timestamptz,
  ultima_mensagem text,
  chatwoot_contact_id int,
  atualizado_em timestamptz DEFAULT now()
);
ALTER TABLE crm_conversas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_conversas_ver ON crm_conversas;
CREATE POLICY crm_conversas_ver ON crm_conversas FOR SELECT TO authenticated USING (pode('comercial','ver'));
GRANT SELECT ON crm_conversas TO authenticated;

CREATE TABLE IF NOT EXISTS visitor_identidade (
  visitor_id text PRIMARY KEY,            -- cookie rb_vid
  phone text,
  chatwoot_contact_id int,
  vinculado_em timestamptz DEFAULT now(),
  origem text DEFAULT 'ref-whatsapp'
);
CREATE INDEX IF NOT EXISTS visitor_identidade_phone_idx ON visitor_identidade (phone);
ALTER TABLE visitor_identidade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visitor_identidade_ver ON visitor_identidade;
CREATE POLICY visitor_identidade_ver ON visitor_identidade FOR SELECT TO authenticated USING (pode('comercial','ver'));
GRANT SELECT ON visitor_identidade TO authenticated;
