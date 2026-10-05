#!/usr/bin/env python3
"""Mercado Livre no ERP — MODO DE TESTE (ordem do Mauricio, 02/10/2026; virada só em jan/2027).

Lê (SOMENTE LEITURA) os pedidos das duas contas do Mercado Livre e grava em public.ml_pedidos:
taxa e frete reais, dados fiscais do comprador, casamento de cada item com o produto do ERP
(products.codigos_origem) e, para conferência, o pedido e a nota que o Bling emitiu para a mesma venda.
NÃO cria pedido de venda, NÃO move estoque, NÃO emite nota, NÃO escreve no Mercado Livre nem no Bling.

Uso: erp-ml-pedidos.py [--desde AAAA-MM-DD] [--kits]     (padrão: últimos 20 dias)
"""
import sys, json, time, datetime, subprocess
sys.path.insert(0, "/root/rotinas"); sys.path.insert(0, "/root/precificador-unificado/scripts")
import ml_ro, bling_ro

LOG = "/root/rotinas/logs/erp-ml-pedidos.log"
def log(*a):
    s = datetime.datetime.now().strftime("%d/%m %H:%M ") + " ".join(str(x) for x in a)
    print(s, flush=True)
    try: open(LOG, "a").write(s + "\n")
    except Exception: pass

