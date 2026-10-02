#!/usr/bin/env python3
"""Nota de TESTE (homologação, sem valor fiscal) para as vendas do Mercado Livre já prontas no ERP — 02/10/2026.

Para cada venda paga e sem pendência em ml_pedidos: monta a NF-e do jeito que o ERP emite (mesmas regras da função
emitir-nfe), envia ao Focus NFe **somente no ambiente de homologação**, guarda o resultado e compara com o XML da nota
real que o Bling emitiu para a mesma venda. Não cria pedido de venda, não move estoque, não escreve no ML nem no Bling.

Uso: erp-ml-nfe-teste.py [--so-comparar] [--venda <chave>] [--max N]
"""
import sys, json, time, datetime, subprocess, base64, urllib.request, re, xml.etree.ElementTree as ET
sys.path.insert(0, "/root/rotinas"); sys.path.insert(0, "/root/precificador-unificado/scripts")
import bling_ro

FOCUS = "https://homologacao.focusnfe.com.br"      # FIXO: este script nunca fala com a produção
UF_EMITENTE = "SP"
args = sys.argv[1:]
SO_COMPARAR = "--so-comparar" in args
SO_VENDA = args[args.index("--venda") + 1] if "--venda" in args else None
MAX = int(args[args.index("--max") + 1]) if "--max" in args else 100

