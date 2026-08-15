-- NF-e no ERP (15/08/2026): campos no pedido + config protegida (só service_role lê).
ALTER TABLE sale_orders
  ADD COLUMN IF NOT EXISTS nfe_ref text,
  ADD COLUMN IF NOT EXISTS nfe_status text,
  ADD COLUMN IF NOT EXISTS nfe_chave text,
  ADD COLUMN IF NOT EXISTS nfe_numero text,
  ADD COLUMN IF NOT EXISTS nfe_serie text,
  ADD COLUMN IF NOT EXISTS nfe_ambiente text,
  ADD COLUMN IF NOT EXISTS nfe_mensagem text,
  ADD COLUMN IF NOT EXISTS imposto_regime text,
  ADD COLUMN IF NOT EXISTS imposto_aliquota numeric,
  ADD COLUMN IF NOT EXISTS imposto_valor numeric;

CREATE TABLE IF NOT EXISTS nfe_config (
  id text PRIMARY KEY,
  ambiente text NOT NULL,             -- homologacao | producao
  token text NOT NULL,
  serie int NOT NULL DEFAULT 1,
  ativo boolean DEFAULT false,
  cnpj_emitente text,
  created_date timestamptz DEFAULT now()
);
ALTER TABLE nfe_config ENABLE ROW LEVEL SECURITY; -- sem policies: só service_role acessa

INSERT INTO nfe_config (id, ambiente, token, serie, ativo, cnpj_emitente) VALUES
 ('homologacao', 'homologacao', 'n8tKLcBw7q9opX7mCYfB56K1FmZAuy4G', 1, true,  '43926449000198'),
 ('producao',    'producao',    'zAAD6cvNTrxo59DnTNor9rkpCJtgqlyT', 2, false, '43926449000198')
ON CONFLICT (id) DO UPDATE SET token = EXCLUDED.token, serie = EXCLUDED.serie;