def sql(q):
    c = subprocess.run("docker ps --format '{{.Names}}'|grep supabase_db", shell=True, capture_output=True, text=True).stdout.strip()
    r = subprocess.run(["docker", "exec", "-i", c, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-AtF", "\t"], input=q, capture_output=True, text=True)
    if r.returncode != 0: raise SystemExit("ERRO SQL: " + r.stderr[:800])
    return r.stdout
def lit(v):
    if v is None or v == "": return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return repr(round(v, 4))
    if isinstance(v, (dict, list)): return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"

args = sys.argv[1:]
desde = args[args.index("--desde") + 1] if "--desde" in args else (datetime.date.today() - datetime.timedelta(days=20)).isoformat()
CONTAS = ("router", "saber")

def garantir_bling(emp):
    import urllib.request
    t, exp = bling_ro.psql(f"select access_token, expires_at from prec_bling_token where empresa_id='{bling_ro.EMP[emp]}'").strip().split("\t")
    if time.time() * 1000 > float(exp) - 120000:
        req = urllib.request.Request("https://precificador.robooster.com.br/functions/testBlingEstoque",
            data=json.dumps({"empresa_id": bling_ro.EMP[emp], "sku": "0"}).encode(), headers={"Content-Type": "application/json"}, method="POST")
        try: urllib.request.urlopen(req, timeout=90).read()
        except Exception as e: log("aviso: token Bling", emp, str(e)[:80])

# ------------------------------------------------------------------ kits (composições do Bling)
if "--kits" in args:
    for emp in CONTAS:
        garantir_bling(emp)
        ativos = bling_ro.produtos(emp, 1)
        cod = {x["id"]: str(x.get("codigo") or "").strip() for x in ativos}
        n = 0
        for x in ativos:
            if x.get("formato") != "E": continue
            d = bling_ro.get(emp, f"/produtos/{x['id']}").get("data") or {}; time.sleep(0.36)
            comps = []
            for c in ((d.get("estrutura") or {}).get("componentes") or []):
                pid = (c.get("produto") or {}).get("id")
                sku = cod.get(pid)
                if sku is None:
                    dd = bling_ro.get(emp, f"/produtos/{pid}").get("data") or {}; time.sleep(0.36)
                    sku = str(dd.get("codigo") or "").strip()
                comps.append({"sku": sku, "bling_id": pid, "quantidade": float(c.get("quantidade") or 0)})
            sql(f"insert into product_kits (sku_kit, conta, nome, componentes, bling_id, updated_date) values ({lit(str(x.get('codigo')).strip())}, {lit(emp)}, {lit(x.get('nome'))}, {lit(comps)}, {x['id']}, now()) "
                "on conflict (sku_kit, conta) do update set nome=excluded.nome, componentes=excluded.componentes, bling_id=excluded.bling_id, updated_date=now();")
            n += 1
        log(emp, "kits gravados:", n)

# ------------------------------------------------------------------ mapa SKU do anúncio -> produto do ERP
prod = {"router": {}, "saber": {}, "sku": {}}
sem_ncm = set()
for l in sql("select id, sku, coalesce(codigos_origem::text,''), coalesce(ncm,'') from products;").split("\n"):
    if not l.strip(): continue
    pid, sku, o, ncm = (l.split("\t") + ["", "", ""])[:4]
    if not ncm.strip(): sem_ncm.add(pid)
    prod["sku"][sku.lower()] = (pid, sku)
    if o:
        o = json.loads(o)
        for emp in CONTAS:
            if o.get(emp): prod[emp][str(o[emp]["sku"]).lower()] = (pid, sku)
kits = {}
for l in sql("select sku_kit, conta, componentes::text from product_kits;").split("\n"):
    if l.strip():
        k, c, comp = l.split("\t"); kits[(c, k.lower())] = json.loads(comp)

def casar(emp, sku):
    """-> (product_id, product_sku) ou None"""
    if not sku: return None
    sku = sku.lower()   # o anúncio às vezes traz o código em minúsculas (3018pro × 3018PRO)
    return prod[emp].get(sku) or prod["sku"].get(sku)

# ------------------------------------------------------------------ Bling: pedidos e notas do período (conferência)
bling = {}
for emp in CONTAS:
    garantir_bling(emp)
    p = 1
    while True:
        d = bling_ro.get(emp, f"/pedidos/vendas?dataInicial={desde}&dataFinal={datetime.date.today().isoformat()}&pagina={p}&limite=100")
        it = d.get("data", []) if isinstance(d, dict) else []
        for x in it:
            nl = str(x.get("numeroLoja") or "").strip()
            if nl: bling[(emp, nl)] = x
        if len(it) < 100: break
        p += 1; time.sleep(0.4)
log("Bling: pedidos de loja no período:", len(bling))

def bling_nf(emp, pedido_id):
    d = bling_ro.get(emp, f"/pedidos/vendas/{pedido_id}").get("data") or {}; time.sleep(0.36)
    nfid = (d.get("notaFiscal") or {}).get("id")
    if not nfid: return None, None, None
    n = bling_ro.get(emp, f"/nfe/{nfid}").get("data") or {}; time.sleep(0.36)
    return str(n.get("numero") or ""), n.get("chaveAcesso"), str(n.get("situacao") or "")

# ------------------------------------------------------------------ Mercado Livre
tot = 0
for emp in CONTAS:
    me = ml_ro.get(emp, "/users/me")
    if "_erro" in me: log("ML", emp, "sem acesso:", me); continue
    uid = me["id"]; off = 0; pedidos = []
    while True:
        o = ml_ro.get(emp, f"/orders/search?seller={uid}&order.date_created.from={desde}T00:00:00.000-03:00&sort=date_desc&limit=50&offset={off}")
        if "_erro" in o: log("ML", emp, "erro na busca:", o); break
        pedidos += o.get("results", [])
        off += 50
        if off >= (o.get("paging") or {}).get("total", 0): break
    log("ML", emp, me.get("nickname"), "pedidos desde", desde + ":", len(pedidos), "| conexão:", ml_ro.ORIGEM.get(emp))
    for x in pedidos:
        oid = str(x["id"]); sh_id = (x.get("shipping") or {}).get("id")
        frete_v = frete_c = None; logistica = None
        if sh_id:
            c = ml_ro.get(emp, f"/shipments/{sh_id}/costs")
            if "_erro" not in c:
                frete_v = sum(float(s.get("cost") or 0) for s in c.get("senders", []))
                frete_c = float((c.get("receiver") or {}).get("cost") or 0)
            s = ml_ro.get(emp, f"/shipments/{sh_id}")
            if "_erro" not in s: logistica = s.get("logistic_type") or (s.get("logistic") or {}).get("type")
        b = ml_ro.get(emp, f"/orders/{oid}/billing_info")
        comprador = None; sem_permissao = b.get("_erro") == 403
        if "_erro" not in b:
            bi = b.get("billing_info") or {}
            comprador = {"doc_tipo": bi.get("doc_type"), "doc": bi.get("doc_number")}
            for a in bi.get("additional_info") or []: comprador[str(a.get("type", "")).lower()] = a.get("value")
        itens = []; pend = []; taxa = 0.0; tipo = None
        for it in x.get("order_items", []):
            i = it.get("item") or {}; sku = (i.get("seller_sku") or i.get("seller_custom_field") or "").strip()
            q = float(it.get("quantity") or 0); taxa += float(it.get("sale_fee") or 0) * q; tipo = tipo or it.get("listing_type_id")
            reg = {"item_id": i.get("id"), "titulo": i.get("title"), "sku_anuncio": sku, "variation_id": i.get("variation_id"), "qtd": q,
                   "preco": float(it.get("unit_price") or 0), "taxa": float(it.get("sale_fee") or 0), "product_id": None, "product_sku": None, "kit": False}
            m = casar(emp, sku)
            if m:
                reg["product_id"], reg["product_sku"] = m
                if m[0] in sem_ncm: pend.append(f"produto {m[1]} sem NCM no cadastro (não emite nota)")
            elif (emp, sku.lower()) in kits:
                reg["kit"] = True; reg["componentes"] = []
                for c in kits[(emp, sku.lower())]:
                    mc = casar(emp, c["sku"])
                    reg["componentes"].append({"sku": c["sku"], "quantidade": c["quantidade"], "product_id": mc[0] if mc else None})
                    if not mc: pend.append(f"peça {c['sku']} do kit {sku} sem cadastro no ERP")
            elif not sku: pend.append(f"anúncio {i.get('id')} sem SKU")
            else: pend.append(f"SKU {sku} sem cadastro no ERP")
            itens.append(reg)
        if sem_permissao: pend.append("sem dados fiscais do comprador: o aplicativo desta conta não tem a permissão de faturamento no Mercado Livre")
        elif not comprador or not comprador.get("doc"): pend.append("sem documento do comprador")
        bp = bling.get((emp, oid)) or bling.get((emp, str(x.get("pack_id") or "")))
        bnum = btot = bsit = bid = nfn = nfc = nfs = None
        if bp:
            bid, bnum, btot, bsit = str(bp["id"]), str(bp.get("numero")), float(bp.get("total") or 0), str((bp.get("situacao") or {}).get("id"))
            nfn, nfc, nfs = bling_nf(emp, bp["id"])
        total = float(x.get("total_amount") or 0)
        liquido = round(total - taxa - (frete_v or 0), 2)
        # ---- recebimento no Mercado Pago: o que realmente foi creditado, quando liberou, estornos e cobranças
        mp_liq = mp_est = 0.0; mp_lib = None; mp_liberado = None; mp_st = []; cobr = {}; mp_ok = False
        for pg in x.get("payments", []):
            if pg.get("status") in ("rejected", "cancelled") or not pg.get("id"): continue
            d = ml_ro.mp_get(emp, f"/v1/payments/{pg['id']}")
            if "_erro" in d: continue
            mp_ok = True
            mp_liq += float((d.get("transaction_details") or {}).get("net_received_amount") or 0)
            mp_est += float(d.get("transaction_amount_refunded") or 0)
            mp_st.append(d.get("status") or "")
            if d.get("money_release_date") and (mp_lib is None or d["money_release_date"] > mp_lib): mp_lib = d["money_release_date"]
            lib = d.get("money_release_status") == "released"
            mp_liberado = lib if mp_liberado is None else (mp_liberado and lib)
            for c in d.get("charges_details") or []:
                k = c.get("name") or c.get("type") or "outro"
                cobr[k] = round(cobr.get(k, 0) + float((c.get("amounts") or {}).get("original") or 0) - float((c.get("amounts") or {}).get("refunded") or 0), 2)
        # Com o extrato do Mercado Pago em mãos, vale o que ELE cobrou, não a estimativa: a taxa é a de venda mais a de
        # processamento, e o frete nosso é o que sobra (inclui a parte do frete do comprador que o ML cobra do vendedor
        # e exclui juros de parcelamento, que entram e saem). Pedido devolvido fica na estimativa.
        if mp_ok and mp_est == 0 and x.get("status") != "cancelled":
            taxa = round(cobr.get("ml_sale_fee", 0) + cobr.get("mp_processing_fee", 0), 2)
            frete_v = round(total - taxa - mp_liq, 2)
            liquido = round(mp_liq, 2)
        alertas = []
        if "in_mediation" in mp_st: alertas.append("reclamação em mediação no Mercado Livre")
        if "charged_back" in mp_st: alertas.append("contestação de cartão (chargeback)")
        if "refunded" in mp_st: alertas.append("pagamento devolvido ao comprador")
        elif mp_est > 0: alertas.append(f"devolução parcial de R$ {mp_est:.2f}".replace(".", ","))
        cols = dict(id=oid, conta=emp, ml_user_id=uid, pack_id=str(x.get("pack_id") or "") or None, shipment_id=str(sh_id) if sh_id else None, status=x.get("status"),
                    status_detalhe=json.dumps(x.get("status_detail")) if x.get("status_detail") else None, data_pedido=x.get("date_created"), data_fechado=x.get("date_closed"),
                    total=total, pago=float(x.get("paid_amount") or 0), taxa_ml=round(taxa, 2), frete_vendedor=frete_v, frete_comprador=frete_c, liquido=liquido,
                    tipo_anuncio=tipo, logistica=logistica, comprador_apelido=(x.get("buyer") or {}).get("nickname"), comprador=comprador, itens=itens,
                    mapeado=not any("sem cadastro" in p or "sem SKU" in p for p in pend), pendencias="; ".join(pend) or None,
                    pagamentos=[{k: p.get(k) for k in ("id", "status", "date_approved", "transaction_amount", "total_paid_amount", "payment_type", "installments")} for p in x.get("payments", [])],
                    bling_pedido_id=bid, bling_numero=bnum, bling_total=btot, bling_situacao=bsit, bling_nf_numero=nfn, bling_nf_chave=nfc, bling_nf_situacao=nfs, bruto=x,
                    mp_liquido=round(mp_liq, 2) if mp_ok else None, mp_status=",".join(sorted(set(mp_st))) or None, mp_liberacao=mp_lib,
                    mp_liberado=mp_liberado, mp_estornado=round(mp_est, 2) if mp_ok else None, mp_cobrancas=cobr or None, mp_alerta="; ".join(alertas) or None)
        keys = list(cols)
        vals = [lit(cols[k]) if not (k in ("frete_vendedor", "frete_comprador") and cols[k] == 0) else "0" for k in keys]
        sql(f"insert into ml_pedidos ({', '.join(keys)}, updated_date) values ({', '.join(vals)}, now()) on conflict (id) do update set "
            + ", ".join(f"{k}=excluded.{k}" for k in keys if k != "id") + ", updated_date=now();")
        tot += 1
# Compra com vários itens (carrinho) = vários pedidos com UM envio só: o frete vale uma vez.
sql("""update ml_pedidos p set frete_vendedor=0, frete_comprador=0, liquido=round(total - coalesce(taxa_ml,0), 2), updated_date=now()
        where shipment_id is not null and mp_liquido is null and exists (select 1 from ml_pedidos q where q.shipment_id=p.shipment_id and q.id<p.id);""")
log("gravados/atualizados:", tot)
# venda devolvida/cancelada com nota autorizada → rascunho da NF-e de devolução em Notas Fiscais (03/10/2026)
import subprocess as _sp; _sp.run(["python3", "/root/rotinas/erp-devolucoes-nf.py"])

# ---- AVISO ESTOQUE ZERO (05/10/2026, achado do checkup): venda paga de item sem cadastro ou com estoque 0 no ERP
# avisa o Mauricio no WhatsApp uma vez por pedido (estado em state/ml-aviso-estoque.json).
try:
    import json as _json, os as _os, urllib.request as _ur
    _ST = "/root/rotinas/state/ml-aviso-estoque.json"
    _avisados = set(_json.load(open(_ST))) if _os.path.exists(_ST) else set()
    _env = dict(l.strip().split("=", 1) for l in open("/root/atendimento/.env") if "=" in l and not l.startswith("#"))
    _rows = [l.split("\t") for l in sql(
        "select p.id, p.conta, to_char(p.data_pedido at time zone 'America/Sao_Paulo','DD/MM HH24:MI'), coalesce(i->>'sku_anuncio', i->>'product_sku',''), "
        "left(coalesce(i->>'titulo',''),50), coalesce(pr.stock_quantity, -1) "
        "from ml_pedidos p, jsonb_array_elements(p.itens) i left join products pr on pr.id = i->>'product_id' "
        "where p.status = 'paid' and p.data_pedido >= now() - interval '3 days' and coalesce(pr.stock_quantity, -1) <= 0;").split("\n") if l.strip()]
    _novos = [r for r in _rows if r[0] + ":" + r[3] not in _avisados]
    if _novos:
        _txt = "📦 ERP — venda no Mercado Livre de item SEM estoque no ERP:\n" + "\n".join(
            f"• {r[2]} {r[1].upper()} · {r[3]} {r[4]} → " + ("sem cadastro no ERP" if r[5] == "-1" else "estoque 0 no ERP/Bling") for r in _novos[:8])
        _txt += "\n\nSe o produto existe de verdade, acerte o estoque no Bling (o ERP espelha às 05:50). Se não existe, pause o anúncio."
        _req = _ur.Request("https://evo.robooster.com.br/message/sendText/mauricio", data=_json.dumps({"number": "5515998522350", "text": _txt}).encode(),
                           headers={"Content-Type": "application/json", "apikey": _env["EVO_API_KEY"]})
        try: _ur.urlopen(_req, timeout=20); log(f"aviso de estoque zero enviado: {len(_novos)} item(ns)")
        except Exception as e: log("aviso de estoque zero falhou:", e)
        _avisados |= {r[0] + ":" + r[3] for r in _novos}
        _json.dump(sorted(_avisados), open(_ST, "w"))
except Exception as e:
    log("bloco de aviso de estoque zero falhou:", e)
