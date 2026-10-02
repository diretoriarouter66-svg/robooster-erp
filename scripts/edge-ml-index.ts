// Integração Mercado Livre do ERP Robooster — espelho do precificador unificado,
// empresa única. OAuth PKCE S256 + client_secret; credenciais do app em ml_config
// (só service role lê).
//
// 02/10/2026 — VÁRIAS CONTAS do Mercado Livre ao mesmo tempo (ROUTER 66 e
// SABERDAELETRÔNICA): ml_token guarda UMA linha por conta do ML (ml_user_id),
// de quem quer que tenha conectado. Conectar outra conta não derruba a primeira.
//
// Ações (POST { acao, ... }):
//  check      -> status da conexão (refresh automático com margem de 5 min)
//  authorize  -> gera a URL de autorização (guarda o verifier server-side)
//  callback   -> troca o code por tokens
//  disconnect -> apaga o token
//  sync       -> envia os preços aos anúncios ({ dry_run, only_skus, ml_user_id })
//  token      -> SÓ para rotinas do servidor (service role): devolve o access_token
//                válido de uma conta ({ ml_user_id }); é o ÚNICO ponto que renova o token
//
// Permissão: pode('custos','editar') — mexe em preço público.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const ML_API = 'https://api.mercadolibre.com'

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function sha256(s: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}
function randomHex(n: number) {
  const b = new Uint8Array(n)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const genId = () => randomHex(12)
const REFRESH_LOCKS = new Map<string, Promise<any>>()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Faça login novamente.' }, 401)
  // Rotinas do servidor chamam com a service role (importador de pedidos); gente, com o login.
  const isService = authHeader.replace(/^Bearer\s+/i, '').trim() === SERVICE_KEY
  let caller: any = { id: 'service' }
  if (!isService) {
    const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await asCaller.auth.getUser()
    if (!user) return json({ error: 'Faça login novamente.' }, 401)
    const { data: autorizado } = await asCaller.rpc('pode', { p_modulo: 'custos', p_acao: 'editar' })
    if (!autorizado) return json({ error: 'Sem permissão para a integração ML.' }, 403)
    caller = user
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Dados inválidos.' }, 400) }
  const acao = body.acao || 'check'

  const { data: cfg } = await admin.from('ml_config').select('*').eq('ativo', true).limit(1).maybeSingle()
  if (!cfg?.app_id || !cfg?.app_secret) {
    if (acao === 'check') return json({ connected: false, reason: 'app_nao_configurado' })
    return json({ error: 'App do Mercado Livre ainda não configurado (ml_config).' }, 400)
  }
  const redirectUri = (cfg.redirect_uri || 'https://erp.robooster.com.br/ml-callback').replace(/^(https?:\/\/)+/, 'https://')

  // Contas conectadas = linhas com access_token e sem fluxo de autorização pendente.
  const tokenRows = async () => {
    const { data } = await admin.from('ml_token').select('*').order('created_date', { ascending: false }).limit(20)
    return (data || []).filter((t: any) => t.access_token && !t.pkce_verifier)
  }
  const getTokenRow = async (mlUserId?: string | null) => {
    const rows = await tokenRows()
    if (mlUserId) return rows.find((t: any) => String(t.ml_user_id) === String(mlUserId)) || null
    return rows[0] || null
  }

  // O refresh_token do ML é de uso único: duas renovações ao mesmo tempo matam a conexão.
  // Uma trava por linha dentro do processo + releitura do registro antes de renovar.
  const refreshIfNeeded = async (tokenIn: any): Promise<any> => {
    const chave = String(tokenIn.id)
    const pend = REFRESH_LOCKS.get(chave)
    if (pend && tokenIn.expires_at !== 0) return pend
    const p = (async () => {
      let token = tokenIn
      if (tokenIn.expires_at !== 0) {
        const { data: atual } = await admin.from('ml_token').select('*').eq('id', tokenIn.id).maybeSingle()
        if (atual) token = atual
      }
      return await refreshAgora(token)
    })()
    REFRESH_LOCKS.set(chave, p)
    try { return await p } finally { REFRESH_LOCKS.delete(chave) }
  }
  const refreshAgora = async (token: any) => {
    if (Date.now() <= ((token.expires_at || 0) - 300000)) return token
    if (!token.refresh_token || token.refresh_token === 'no_refresh') return null
    const r = await fetch(`${ML_API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: cfg.app_id,
        client_secret: cfg.app_secret,
        refresh_token: token.refresh_token,
      }),
    })
    if (!r.ok) {
      // Só refresh REJEITADO (400/401) invalida o token; instabilidade do ML
      // (5xx/timeout) mantém o registro — nunca destruir a conexão por soluço.
      if (r.status === 400 || r.status === 401) return null
      return token
    }
    const t = await r.json()
    const upd = {
      access_token: t.access_token,
      refresh_token: t.refresh_token || token.refresh_token,
      expires_at: Date.now() + (t.expires_in || 21600) * 1000,
      updated_date: new Date().toISOString(),
    }
    await admin.from('ml_token').update(upd).eq('id', token.id)
    return { ...token, ...upd }
  }

  // ---------- CHECK ----------
  // Devolve TODAS as contas conectadas. `connected`/`nickname` (a primeira) ficam por compatibilidade.
  if (acao === 'check') {
    const rows = await tokenRows()
    const contas: any[] = []
    for (const row of rows) {
      let fresh = await refreshIfNeeded(row)
      if (!fresh) { await admin.from('ml_token').delete().eq('id', row.id); continue }
      let me = await fetch(`${ML_API}/users/me`, { headers: { Authorization: `Bearer ${fresh.access_token}` } })
      if (me.status === 401 || me.status === 403) {
        // Antes de declarar revogado, força UM refresh (o access pode ter vencido
        // durante uma instabilidade do ML sem que o refresh_token tenha caducado).
        const forcado = await refreshIfNeeded({ ...fresh, expires_at: 0 })
        if (!forcado) { await admin.from('ml_token').delete().eq('id', row.id); continue }
        if (forcado.access_token === fresh.access_token) { contas.push({ ml_user_id: fresh.ml_user_id, nickname: fresh.ml_nickname, instavel: true }); continue }
        me = await fetch(`${ML_API}/users/me`, { headers: { Authorization: `Bearer ${forcado.access_token}` } })
        if (me.status === 401 || me.status === 403) { await admin.from('ml_token').delete().eq('id', row.id); continue }
        fresh = forcado
      }
      let nickname = fresh.ml_nickname, mlUserId = fresh.ml_user_id
      if (me.ok) {
        const u = await me.json()
        nickname = u.nickname; mlUserId = String(u.id)
        if (u.nickname !== fresh.ml_nickname || String(u.id) !== String(fresh.ml_user_id)) await admin.from('ml_token').update({ ml_user_id: String(u.id), ml_nickname: u.nickname }).eq('id', fresh.id)
      }
      contas.push({ ml_user_id: mlUserId, nickname })
    }
    // Permissões do aplicativo (iguais para todas as contas): o ERP precisa de pedidos e de faturamento com escrita.
    let permissoes: any = null
    if (rows.length) {
      try {
        const t = await getTokenRow()
        const a = await fetch(`${ML_API}/applications/${cfg.app_id}`, { headers: { Authorization: `Bearer ${t.access_token}` } })
        if (a.ok) {
          const sc: string[] = (await a.json()).scopes || []
          permissoes = {
            pedidos: sc.some((x) => x.includes('orders-shipments')),
            faturamento_leitura: sc.some((x) => x.includes('invoices')),
            faturamento_escrita: sc.some((x) => x.includes('invoices') && x.includes('read-write')),
            anuncios: sc.some((x) => x.includes('publish-sync')),
          }
        }
      } catch (_) { /* informação opcional */ }
    }
    return json({ connected: contas.length > 0, nickname: contas[0]?.nickname || null, contas, permissoes })
  }

  // ---------- AUTHORIZE ----------
  if (acao === 'authorize') {
    const verifier = randomHex(32)
    const challenge = b64url(await sha256(verifier))
    // limpa fluxos pendentes antigos DESTE usuário (linhas só com verifier) e abre um novo
    const { data: pend } = await admin.from('ml_token').select('id, access_token, pkce_verifier').eq('user_id', caller.id)
    for (const p of pend || []) if (p.pkce_verifier && !p.access_token) await admin.from('ml_token').delete().eq('id', p.id)
    await admin.from('ml_token').insert({ id: genId(), user_id: caller.id, pkce_verifier: verifier, created_by: caller.email || null })
    const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${cfg.app_id}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${challenge}&code_challenge_method=S256`
    return json({ auth_url: authUrl })
  }

  // ---------- CALLBACK ----------
  if (acao === 'callback') {
    const code = body.code
    if (!code) return json({ error: 'code obrigatório.' }, 400)
    const { data: rows } = await admin.from('ml_token').select('*').eq('user_id', caller.id).limit(5)
    const row = (rows || []).find((t: any) => t.pkce_verifier && !t.access_token)
    if (!row) return json({ error: 'Fluxo de autorização não iniciado — clique em Conectar de novo.' }, 400)
    const r = await fetch(`${ML_API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: cfg.app_id,
        client_secret: cfg.app_secret,
        code,
        redirect_uri: redirectUri,
        code_verifier: row.pkce_verifier,
      }),
    })
    const t = await r.json()
    if (!r.ok || !t.access_token) return json({ error: `Troca do code falhou: ${t.message || t.error || r.status}` }, 400)
    // Qual conta do ML acabou de autorizar? Uma linha por conta: substitui só a linha antiga DESTA conta.
    let mlUserId: string | null = t.user_id ? String(t.user_id) : null, nickname: string | null = null
    try {
      const me = await fetch(`${ML_API}/users/me`, { headers: { Authorization: `Bearer ${t.access_token}` } })
      if (me.ok) { const u = await me.json(); mlUserId = String(u.id); nickname = u.nickname }
    } catch (_) { /* segue com o user_id da resposta */ }
    if (mlUserId) {
      const { data: mesma } = await admin.from('ml_token').select('id').eq('ml_user_id', mlUserId).neq('id', row.id)
      for (const o of mesma || []) await admin.from('ml_token').delete().eq('id', o.id)
    }
    await admin.from('ml_token').update({
      access_token: t.access_token,
      refresh_token: t.refresh_token || 'no_refresh',
      expires_at: Date.now() + (t.expires_in || 21600) * 1000,
      pkce_verifier: null,
      ml_user_id: mlUserId,
      ml_nickname: nickname,
      updated_date: new Date().toISOString(),
    }).eq('id', row.id)
    return json({ success: true, ml_user_id: mlUserId, nickname })
  }

  // ---------- DISCONNECT ----------
  if (acao === 'disconnect') {
    const { data: rows } = await admin.from('ml_token').select('id, ml_user_id')
    for (const r of rows || []) {
      if (body.ml_user_id && String(r.ml_user_id) !== String(body.ml_user_id)) continue
      await admin.from('ml_token').delete().eq('id', r.id)
    }
    return json({ success: true })
  }

  // ---------- TOKEN (só rotinas do servidor) ----------
  if (acao === 'token') {
    if (!isService) return json({ error: 'Ação reservada às rotinas do servidor.' }, 403)
    const row = await getTokenRow(body.ml_user_id)
    if (!row) return json({ error: 'NOT_CONNECTED' }, 404)
    const fresh = await refreshIfNeeded(row)
    if (!fresh) return json({ error: 'TOKEN_EXPIRED' }, 401)
    return json({ access_token: fresh.access_token, ml_user_id: fresh.ml_user_id, nickname: fresh.ml_nickname, expires_at: fresh.expires_at })
  }

  // ---------- SYNC ----------
  if (acao === 'sync') {
    const dryRun = !!body.dry_run
    const onlySkus: string[] | null = Array.isArray(body.only_skus) && body.only_skus.length ? body.only_skus.map((s: string) => s.toUpperCase().trim()) : null

    const row = await getTokenRow(body.ml_user_id)
    if (!row?.access_token) return json({ error: 'NOT_CONNECTED' }, 401)
    const fresh = await refreshIfNeeded(row)
    if (!fresh) return json({ error: 'TOKEN_EXPIRED' }, 401)
    const accessToken = fresh.access_token

    const meRes = await fetch(`${ML_API}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!meRes.ok) return json({ error: 'TOKEN_EXPIRED' }, 401)
    const me = await meRes.json()

    // canais ML do ERP (detecção por nome, igual ao precificador)
    const { data: channels } = await admin.from('sales_channels').select('*').neq('active', false)
    const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const mlChannels = (channels || []).filter((c: any) => norm(c.name).includes('mercado livre'))
    if (!mlChannels.length) return json({ error: 'ML_CHANNEL_NOT_FOUND' }, 400)
    const classicChannel = mlChannels.find((c: any) => norm(c.name).includes('classico') || norm(c.name).includes('classic'))
    const premiumChannel = mlChannels.find((c: any) => { const n = norm(c.name); return n.includes('premium') || n.includes('ouro') || n.includes('gold') })

    const { data: products } = await admin.from('products').select('id, sku, name')
    const { data: pricings } = await admin.from('product_pricing').select('product_id, channel_id, price')
    const byProductChannel: Record<string, Record<string, number>> = {}
    for (const p of pricings || []) {
      if (!mlChannels.some((c: any) => c.id === p.channel_id)) continue
      byProductChannel[p.product_id] ??= {}
      byProductChannel[p.product_id][p.channel_id] = p.price
    }

    // todos os anúncios do vendedor
    const itemIds: string[] = []
    let offset = 0
    while (true) {
      const r = await fetch(`${ML_API}/users/${me.id}/items/search?limit=50&offset=${offset}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!r.ok) break
      const d = await r.json()
      itemIds.push(...(d.results || []))
      if (!d.results?.length || itemIds.length >= (d.paging?.total || 0)) break
      offset += 50
      await sleep(150)
    }

    // mapa SKU -> anúncios (seller_custom_field, SELLER_SKU, SKU)
    const skuMap: Record<string, any[]> = {}
    const add = (key: string | undefined | null, info: any) => {
      const k = (key || '').toUpperCase().trim()
      if (!k) return
      skuMap[k] ??= []
      if (!skuMap[k].some((x) => x.id === info.id)) skuMap[k].push(info)
    }
    for (let i = 0; i < itemIds.length; i += 20) {
      const batch = itemIds.slice(i, i + 20)
      const r = await fetch(`${ML_API}/items?ids=${batch.join(',')}&attributes=id,listing_type_id,seller_custom_field,attributes,price`, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!r.ok) continue
      const arr = await r.json()
      for (const w of arr || []) {
        const item = w.body
        if (!item?.id) continue
        const info = { id: item.id, listing_type_id: item.listing_type_id, current_price: item.price }
        add(item.seller_custom_field, info)
        add(item.attributes?.find((a: any) => a.id === 'SELLER_SKU')?.value_name, info)
        add(item.attributes?.find((a: any) => a.id === 'SKU')?.value_name, info)
      }
      await sleep(200)
    }

    const priceFor = (productId: string, listingTypeId: string) => {
      const byCh = byProductChannel[productId]
      if (!byCh) return null
      const isPremium = listingTypeId && (listingTypeId.includes('gold_pro') || listingTypeId.includes('premium'))
      if (isPremium && premiumChannel && byCh[premiumChannel.id] != null) return byCh[premiumChannel.id]
      if (!isPremium && classicChannel && byCh[classicChannel.id] != null) return byCh[classicChannel.id]
      const first = Object.values(byCh)[0]
      return first != null ? first : null
    }

    const preview: any[] = []
    const failures: any[] = []
    let updated = 0, aMudar = 0, semPreco = 0, naoEncontrados = 0

    for (const product of products || []) {
      const sku = (product.sku || '').toUpperCase().trim()
      if (!sku) continue
      if (onlySkus && !onlySkus.includes(sku)) continue
      const items = skuMap[sku]
      if (!items?.length) {
        if (byProductChannel[product.id]) { naoEncontrados++; if (dryRun) preview.push({ sku, product_name: product.name, item_id: null, listing_type_id: null, preco_atual: null, preco_novo: null, muda: false, motivo: 'SKU não encontrado nos anúncios do ML' }) }
        continue
      }
      for (const info of items) {
        const raw = priceFor(product.id, info.listing_type_id)
        if (raw == null || raw <= 0) { semPreco++; if (dryRun) preview.push({ sku, product_name: product.name, item_id: info.id, listing_type_id: info.listing_type_id, preco_atual: info.current_price, preco_novo: null, muda: false, motivo: 'Sem preço configurado no canal' }); continue }
        const novo = Math.round(Number(raw) * 100) / 100
        const muda = Math.abs(novo - (info.current_price || 0)) >= 0.01
        if (dryRun) {
          if (muda) aMudar++
          preview.push({ sku, product_name: product.name, item_id: info.id, listing_type_id: info.listing_type_id, preco_atual: info.current_price, preco_novo: novo, muda, motivo: muda ? 'Vai atualizar' : 'Já está igual' })
          continue
        }
        if (!muda) continue
        try {
          const r = await fetch(`${ML_API}/items/${info.id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ price: novo }),
          })
          if (!r.ok) throw new Error(`Update failed (${r.status}): ${(await r.text()).slice(0, 200)}`)
          updated++
        } catch (err) {
          failures.push({ sku, reason: `${info.id}: ${(err as Error).message}` })
        }
        await sleep(300)
      }
    }

    if (dryRun) return json({ success: true, dry_run: true, totalAnuncios: itemIds.length, aMudar, semPreco, naoEncontrados, preview })
    return json({ success: true, updated, failed: failures.length, failures: failures.slice(0, 20) })
  }

  return json({ error: `Ação desconhecida: ${acao}` }, 400)
})
