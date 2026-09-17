// Emite NF-e de um pedido de venda do ERP via Focus NFe.
//
// Por que Edge Function: os tokens do Focus e a lógica fiscal NÃO podem ir
// para o navegador. Config (tokens/série/ambiente) vive na tabela nfe_config,
// sem policies — só a SERVICE_ROLE lê.
//
// Ações (POST { acao, sale_order_id }):
//  emitir  -> monta o JSON da NF-e (Simples/CSOSN 102) e envia ao Focus
//  status  -> consulta o status no Focus e atualiza o pedido
//  danfe   -> devolve o PDF do DANFE (proxy autenticado)
//  xml     -> devolve o XML autorizado
//
// Autorização: usuário logado com pode('comercial','editar').

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const FOCUS_BASE: Record<string, string> = {
  homologacao: 'https://homologacao.focusnfe.com.br',
  producao: 'https://api.focusnfe.com.br',
}

function focusAuth(token: string) {
  return 'Basic ' + btoa(token + ':')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Faça login novamente.' }, 401)

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user: caller } } = await asCaller.auth.getUser()
  if (!caller) return json({ error: 'Faça login novamente.' }, 401)

  const { data: autorizado } = await asCaller.rpc('pode', { p_modulo: 'comercial', p_acao: 'editar' })
  if (!autorizado) return json({ error: 'Sem permissão para emitir NF-e.' }, 403)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  let body: { acao?: string; sale_order_id?: string; nfe_id?: string }
  try { body = await req.json() } catch { return json({ error: 'Dados inválidos.' }, 400) }
  const acao = body.acao || 'emitir'
  const orderId = body.sale_order_id
  const avulsaId = body.nfe_id
  if (!orderId && !avulsaId) return json({ error: 'sale_order_id ou nfe_id obrigatório.' }, 400)

  // Config ativa (homologação até a virada de chave manual no banco)
  const { data: cfg } = await admin.from('nfe_config').select('*').eq('ativo', true).limit(1).maybeSingle()
  if (!cfg) return json({ error: 'Nenhum ambiente NF-e ativo (nfe_config).' }, 500)
  const base = FOCUS_BASE[cfg.ambiente]

  // ================= NF AVULSA (entrada/saída sem pedido de venda) =================
  if (avulsaId) {
    const { data: podeCustos } = await asCaller.rpc('pode', { p_modulo: 'custos', p_acao: 'editar' })
    if (!podeCustos) return json({ error: 'Sem permissão para NF avulsa.' }, 403)

    const { data: nota } = await admin.from('nfe_avulsas').select('*').eq('id', avulsaId).maybeSingle()
    if (!nota) return json({ error: 'Nota avulsa não encontrada.' }, 404)
    const refA = nota.nfe_ref || `avulsa-${avulsaId}`

    if (acao === 'status') {
      const r = await fetch(`${base}/v2/nfe/${refA}`, { headers: { Authorization: focusAuth(cfg.token) } })
      const st = await r.json()
      await admin.from('nfe_avulsas').update({
        nfe_status: st.status || null,
        nfe_chave: st.chave_nfe || null,
        nfe_numero: st.numero ? String(st.numero) : null,
        nfe_serie: st.serie ? String(st.serie) : null,
        nfe_mensagem: (st.mensagem_sefaz || st.mensagem || '').slice(0, 300),
      }).eq('id', avulsaId)
      return json(st)
    }

    if (acao === 'danfe' || acao === 'xml') {
      const r = await fetch(`${base}/v2/nfe/${refA}`, { headers: { Authorization: focusAuth(cfg.token) } })
      const st = await r.json()
      const caminho = acao === 'danfe' ? st.caminho_danfe : st.caminho_xml_nota_fiscal
      if (!caminho) return json({ error: 'Arquivo ainda não disponível.', status: st.status }, 404)
      const file = await fetch(`${base}${caminho}`, { headers: { Authorization: focusAuth(cfg.token) } })
      const buf = await file.arrayBuffer()
      return new Response(buf, {
        headers: {
          ...cors,
          'Content-Type': acao === 'danfe' ? 'application/pdf' : 'application/xml',
          'Content-Disposition': `inline; filename="nfe-${st.numero || refA}.${acao === 'danfe' ? 'pdf' : 'xml'}"`,
        },
      })
    }

    // ---- EMITIR AVULSA ----
    if (nota.nfe_status === 'autorizado') return json({ error: 'Esta nota já está autorizada.' }, 409)
    if (nota.nfe_status === 'processando_autorizacao') {
      // Reenviar por cima de um processamento sobrescreveria o status e podia
      // esconder uma autorização — primeiro consulta o que o Focus tem.
      const rSt = await fetch(`${base}/v2/nfe/${refA}`, { headers: { Authorization: focusAuth(cfg.token) } })
      const st = await rSt.json()
      if (['autorizado', 'processando_autorizacao'].includes(st.status)) {
        await admin.from('nfe_avulsas').update({
          nfe_status: st.status, nfe_chave: st.chave_nfe || null,
          nfe_numero: st.numero ? String(st.numero) : null,
          nfe_mensagem: (st.mensagem_sefaz || st.mensagem || '').slice(0, 300),
        }).eq('id', avulsaId)
        return json(st.status === 'autorizado' ? st : { error: 'A nota ainda está em processamento na SEFAZ — aguarde alguns segundos e consulte de novo.' }, st.status === 'autorizado' ? 200 : 409)
      }
    }
    const items = (nota.items || []) as any[]
    if (!items.length) return json({ error: 'Nota sem itens.' }, 400)
    for (const it of items) {
      if (!((parseFloat(it.quantity) || 0) > 0) || !((parseFloat(it.unit_price) || 0) > 0)) {
        return json({ error: `Item "${it.name || '?'}" com quantidade ou valor unitário vazio/zero — corrija antes de emitir.` }, 400)
      }
    }
    const chaveInformada = String(nota.chave_referenciada || '').trim()
    if (chaveInformada && chaveInformada.replace(/\D/g, '').length !== 44) {
      return json({ error: 'A chave da NF referenciada precisa ter 44 dígitos — confira (a informada tem outro tamanho).' }, 400)
    }
    if (nota.exterior && !(nota.di?.numero)) {
      return json({ error: 'Entrada de importação exige o nº da DI/DUImp no bloco Declaração de Importação.' }, 400)
    }

    const agoraA = new Date()
    const dtA = new Date(agoraA.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 19) + '-03:00'
    const csosnPadrao = nota.csosn || '900'
    const importacao = !!nota.exterior          // operação com o exterior → dest estrangeiro
    const cfopPadrao = String(nota.cfop || '').replace(/\D/g, '')

    const itensA: any[] = []
    let nA = 0
    for (const it of items) {
      nA++
      const qtd = parseFloat(it.quantity) || 1
      const vu = parseFloat(it.unit_price) || 0
      const item: any = {
        numero_item: nA,
        codigo_produto: it.sku || String(nA),
        descricao: String(it.name || 'Item').slice(0, 120),
        codigo_ncm: String(it.ncm || '').replace(/\D/g, '') || '84659900',
        cfop: String(it.cfop || cfopPadrao || '5949').replace(/\D/g, ''),
        unidade_comercial: it.unit || 'UN',
        quantidade_comercial: qtd,
        valor_unitario_comercial: vu,
        unidade_tributavel: it.unit || 'UN',
        quantidade_tributavel: qtd,
        valor_unitario_tributavel: vu,
        valor_bruto: Math.round(qtd * vu * 100) / 100,
        icms_origem: importacao ? 1 : (it.origem_importada ? 1 : 0),
        icms_situacao_tributaria: csosnPadrao,
        pis_situacao_tributaria: '07',
        cofins_situacao_tributaria: '07',
      }
      // CFOP 3xxx exige grupo IPI (rejeição 597) — CST 49 "outras entradas".
      // Vale também quando o CFOP de importação foi digitado no preset "Outra".
      if (importacao || String(item.cfop).startsWith('3')) {
        item.ipi_situacao_tributaria = '49'
        item.ipi_codigo_enquadramento_legal = '999'
      }
      // ===== Fase B (17/09/2026): impostos POR ITEM vindos das abas da tela (modelo Bling), só quando preenchidos =====
      const n2 = (v: any) => Math.round((parseFloat(v) || 0) * 100) / 100
      const tem = (v: any) => v !== undefined && v !== null && String(v) !== '' && !isNaN(parseFloat(v))
      if (it.cest) item.cest = String(it.cest).replace(/\D/g, '')
      if (it.gtin && !/sem/i.test(String(it.gtin))) { item.codigo_barras_comercial = String(it.gtin); item.codigo_barras_tributavel = String(it.gtin) }
      if (it.unit_trib) item.unidade_tributavel = String(it.unit_trib)
      if (tem(it.qtd_trib) && parseFloat(it.qtd_trib) > 0) item.quantidade_tributavel = parseFloat(it.qtd_trib)
      if (tem(it.vunit_trib) && parseFloat(it.vunit_trib) > 0) item.valor_unitario_tributavel = parseFloat(it.vunit_trib)
      if (n2(it.frete_item) > 0) item.valor_frete = n2(it.frete_item)
      if (n2(it.seguro_item) > 0) item.valor_seguro = n2(it.seguro_item)
      if (n2(it.outras_item) > 0) item.valor_outras_despesas = n2(it.outras_item)
      if (n2(it.desconto_item) > 0) item.valor_desconto = n2(it.desconto_item)
      if (it.info_adicional) item.informacoes_adicionais_item = String(it.info_adicional).slice(0, 500)
      if (n2(it.aprox_trib_valor) > 0) item.valor_total_tributos = n2(it.aprox_trib_valor)
      // ICMS (Simples: CSOSN). Na importação a Larissa informa base/alíquota/valor (por dentro) — CSOSN 900 aceita esses campos.
      if (it.icms_csosn) item.icms_situacao_tributaria = String(it.icms_csosn)
      if (tem(it.icms_origem)) item.icms_origem = parseInt(it.icms_origem)
      if (n2(it.icms_base) > 0) {
        item.icms_modalidade_base_calculo = tem(it.icms_mod_bc) ? parseInt(it.icms_mod_bc) : 3
        item.icms_base_calculo = n2(it.icms_base)
        item.icms_aliquota = parseFloat(it.icms_aliq) || 0
        item.icms_valor = n2(it.icms_valor)
        if (n2(it.icms_red_bc) > 0) item.icms_percentual_reducao = parseFloat(it.icms_red_bc)
      }
      // IPI
      if (it.ipi_cst) { item.ipi_situacao_tributaria = String(it.ipi_cst); item.ipi_codigo_enquadramento_legal = String(it.ipi_enq || '999') }
      if (n2(it.ipi_base) > 0 || n2(it.ipi_valor) > 0) { item.ipi_base_calculo = n2(it.ipi_base); item.ipi_aliquota = parseFloat(it.ipi_aliq) || 0; item.ipi_valor = n2(it.ipi_valor) }
      // PIS / COFINS
      if (it.pis_cst) item.pis_situacao_tributaria = String(it.pis_cst)
      if (n2(it.pis_base) > 0) { item.pis_base_calculo = n2(it.pis_base); item.pis_aliquota_porcentual = parseFloat(it.pis_aliq) || 0; item.pis_valor = n2(it.pis_valor) }
      if (it.cofins_cst) item.cofins_situacao_tributaria = String(it.cofins_cst)
      if (n2(it.cofins_base) > 0) { item.cofins_base_calculo = n2(it.cofins_base); item.cofins_aliquota_porcentual = parseFloat(it.cofins_aliq) || 0; item.cofins_valor = n2(it.cofins_valor) }
      if (it.pedido_compra) { item.numero_pedido_compra = String(it.pedido_compra).slice(0, 15); if (it.item_pedido_compra) item.numero_item_pedido_compra = parseInt(it.item_pedido_compra) || 1 }
      if (importacao) {
        if (it.ii_base != null) item.ii_base_calculo = parseFloat(it.ii_base) || 0
        if (it.ii_valor != null) item.ii_valor = parseFloat(it.ii_valor) || 0
        if (it.ii_despesas != null) item.ii_despesas_aduaneiras = parseFloat(it.ii_despesas) || 0
        item.ii_valor_iof = parseFloat(it.ii_iof) || 0
        const di = nota.di || {}
        const formaImp = parseInt(di.forma_importacao) || 1
        const cnpjAdq = String(di.cnpj_adquirente || '').replace(/\D/g, '')
        item.documentos_importacao = [{
          numero: di.numero || '',
          data_registro: di.data_registro || nota.data,
          local_desembaraco_aduaneiro: di.local || 'Porto de Santos',
          uf_desembaraco_aduaneiro: di.uf || 'SP',
          data_desembaraco_aduaneiro: di.data_desembaraco || di.data_registro || nota.data,
          via_transporte: parseInt(di.via_transporte) || 1,
          ...(parseFloat(di.valor_afrmm) > 0 ? { valor_afrmm: parseFloat(di.valor_afrmm) } : {}),
          forma_intermedio: formaImp,
          ...(formaImp !== 1 && cnpjAdq.length === 14 ? { cnpj_adquirente: cnpjAdq, uf_terceiro: di.uf_adquirente || 'SP' } : {}),
          codigo_exportador: (di.codigo_exportador || 'EXPORTADOR').slice(0, 60),
          adicoes: [{ numero: parseInt(it.adicao) || 1, numero_sequencial_item: parseInt(it.seq_adicao) || nA, codigo_fabricante_estrangeiro: (it.cod_fabricante || di.codigo_exportador || 'FABRICANTE').slice(0, 60) }],
        }]
      }
      itensA.push(item)
    }

    const payloadA: any = {
      natureza_operacao: (nota.natureza_operacao || 'Outra saida').slice(0, 60),
      data_emissao: dtA,
      data_entrada_saida: dtA,
      tipo_documento: nota.tipo === 'entrada' ? 0 : 1,
      finalidade_emissao: nota.finalidade || 1,
      consumidor_final: 0,
      presenca_comprador: 0,
      modalidade_frete: (parseFloat(nota.frete) || 0) > 0 ? 0 : 9,
      cnpj_emitente: cfg.cnpj_emitente,
      serie: cfg.serie,
      items: itensA,
    }
    // Frete rateado POR ITEM (proporcional, resto no último) — o total da nota
    // precisa ser exatamente o somatório dos itens, senão a SEFAZ rejeita.
    const freteAvulsa = Math.round((parseFloat(nota.frete) || 0) * 100) / 100
    if (freteAvulsa > 0) {
      const somaBruta = itensA.reduce((s, i) => s + i.valor_bruto, 0)
      let acum = 0
      itensA.forEach((i, ix) => {
        const ultimo = ix === itensA.length - 1
        const v = ultimo ? Math.round((freteAvulsa - acum) * 100) / 100 : Math.round((freteAvulsa * i.valor_bruto / somaBruta) * 100) / 100
        acum = Math.round((acum + v) * 100) / 100
        i.valor_frete = v
      })
    }
    // Seguro, outras despesas e desconto informados na NOTA: rateados por item (proporcional, resto no último) — Fase B
    for (const [campoNota, campoItem] of [['seguro', 'valor_seguro'], ['outras_despesas', 'valor_outras_despesas'], ['desconto', 'valor_desconto']] as const) {
      const total = Math.round((parseFloat((nota as any)[campoNota]) || 0) * 100) / 100
      if (total <= 0) continue
      const somaBruta = itensA.reduce((s, i) => s + i.valor_bruto, 0)
      let acum = 0
      itensA.forEach((i, ix) => {
        const ultimo = ix === itensA.length - 1
        const v = ultimo ? Math.round((total - acum) * 100) / 100 : Math.round((total * i.valor_bruto / somaBruta) * 100) / 100
        acum = Math.round((acum + v) * 100) / 100
        i[campoItem] = Math.round(((i[campoItem] || 0) + v) * 100) / 100
      })
    }
    if (nota.informacoes_adicionais) payloadA.informacoes_adicionais_contribuinte = String(nota.informacoes_adicionais).slice(0, 2000)

    // Referência à nota original. Regra 2026 (validada em homologação):
    // devolução (finalidade 4) referencia POR ITEM (chave_acesso_dfe_referenciado)
    // e NÃO pode ter NFref no cabeçalho junto (rejeições 321 e 1010).
    // Demais operações (retorno de conserto etc.) seguem no cabeçalho.
    const chaveRef = String(nota.chave_referenciada || '').replace(/\D/g, '')
    if (chaveRef.length === 44) {
      if ((nota.finalidade || 1) === 4) {
        for (const item of itensA) {
          item.chave_acesso_dfe_referenciado = chaveRef
          item.numero_item_dfe_referenciado = String(item.numero_item)
        }
      } else {
        payloadA.notas_referenciadas = [{ chave_nfe: chaveRef }]
      }
    }

    if (importacao) {
      // Entrada de importação: destinatário = exportador estrangeiro (idDest=3)
      const ex = nota.exterior || {}
      payloadA.local_destino = 3
      payloadA.id_estrangeiro_destinatario = (ex.id_estrangeiro || 'EXTERIOR').slice(0, 20)
      payloadA.nome_destinatario = (ex.nome || 'Exportador').slice(0, 60)
      payloadA.logradouro_destinatario = (ex.endereco || 'Exterior').slice(0, 60)
      payloadA.numero_destinatario = 'S/N'
      payloadA.bairro_destinatario = (ex.cidade || 'Exterior').slice(0, 60)
      payloadA.municipio_destinatario = 'Exterior'
      payloadA.codigo_pais_destinatario = parseInt(ex.pais_codigo) || 1600
      payloadA.pais_destinatario = (ex.pais_nome || 'CHINA, REPUBLICA POPULAR').slice(0, 60)
      payloadA.indicador_inscricao_estadual_destinatario = 9
    } else {
      const { data: contato } = await admin.from('contatos').select('*').eq('id', nota.contato_id).maybeSingle()
      if (!contato) return json({ error: 'Destinatário da nota não encontrado (selecione o contato).' }, 400)
      const docA = String(contato.document || '').replace(/\D/g, '')
      if (!docA) return json({ error: `Contato "${contato.name}" sem CPF/CNPJ no cadastro.` }, 400)
      const isPJA = docA.length === 14
      const ieA = String(contato.state_registration || '').replace(/\D/g, '')
      const isento = /isento/i.test(String(contato.state_registration || '')) || contato.contribuinte_icms === 'isento'
      const naoContribA = contato.contribuinte_icms === 'nao_contribuinte'
      if (isPJA && !ieA && !isento && !naoContribA) {
        return json({ error: `Contato PJ "${contato.name}" sem Inscrição Estadual (preencha em Contatos ou marque Isento).` }, 400)
      }
      payloadA.local_destino = (contato.state || 'SP') === 'SP' ? 1 : 2
      payloadA.nome_destinatario = contato.name
      payloadA.logradouro_destinatario = contato.address || 'Nao informado'
      payloadA.numero_destinatario = contato.address_number || 'S/N'
      payloadA.bairro_destinatario = contato.neighborhood || 'Centro'
      payloadA.municipio_destinatario = contato.city || 'Sorocaba'
      payloadA.uf_destinatario = contato.state || 'SP'
      payloadA.cep_destinatario = String(contato.zip_code || '').replace(/\D/g, '') || '18087149'
      payloadA.pais_destinatario = 'Brasil'
      if (isPJA) {
        payloadA.cnpj_destinatario = docA
        if (naoContribA) {
          payloadA.indicador_inscricao_estadual_destinatario = 9
        } else if (ieA && !isento) {
          payloadA.inscricao_estadual_destinatario = ieA
          payloadA.indicador_inscricao_estadual_destinatario = 1
        } else {
          payloadA.indicador_inscricao_estadual_destinatario = 2
        }
      } else {
        payloadA.cpf_destinatario = docA
        payloadA.indicador_inscricao_estadual_destinatario = 9
      }
    }
    // indIEDest=9 → consumidor_final=1 (rejeição "não contribuinte exige consumidor final")
    if (!importacao && payloadA.indicador_inscricao_estadual_destinatario === 9) payloadA.consumidor_final = 1

    const rA = await fetch(`${base}/v2/nfe?ref=${refA}`, {
      method: 'POST',
      headers: { Authorization: focusAuth(cfg.token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadA),
    })
    const respA = await rA.json()
    await admin.from('nfe_avulsas').update({
      nfe_ref: refA,
      nfe_ambiente: cfg.ambiente,
      nfe_serie: String(cfg.serie),
      nfe_status: respA.status || respA.codigo || 'erro',
      nfe_mensagem: (respA.mensagem_sefaz || respA.mensagem || '').slice(0, 300),
    }).eq('id', avulsaId)
    return json({ ref: refA, ...respA }, rA.ok ? 200 : 400)
  }
  // ================= fim NF avulsa =================

  const { data: order } = await admin.from('sale_orders').select('*').eq('id', orderId).maybeSingle()
  if (!order) return json({ error: 'Pedido não encontrado.' }, 404)

  const ref = order.nfe_ref || `pedido-${orderId}`

  // ---------- STATUS ----------
  if (acao === 'status') {
    const r = await fetch(`${base}/v2/nfe/${ref}`, { headers: { Authorization: focusAuth(cfg.token) } })
    const st = await r.json()
    await admin.from('sale_orders').update({
      nfe_status: st.status || null,
      nfe_chave: st.chave_nfe || null,
      nfe_numero: st.numero || null,
      nfe_serie: st.serie || null,
      nfe_mensagem: (st.mensagem_sefaz || st.mensagem || '').slice(0, 300),
    }).eq('id', orderId)
    return json(st)
  }

  // ---------- DANFE / XML (proxy autenticado) ----------
  if (acao === 'danfe' || acao === 'xml') {
    const r = await fetch(`${base}/v2/nfe/${ref}`, { headers: { Authorization: focusAuth(cfg.token) } })
    const st = await r.json()
    const caminho = acao === 'danfe' ? st.caminho_danfe : st.caminho_xml_nota_fiscal
    if (!caminho) return json({ error: 'Arquivo ainda não disponível.', status: st.status }, 404)
    const file = await fetch(`${base}${caminho}`, { headers: { Authorization: focusAuth(cfg.token) } })
    const buf = await file.arrayBuffer()
    return new Response(buf, {
      headers: {
        ...cors,
        'Content-Type': acao === 'danfe' ? 'application/pdf' : 'application/xml',
        'Content-Disposition': `inline; filename="nfe-${st.numero || ref}.${acao === 'danfe' ? 'pdf' : 'xml'}"`,
      },
    })
  }

  // ---------- EMITIR ----------
  if (order.nfe_status === 'autorizado') return json({ error: 'Este pedido já tem NF-e autorizada.' }, 409)
  if (order.nfe_status === 'processando_autorizacao') {
    const rSt = await fetch(`${base}/v2/nfe/${ref}`, { headers: { Authorization: focusAuth(cfg.token) } })
    const st = await rSt.json()
    if (['autorizado', 'processando_autorizacao'].includes(st.status)) {
      await admin.from('sale_orders').update({
        nfe_status: st.status, nfe_chave: st.chave_nfe || null,
        nfe_numero: st.numero || null, nfe_serie: st.serie || null,
        nfe_mensagem: (st.mensagem_sefaz || st.mensagem || '').slice(0, 300),
      }).eq('id', orderId)
      return json(st.status === 'autorizado' ? st : { error: 'A NF-e ainda está em processamento na SEFAZ — aguarde alguns segundos.' }, st.status === 'autorizado' ? 200 : 409)
    }
  }
  if (!['invoiced', 'shipped', 'delivered'].includes(order.status)) {
    return json({ error: 'Só é possível emitir NF-e de pedido faturado.' }, 400)
  }

  const { data: contato } = await admin.from('contatos').select('*').eq('id', order.customer_id).maybeSingle()
  if (!contato) return json({ error: 'Cliente do pedido não encontrado.' }, 400)
  const doc = String(contato.document || '').replace(/\D/g, '')
  if (!doc) return json({ error: `Cliente "${contato.name}" sem CPF/CNPJ no cadastro.` }, 400)
  const isPJ = doc.length === 14
  const ie = String(contato.state_registration || '').replace(/\D/g, '')
  // Isento vale pelo texto "ISENTO" no campo OU pelo seletor Contribuinte ICMS;
  // "não contribuinte" (indicador 9) também dispensa IE.
  const ieIsento = /isento/i.test(String(contato.state_registration || '')) || contato.contribuinte_icms === 'isento'
  const naoContribuinte = contato.contribuinte_icms === 'nao_contribuinte'
  if (isPJ && !ie && !ieIsento && !naoContribuinte) {
    return json({ error: `Cliente PJ "${contato.name}" sem Inscrição Estadual no cadastro (a SEFAZ rejeita — preencha em Contatos, ou marque Isento/Não contribuinte).` }, 400)
  }

  const { data: cfgTrib } = await admin.from('config_tributaria').select('*').limit(1).maybeSingle()

  const itens: any[] = []
  let n = 0
  for (const item of (order.items || [])) {
    n++
    const { data: p } = item.product_id
      ? await admin.from('products').select('*').eq('id', item.product_id).maybeSingle()
      : { data: null }
    itens.push({
      numero_item: n,
      codigo_produto: p?.sku || String(n),
      descricao: (p?.name || item.name || 'Item').slice(0, 120),
      codigo_ncm: (p?.ncm || '').replace(/\D/g, '') || '84659900',
      // CFOP acompanha o destino: 5102 dentro de SP, 6102 interestadual
      cfop: (contato.state || 'SP') === 'SP' ? '5102' : '6102',
      unidade_comercial: p?.unit || 'UN',
      quantidade_comercial: item.quantity || 1,
      valor_unitario_comercial: item.unit_price || 0,
      unidade_tributavel: p?.unit || 'UN',
      quantidade_tributavel: item.quantity || 1,
      valor_unitario_tributavel: item.unit_price || 0,
      valor_bruto: Math.round((item.quantity || 1) * (item.unit_price || 0) * 100) / 100,
      icms_origem: p?.origin_country && p.origin_country !== 'Brasil' ? 1 : 0,
      icms_situacao_tributaria: '102',
      pis_situacao_tributaria: '07',
      cofins_situacao_tributaria: '07',
    })
  }
  if (!itens.length) return json({ error: 'Pedido sem itens.' }, 400)

  const agora = new Date()
  const dataEmissao = new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 19) + '-03:00'

  const payload: any = {
    natureza_operacao: 'Venda de mercadoria',
    data_emissao: dataEmissao,
    tipo_documento: 1,
    finalidade_emissao: 1,
    consumidor_final: (isPJ && !naoContribuinte) ? 0 : 1,
    presenca_comprador: order.channel === 'mercado_livre' || order.channel === 'woocommerce' ? 2 : 1,
    modalidade_frete: [0, 1, 2, 3, 4, 9].includes(order.frete_por_conta) ? order.frete_por_conta : 9,
    local_destino: (contato.state || 'SP') === 'SP' ? 1 : 2,
    cnpj_emitente: cfg.cnpj_emitente,
    serie: cfg.serie,
    nome_destinatario: contato.name,
    logradouro_destinatario: contato.address || 'Nao informado',
    numero_destinatario: contato.address_number || 'S/N',
    bairro_destinatario: contato.neighborhood || 'Centro',
    municipio_destinatario: contato.city || 'Sorocaba',
    uf_destinatario: contato.state || 'SP',
    cep_destinatario: String(contato.zip_code || '').replace(/\D/g, '') || '18087149',
    pais_destinatario: 'Brasil',
    items: itens,
  }
  // Frete e desconto RATEADOS por item (proporcional ao valor bruto, resto no
  // último) — a SEFAZ exige que o total seja o somatório dos itens.
  const ratear = (totalRs: number, campo: string) => {
    const alvo = Math.round((totalRs || 0) * 100) / 100
    if (alvo <= 0) return
    const somaBruta = itens.reduce((s, i) => s + i.valor_bruto, 0)
    if (somaBruta <= 0) return
    let acum = 0
    itens.forEach((i, ix) => {
      const ultimo = ix === itens.length - 1
      const v = ultimo ? Math.round((alvo - acum) * 100) / 100 : Math.round((alvo * i.valor_bruto / somaBruta) * 100) / 100
      acum = Math.round((acum + v) * 100) / 100
      i[campo] = v
    })
  }
  ratear(order.shipping_cost, 'valor_frete')
  ratear(order.discount, 'valor_desconto')
  if (isPJ) {
    payload.cnpj_destinatario = doc
    if (naoContribuinte) {
      payload.indicador_inscricao_estadual_destinatario = 9
    } else if (ie && !ieIsento) {
      payload.inscricao_estadual_destinatario = ie
      payload.indicador_inscricao_estadual_destinatario = 1
    } else {
      payload.indicador_inscricao_estadual_destinatario = 2
    }
  } else {
    payload.cpf_destinatario = doc
    payload.indicador_inscricao_estadual_destinatario = 9
  }

  // Transportadora / volumes / entrega em endereço diferente (Larissa, 20/08/2026)
  if (order.transportadora) payload.nome_transportador = String(order.transportadora).slice(0, 60)
  if (order.volumes_qtd > 0) {
    payload.volumes = [{
      quantidade: order.volumes_qtd,
      especie: 'volumes',
      ...(order.peso_bruto > 0 ? { peso_bruto: order.peso_bruto } : {}),
    }]
  }
  const ee = order.endereco_entrega || {}
  if (order.entrega_diferente && ee.endereco) {
    if (isPJ) payload.cnpj_entrega = doc
    else payload.cpf_entrega = doc
    if (ee.nome) payload.nome_entrega = String(ee.nome).slice(0, 60)
    payload.logradouro_entrega = String(ee.endereco).slice(0, 60)
    payload.numero_entrega = ee.numero || 'S/N'
    if (ee.complemento) payload.complemento_entrega = String(ee.complemento).slice(0, 60)
    payload.bairro_entrega = ee.bairro || 'Centro'
    payload.municipio_entrega = ee.cidade || contato.city || 'Sorocaba'
    payload.uf_entrega = ee.uf || contato.state || 'SP'
    if (ee.cep) payload.cep_entrega = String(ee.cep).replace(/\D/g, '')
  }

  const r = await fetch(`${base}/v2/nfe?ref=${ref}`, {
    method: 'POST',
    headers: { Authorization: focusAuth(cfg.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const resp = await r.json()

  await admin.from('sale_orders').update({
    nfe_ref: ref,
    nfe_ambiente: cfg.ambiente,
    nfe_serie: String(cfg.serie),
    nfe_status: resp.status || resp.codigo || 'erro',
    nfe_mensagem: (resp.mensagem_sefaz || resp.mensagem || '').slice(0, 300),
  }).eq('id', orderId)

  return json({ ref, ...resp }, r.ok ? 200 : 400)
})
