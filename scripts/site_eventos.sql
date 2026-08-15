-- CRM comportamental (15/08/2026): eventos do site robooster.com.br.
-- Pixel próprio (mu-plugin) → POST REST anônimo → esta tabela. Leitura só autenticada.
CREATE TABLE IF NOT EXISTS site_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id text,
  evento text DEFAULT 'pageview',   -- pageview | whatsapp_click
  url text,
  titulo text,
  referrer text,
  utm jsonb,
  user_agent text,
  created_date timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_eventos_visitor_idx ON site_eventos (visitor_id, created_date DESC);
CREATE INDEX IF NOT EXISTS site_eventos_url_idx ON site_eventos (url);
ALTER TABLE site_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_eventos_ins_anon ON site_eventos;
DROP POLICY IF EXISTS site_eventos_ver ON site_eventos;
CREATE POLICY site_eventos_ins_anon ON site_eventos FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY site_eventos_ver ON site_eventos FOR SELECT TO authenticated USING (pode('comercial','ver'));
GRANT INSERT ON site_eventos TO anon;
GRANT SELECT ON site_eventos TO authenticated;
