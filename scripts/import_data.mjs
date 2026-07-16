// Fase 4 — Importa os 12 JSONs de /root/dados_erp para o Postgres do Supabase.
// Preserva IDs originais e relações. Usa service_role (bypass RLS). Idempotente (upsert por id).
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const SUPABASE_URL = 'https://supabase.robooster.com.br';
// service_role key (de /root/dados_vps/dados_supabase)
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.aB3bt5sYK1_gAvhzX7S5QSww4UXLBl22ItEKdKBUGvs';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DIR = '/root/dados_erp';
const MAP = [
  ['categorias.json', 'categorias'],
  ['config_tributaria.json', 'config_tributaria'],
  ['contatos.json', 'contatos'],
  ['tipos_contato.json', 'tipos_contato'],
  ['sales_channels.json', 'sales_channels'],
  ['socios.json', 'socios'],
  ['products.json', 'products'],
  ['product_pricing.json', 'product_pricing'],
  ['import_operations.json', 'import_operations'],
  ['stock_movements.json', 'stock_movements'],
  ['sale_orders.json', 'sale_orders'],
  ['financial_entries.json', 'financial_entries'],
];

const results = [];
for (const [file, table] of MAP) {
  const rows = JSON.parse(fs.readFileSync(`${DIR}/${file}`, 'utf8'));
  const nJson = rows.length;

  let imported = 0;
  let error = null;
  if (nJson > 0) {
    const { error: upErr } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (upErr) error = upErr.message;
  }

  // conta o que ficou no banco
  const { count, error: cErr } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true });
  imported = cErr ? -1 : count;

  results.push({ file, table, nJson, imported, error });
  console.log(
    `${file.padEnd(24)} ${table.padEnd(20)} json=${String(nJson).padEnd(3)} db=${String(imported).padEnd(3)} ${error ? 'ERRO: ' + error : 'OK'}`
  );
}

fs.writeFileSync(
  '/tmp/claude-0/-root-robooster-erp/08156b57-669e-45e2-9dd8-12ce87a8007f/scratchpad/import_result.json',
  JSON.stringify(results, null, 2)
);

const totJson = results.reduce((a, r) => a + r.nJson, 0);
const totDb = results.reduce((a, r) => a + (r.imported > 0 ? r.imported : 0), 0);
const anyErr = results.some((r) => r.error);
console.log(`\nTOTAL json=${totJson}  db=${totDb}  ${anyErr ? 'COM ERROS' : 'SEM ERROS'}`);
process.exit(anyErr ? 1 : 0);