def sql(q):
    c = subprocess.run("docker ps --format '{{.Names}}'|grep supabase_db", shell=True, capture_output=True, text=True).stdout.strip()
    r = subprocess.run(["docker", "exec", "-i", c, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-AtF", "\t"], input=q, capture_output=True, text=True)
    if r.returncode != 0: raise SystemExit("ERRO SQL: " + r.stderr[:600])
    return r.stdout
def lit(v):
    if v is None or v == "": return "null"
    if isinstance(v, (int, float)): return repr(round(v, 4))
    if isinstance(v, (dict, list)): return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"

cfg = sql("select token, serie, cnpj_emitente from nfe_config where ambiente='homologacao' limit 1;").strip().split("\t")
if len(cfg) != 3 or not cfg[0]: raise SystemExit("sem configuração de homologação em nfe_config")
TOKEN, SERIE, CNPJ = cfg
AUTH = "Basic " + base64.b64encode((TOKEN + ":").encode()).decode()

def focus(metodo, caminho, corpo=None):
    req = urllib.request.Request(FOCUS + caminho, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Authorization": AUTH, "Content-Type": "application/json"}, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or "{}")
        except Exception: return e.code, {}

# ------------------------------------------------------------------ vendas prontas
linhas = [l for l in sql("select row_to_json(t)::text from (select id, conta, shipment_id, status, total, frete_comprador, comprador, itens, pendencias, bling_pedido_id, bling_nf_numero, nfe_teste_status, data_pedido from ml_pedidos order by data_pedido) t;").split("\n") if l.strip()]
vendas = {}
for l in linhas:
    p = json.loads(l); k = p["shipment_id"] or p["id"]
    v = vendas.setdefault(k, {"chave": k, "conta": p["conta"], "pedidos": [], "itens": [], "frete": 0.0, "comprador": p["comprador"], "pend": [], "canc": False, "bling_pedido": p["bling_pedido_id"], "status_teste": p["nfe_teste_status"], "data": p["data_pedido"]})
    v["pedidos"].append(p["id"]); v["itens"] += p["itens"] or []; v["frete"] += float(p["frete_comprador"] or 0)
    if p["pendencias"]: v["pend"].append(p["pendencias"])
    if p["status"] == "cancelled": v["canc"] = True
prontas = [v for v in vendas.values() if not v["canc"] and not v["pend"] and (not SO_VENDA or v["chave"] == SO_VENDA)]
print(f"vendas prontas: {len(prontas)}")

prods = {}
for l in sql("select id, sku, name, coalesce(ncm,''), coalesce(unit,'UN'), coalesce(origin_country,'') from products;").split("\n"):
    if l.strip():
        a = (l.split("\t") + [""] * 6)[:6]; prods[a[0]] = dict(sku=a[1], name=a[2], ncm=a[3], unit=a[4] or "UN", origem=a[5])

def montar(v):
    c = v["comprador"] or {}
    doc = re.sub(r"\D", "", str(c.get("doc") or c.get("doc_number") or ""))
    pj = len(doc) == 14
    uf = (str(c.get("state_code") or "")[-2:] or "SP").upper()
    nome = (c.get("business_name") if pj else None) or " ".join(x for x in [c.get("first_name"), c.get("last_name")] if x) or c.get("business_name") or "Consumidor"
    # Regras da venda pelo Mercado Livre, iguais às das notas que o Bling emite hoje (conferido no XML em 02/10/2026):
    #  - natureza "Venda de mercadoria para consumidor final"; consumidor final = 1 sempre;
    #  - CFOP 5102 dentro de SP; fora de SP 6108 para quem não é contribuinte e 6102 para contribuinte com IE;
    #  - frete por conta de terceiros (2) e SEM valor de frete na nota: o frete do Mercado Envios não é receita nossa.
    contribuinte = pj and bool(re.sub(r"\D", "", str(c.get("state_registration") or "")))
    itens = []
    for n, i in enumerate(v["itens"], 1):
        p = prods.get(i.get("product_id") or "", {})
        q = float(i["qtd"]); pu = float(i["preco"])
        itens.append({"numero_item": n, "codigo_produto": p.get("sku") or str(n), "descricao": (p.get("name") or i.get("titulo") or "Item")[:120],
            "codigo_ncm": re.sub(r"\D", "", p.get("ncm") or "") or "84659900", "cfop": "5102" if uf == UF_EMITENTE else ("6102" if contribuinte else "6108"),
            "unidade_comercial": p.get("unit") or "UN", "quantidade_comercial": q, "valor_unitario_comercial": pu,
            "unidade_tributavel": p.get("unit") or "UN", "quantidade_tributavel": q, "valor_unitario_tributavel": pu,
            "valor_bruto": round(q * pu, 2), "icms_origem": 1 if (p.get("origem") and p.get("origem") != "Brasil") else 0,
            "icms_situacao_tributaria": "102", "pis_situacao_tributaria": "07", "cofins_situacao_tributaria": "07"})
    frete = 0.0   # ver regra acima; o frete combinado por fora do Mercado Livre é caso à parte (pedido "sem envio")
    if frete > 0:
        soma = sum(i["valor_bruto"] for i in itens); acum = 0.0
        for ix, i in enumerate(itens):
            val = round(frete - acum, 2) if ix == len(itens) - 1 else round(frete * i["valor_bruto"] / soma, 2)
            acum = round(acum + val, 2); i["valor_frete"] = val
    ie = re.sub(r"\D", "", str(c.get("state_registration") or ""))
    agora = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=3)
    pay = {"natureza_operacao": "Venda de mercadoria para consumidor final", "data_emissao": agora.strftime("%Y-%m-%dT%H:%M:%S") + "-03:00", "tipo_documento": 1,
        "finalidade_emissao": 1, "consumidor_final": 1, "presenca_comprador": 2, "modalidade_frete": 2 if v["chave"] not in v["pedidos"] else 9,
        "local_destino": 1 if uf == UF_EMITENTE else 2, "cnpj_emitente": CNPJ, "serie": SERIE, "nome_destinatario": nome[:60],
        "logradouro_destinatario": (c.get("street_name") or "Nao informado")[:60], "numero_destinatario": str(c.get("street_number") or "S/N")[:10],
        "bairro_destinatario": (c.get("neighborhood") or "Centro")[:60], "municipio_destinatario": c.get("city_name") or "", "uf_destinatario": uf,
        "cep_destinatario": re.sub(r"\D", "", str(c.get("zip_code") or "")), "pais_destinatario": "Brasil", "items": itens}
    if c.get("comment"): pay["complemento_destinatario"] = str(c["comment"])[:60]
    if pj:
        pay["cnpj_destinatario"] = doc
        if ie: pay["inscricao_estadual_destinatario"] = ie; pay["indicador_inscricao_estadual_destinatario"] = 1
        else: pay["indicador_inscricao_estadual_destinatario"] = 9
    else:
        pay["cpf_destinatario"] = doc; pay["indicador_inscricao_estadual_destinatario"] = 9
    return pay

# ------------------------------------------------------------------ XML da nota real do Bling
NS = {"n": "http://www.portalfiscal.inf.br/nfe"}
def xml_bling(v):
    if not v["bling_pedido"]: return None
    d = bling_ro.get(v["conta"], f"/pedidos/vendas/{v['bling_pedido']}").get("data") or {}; time.sleep(0.36)
    nfid = (d.get("notaFiscal") or {}).get("id")
    if not nfid: return None
    n = bling_ro.get(v["conta"], f"/nfe/{nfid}").get("data") or {}; time.sleep(0.36)
    if not n.get("xml"): return None
    try: raw = urllib.request.urlopen(urllib.request.Request(n["xml"], headers={"User-Agent": "Mozilla/5.0"}), timeout=40).read()
    except Exception as e: return {"_erro": str(e)[:80]}
    try: root = ET.fromstring(raw)
    except Exception as e: return {"_erro": "xml: " + str(e)[:60]}
    inf = root.find(".//n:infNFe", NS)
    if inf is None: return {"_erro": "sem infNFe"}
    t = lambda p: (inf.findtext(p, namespaces=NS) or "").strip()
    itens = []
    for det in inf.findall("n:det", NS):
        pr = det.find("n:prod", NS); ic = det.find(".//n:ICMS", NS)
        g = (lambda tag: (pr.findtext("n:" + tag, namespaces=NS) or "").strip())
        icms = list(ic)[0] if ic is not None and len(list(ic)) else None
        gi = (lambda tag: (icms.findtext("n:" + tag, namespaces=NS) or "").strip()) if icms is not None else (lambda tag: "")
        itens.append({"sku": g("cProd"), "ncm": g("NCM"), "cfop": g("CFOP"), "qtd": float(g("qCom") or 0), "vun": float(g("vUnCom") or 0), "vprod": float(g("vProd") or 0),
                      "vfrete": float(g("vFrete") or 0), "orig": gi("orig"), "csosn": gi("CSOSN") or gi("CST")})
    return {"numero": t("n:ide/n:nNF"), "serie": t("n:ide/n:serie"), "natOp": t("n:ide/n:natOp"), "indFinal": t("n:ide/n:indFinal"), "indPres": t("n:ide/n:indPres"),
            "idDest": t("n:ide/n:idDest"), "modFrete": t("n:transp/n:modFrete"), "indIEDest": t("n:dest/n:indIEDest"), "uf": t("n:dest/n:enderDest/n:UF"),
            "vNF": float(t("n:total/n:ICMSTot/n:vNF") or 0), "vProd": float(t("n:total/n:ICMSTot/n:vProd") or 0), "vFrete": float(t("n:total/n:ICMSTot/n:vFrete") or 0),
            "vDesc": float(t("n:total/n:ICMSTot/n:vDesc") or 0), "crt": t("n:emit/n:CRT"), "itens": itens}

def comparar(pay, bx):
    if not bx or bx.get("_erro"): return {"sem_xml_bling": (bx or {}).get("_erro", "nota do Bling não encontrada")}
    dif = []
    tot_erp = round(sum(i["valor_bruto"] + i.get("valor_frete", 0) for i in pay["items"]), 2)
    if abs(tot_erp - bx["vNF"]) > 0.02: dif.append(f"total: ERP {tot_erp:.2f} × Bling {bx['vNF']:.2f}")
    fr = round(sum(i.get("valor_frete", 0) for i in pay["items"]), 2)
    if abs(fr - bx["vFrete"]) > 0.02: dif.append(f"frete na nota: ERP {fr:.2f} × Bling {bx['vFrete']:.2f}")
    if bx["vDesc"] > 0.02: dif.append(f"Bling deu desconto de {bx['vDesc']:.2f}")
    if str(pay["consumidor_final"]) != bx["indFinal"]: dif.append(f"consumidor final: ERP {pay['consumidor_final']} × Bling {bx['indFinal']}")
    if str(pay["presenca_comprador"]) != bx["indPres"]: dif.append(f"presença do comprador: ERP {pay['presenca_comprador']} × Bling {bx['indPres']}")
    if str(pay["modalidade_frete"]) != bx["modFrete"]: dif.append(f"modalidade do frete: ERP {pay['modalidade_frete']} × Bling {bx['modFrete']}")
    if str(pay["indicador_inscricao_estadual_destinatario"]) != bx["indIEDest"]: dif.append(f"indicador de IE: ERP {pay['indicador_inscricao_estadual_destinatario']} × Bling {bx['indIEDest']}")
    if pay["natureza_operacao"].lower() != bx["natOp"].lower(): dif.append(f"natureza: ERP '{pay['natureza_operacao']}' × Bling '{bx['natOp']}'")
    if len(pay["items"]) != len(bx["itens"]): dif.append(f"nº de itens: ERP {len(pay['items'])} × Bling {len(bx['itens'])}")
    for a, b in zip(pay["items"], bx["itens"]):
        for campo, ea, eb in (("CFOP", a["cfop"], b["cfop"]), ("NCM", a["codigo_ncm"], b["ncm"]), ("origem", str(a["icms_origem"]), b["orig"]), ("CSOSN", a["icms_situacao_tributaria"], b["csosn"])):
            if str(ea) != str(eb): dif.append(f"item {b['sku']} {campo}: ERP {ea} × Bling {eb}")
        if abs(a["quantidade_comercial"] - b["qtd"]) > 1e-6 or abs(a["valor_unitario_comercial"] - b["vun"]) > 0.005:
            dif.append(f"item {b['sku']} qtd×preço: ERP {a['quantidade_comercial']:g}×{a['valor_unitario_comercial']:.2f} × Bling {b['qtd']:g}×{b['vun']:.2f}")
    return {"iguais": not dif, "diferencas": dif, "bling": {k: bx[k] for k in ("numero", "serie", "natOp", "vNF", "vFrete", "modFrete", "indFinal", "indIEDest", "crt")}}

# ------------------------------------------------------------------ execução
feitas = 0
for v in prontas:
    if feitas >= MAX: break
    pay = montar(v); ref = "mlteste-" + re.sub(r"\W", "", v["chave"])
    comp = comparar(pay, xml_bling(v))
    status = v["status_teste"]; numero = None; msg = None
    sem_ncm = [i.get("sku_anuncio") for i in v["itens"] if not re.sub(r"\D", "", (prods.get(i.get("product_id") or "", {}).get("ncm") or ""))]
    if sem_ncm and not SO_COMPARAR:
        status = "nao_enviada"; msg = "produto sem NCM no cadastro do ERP: " + ", ".join(sem_ncm)
    elif not SO_COMPARAR and status != "autorizado":
        code, r = focus("POST", f"/v2/nfe?ref={ref}", pay)
        status = r.get("status") or r.get("codigo") or f"http {code}"; msg = r.get("mensagem_sefaz") or r.get("mensagem")
        if r.get("erros"): msg = "; ".join(f"{e.get('campo','')}: {e.get('mensagem','')}" for e in r["erros"])[:300]
        for _ in range(12):
            if status not in ("processando_autorizacao",): break
            time.sleep(4); code, r = focus("GET", f"/v2/nfe/{ref}")
            status = r.get("status") or status; msg = r.get("mensagem_sefaz") or msg
        if code == 422 and "já" in str(msg or "").lower():
            code, r = focus("GET", f"/v2/nfe/{ref}"); status = r.get("status") or status; msg = r.get("mensagem_sefaz") or msg
        numero = r.get("numero")
    total = round(sum(i["valor_bruto"] + i.get("valor_frete", 0) for i in pay["items"]), 2)
    ids = ", ".join(lit(x) for x in v["pedidos"])
    sql(f"update ml_pedidos set nfe_teste_ref={lit(ref)}, nfe_teste_status={lit(status)}, nfe_teste_numero=coalesce({lit(str(numero) if numero else None)}, nfe_teste_numero), nfe_teste_mensagem={lit((msg or '')[:300])}, nfe_teste_total={lit(total)}, nfe_comparacao={lit(comp)}, updated_date=now() where id in ({ids});")
    feitas += 1
    print(f"{v['data'][:10]} {v['conta']:6} venda {v['chave']} → {status} {('nº ' + str(numero)) if numero else ''} | total {total:.2f} | {'igual ao Bling' if comp.get('iguais') else '; '.join(comp.get('diferencas', [])) or comp.get('sem_xml_bling')} {('| ' + msg[:110]) if msg and status != 'autorizado' else ''}", flush=True)
print("processadas:", feitas)
