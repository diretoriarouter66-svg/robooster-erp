// Migra imagens de produto do storage do Base44 para o Supabase Storage (bucket uploads)
// e reaponta products.image_url (e o array images, se houver). Idempotente: pula o que já
// está no domínio do Supabase. Usa service_role.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://supabase.robooster.com.br';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIsCiAgImlhdCI6IDE3MTUwNTA4MDAsCiAgImV4cCI6IDE4NzI4MTcyMDAKfQ.aB3bt5sYK1_gAvhzX7S5QSww4UXLBl22ItEKdKBUGvs';
const BUCKET = 'uploads';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function extFromUrl(u, contentType) {
  const clean = u.split('?')[0];
  const m = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
  if (m) return m[1].toLowerCase();
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('jpeg')) return 'jpg';
  if (contentType?.includes('webp')) return 'webp';
  return 'bin';
}

async function migrateOne(url, keyBase) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  const path = `products/${keyBase}.${extFromUrl(url, ct)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: ct, upsert: true });
  if (error) throw new Error(`upload: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // valida acesso público
  const check = await fetch(data.publicUrl, { method: 'HEAD' });
  return { publicUrl: data.publicUrl, bytes: buf.length, ok: check.ok, ct };
}

const { data: products, error } = await supabase
  .from('products')
  .select('id, name, image_url, images');
if (error) throw error;

let migrated = 0,
  skipped = 0;
for (const p of products) {
  let newImageUrl = p.image_url;
  // image_url principal
  if (p.image_url && p.image_url.includes('base44')) {
    const r = await migrateOne(p.image_url, `${p.id}_main`);
    newImageUrl = r.publicUrl;
    console.log(`✔ ${p.name?.slice(0, 28).padEnd(28)} ${r.bytes} bytes  público=${r.ok}`);
    migrated++;
  } else {
    console.log(`· ${p.name?.slice(0, 28).padEnd(28)} (sem imagem base44)`);
    skipped++;
  }

  // array images (se existir)
  let newImages = p.images;
  if (Array.isArray(p.images) && p.images.length) {
    newImages = [];
    for (let i = 0; i < p.images.length; i++) {
      const img = p.images[i];
      if (typeof img === 'string' && img.includes('base44')) {
        const r = await migrateOne(img, `${p.id}_${i}`);
        newImages.push(r.publicUrl);
        migrated++;
      } else {
        newImages.push(img);
      }
    }
  }

  if (newImageUrl !== p.image_url || JSON.stringify(newImages) !== JSON.stringify(p.images)) {
    const { error: upErr } = await supabase
      .from('products')
      .update({ image_url: newImageUrl, images: newImages })
      .eq('id', p.id);
    if (upErr) console.log(`  ⚠ update falhou: ${upErr.message}`);
  }
}

console.log(`\nMigradas: ${migrated}  |  Sem imagem base44: ${skipped}`);
