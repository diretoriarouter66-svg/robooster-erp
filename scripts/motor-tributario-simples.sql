-- Motor tributário dual (15/08/2026): Simples Nacional Anexo I × Lucro Presumido.
-- Espelho JS: src/lib/taxEngine.js
ALTER TABLE config_tributaria
  ADD COLUMN IF NOT EXISTS regime text DEFAULT 'simples',
  ADD COLUMN IF NOT EXISTS rbt12 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS simples_anexo int DEFAULT 1;

UPDATE config_tributaria SET regime = 'simples' WHERE regime IS NULL;

CREATE OR REPLACE FUNCTION public.simples_aliquota_efetiva(p_rbt12 numeric, p_anexo int DEFAULT 1)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_rbt12 IS NULL OR p_rbt12 <= 180000 THEN 4.00
    ELSE ROUND(((p_rbt12 * aliq / 100.0 - pd) / p_rbt12) * 100.0, 4)
  END
  FROM (
    SELECT * FROM (VALUES
      (180000::numeric, 4.0::numeric, 0::numeric),
      (360000, 7.3, 5940),
      (720000, 9.5, 13860),
      (1800000, 10.7, 22500),
      (3600000, 14.3, 87300),
      (4800000, 19.0, 378000)
    ) AS t(ate, aliq, pd)
    WHERE p_rbt12 <= ate OR ate = 4800000
    ORDER BY ate LIMIT 1
  ) f;
$$;
ALTER TABLE products ADD COLUMN IF NOT EXISTS compativel_com jsonb DEFAULT '[]'::jsonb; -- peça/insumo → ids das máquinas compatíveis
