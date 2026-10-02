#!/usr/bin/env python3
"""Catálogo e estoque do ERP a partir do Bling (Router66 + Saber) — até a virada de janeiro/2027.

Ordem do Mauricio (02/10/2026): "PODE IMPORTAR APENAS produtos que tem no estoque"; um CNPJ só no ERP.
O que faz (idempotente, pode rodar todo dia):
  1. Produto ATIVO no Bling, com estoque nos depósitos permitidos, que ainda não existe no ERP -> cria.
     Fora: kits (formato E, o estoque é das peças) e pais de variação (o estoque está nos filhos).
  2. Produto do ERP que veio do Bling (products.codigos_origem) -> estoque do ERP = soma do Bling das duas
     empresas, por movimento "ajuste_inventario" (o gatilho do banco atualiza o saldo). Nunca edita saldo direto.
Regras de código: vale o código da Router66; produto igual nas duas empresas vira um só; produto só da Saber
mantém o código e, se o código já é de OUTRO produto na Router66, ganha o final "-S".
Só LÊ o Bling. Não toca nos produtos nativos do ERP (os RB-...), que não têm codigos_origem.

Uso:  erp-importa-bling.py [--dry]      (cron da produção, depois do sync do precificador)
"""
import json, re, subprocess, sys, time, unicodedata, secrets, urllib.request, datetime
sys.path.insert(0, "/root/precificador-unificado/scripts")
from bling_ro import EMP, psql, get, produtos  # leitura com o token gravado pelo app

DRY = "--dry" in sys.argv
DEP = {"router": [12543070696, 12548516673], "saber": [14886641366, 14886653833]}
NOME = {"router": "Router66", "saber": "Saber"}
HOJE = datetime.date.today().strftime("%d/%m/%Y")
LOG = "/root/rotinas/logs/erp-importa-bling.log"

def log(*a):
    s = datetime.datetime.now().strftime("%d/%m %H:%M ") + " ".join(str(x) for x in a)
    print(s, flush=True)
    try: open(LOG, "a").write(s + "\n")
    except Exception: pass

def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

def garantir_token(emp):
    t, exp = psql(f"select access_token, expires_at from prec_bling_token where empresa_id='{EMP[emp]}'").strip().split("\t")
    if time.time() * 1000 > float(exp) - 120000:  # a renovação é SÓ pelo app do precificador
        req = urllib.request.Request("https://precificador.robooster.com.br/functions/testBlingEstoque",
            data=json.dumps({"empresa_id": EMP[emp], "sku": "0"}).encode(), headers={"Content-Type": "application/json"}, method="POST")
        try: urllib.request.urlopen(req, timeout=90).read()
        except Exception as e: log("aviso: renovação do token", emp, str(e)[:80])

def saldos(emp, ids):
    """{id: saldo nos depósitos permitidos}; id sem resposta fica FORA do mapa (não vira zero)."""
    out = {}
    for i in range(0, len(ids), 100):
        lote = ids[i:i + 100]
        d = get(emp, "/estoques/saldos?" + "&".join(f"idsProdutos[]={j}" for j in lote))
        if "_erro" in d: log("aviso: saldos falhou", emp, d); continue
        for j in lote: out[j] = 0.0
        for it in d.get("data", []):
            out[it["produto"]["id"]] = sum(float(x.get("saldoFisico") or 0) for x in it.get("depositos", []) if x["id"] in DEP[emp])
        time.sleep(0.5)
    return out

def sql(q):
    c = subprocess.run("docker ps --format '{{.Names}}'|grep supabase_db", shell=True, capture_output=True, text=True).stdout.strip()
    r = subprocess.run(["docker", "exec", "-i", c, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-AtF", "\t"], input=q, capture_output=True, text=True)
    if r.returncode != 0: raise SystemExit("ERRO SQL: " + r.stderr[:600])
    return r.stdout

def lit(v):
    if v is None or v == "": return "null"
    if isinstance(v, (int, float)): return repr(round(v, 4))
    return "'" + str(v).replace("'", "''") + "'"

def ncm_fmt(n):
    d = re.sub(r"\D", "", n or "")
    return f"{d[:4]}.{d[4:6]}.{d[6:8]}" if len(d) == 8 else None

# ------------------------------------------------------------------ 1) lê o Bling
cat = {}
for emp in ("router", "saber"):
    garantir_token(emp)
    ativos = [x for x in produtos(emp, 1) if x.get("formato") != "E"]   # kits fora
    s = saldos(emp, [x["id"] for x in ativos])
    cat[emp] = [dict(id=x["id"], sku=str(x.get("codigo") or "").strip(), nome=x.get("nome") or "", formato=x.get("formato"),
                     custo=float(x.get("precoCusto") or 0), estoque=s.get(x["id"]), img=x.get("imagemURL") or x.get("imageThumbnail"))
                for x in ativos if str(x.get("codigo") or "").strip()]
    log(emp, "ativos sem kit:", len(cat[emp]), "| com estoque:", sum(1 for x in cat[emp] if (x["estoque"] or 0) > 0))

# ------------------------------------------------------------------ 2) estado do ERP
erp = {}       # sku -> (id, estoque, origem)
por_origem = {}
for l in sql("select id, coalesce(sku,''), coalesce(stock_quantity,0), coalesce(codigos_origem::text,'') from products;").split("\n"):
    if not l.strip(): continue
    pid, sku, est, orig = (l.split("\t") + ["", "", ""])[:4]
    o = json.loads(orig) if orig else None
    erp[sku] = (pid, float(est), o)
    if o:
        for emp in ("router", "saber"):
            if o.get(emp): por_origem[(emp, str(o[emp]["bling_id"]))] = sku

# pares "mesmo produto nas duas empresas": o que o ERP já uniu (decisão do dono vale mais) + master do precificador + nome igual
pares = {}   # sku saber -> sku router
for _sku, (_pid, _est, _o) in erp.items():
    if _o and _o.get("router") and _o.get("saber"): pares[str(_o["saber"]["sku"])] = str(_o["router"]["sku"])
m = {}
for l in psql("select pe.produto_master_id, e.nome, pe.sku from prec_produto_empresa pe join prec_empresa e on e.id=pe.empresa_id").strip().split("\n"):
    mid, e, sku = l.split("\t"); m.setdefault(mid, {})["router" if e.startswith("Router") else "saber"] = sku.strip()
for d in m.values():
    if len(d) == 2: pares.setdefault(d["saber"], d["router"])
rnome = {norm(x["nome"]): x for x in cat["router"]}
for x in cat["saber"]:
    r = rnome.get(norm(x["nome"]))
    if r: pares.setdefault(x["sku"], r["sku"])
rsku = {x["sku"]: x for x in cat["router"]}
ssku = {x["sku"]: x for x in cat["saber"]}

# produtos unificados: chave = SKU do ERP
uni = {}
for x in cat["router"]:
    if x["formato"] == "V": continue                       # pai de variação
    uni[x["sku"]] = {"router": x}
for x in cat["saber"]:
    if x["formato"] == "V": continue
    if x["sku"] in pares and pares[x["sku"]] in uni: uni[pares[x["sku"]]]["saber"] = x
    elif x["sku"] in rsku: uni[x["sku"] + "-S"] = {"saber": x}   # mesmo código, produto diferente
    else: uni[x["sku"]] = {"saber": x}

novos, ajustes, sem_dado = [], [], 0
for sku, u in uni.items():
    partes = {emp: u[emp] for emp in ("router", "saber") if emp in u}
    if any(p["estoque"] is None for p in partes.values()): sem_dado += 1; continue   # Bling não respondeu: não mexe
    total = sum(max(0.0, p["estoque"]) for p in partes.values())
    ja = None
    for emp, p in partes.items():
        ja = ja or por_origem.get((emp, str(p["id"])))
    if ja:
        pid, atual, _ = erp[ja]
        if abs(atual - total) > 1e-9: ajustes.append((ja, pid, atual, total, partes))
    elif total > 0:
        if sku in erp: log("aviso: SKU", sku, "já existe no ERP sem origem Bling — não importado"); continue
        novos.append((sku, total, partes))

# produtos do ERP cuja origem saiu da lista de ativos (inativado/excluído no Bling): saldo direto pelo id guardado
vistos = {(emp, str(p["id"])) for u in uni.values() for emp, p in u.items()}
orfaos = {}
for (emp, bid), sku in por_origem.items():
    if (emp, bid) not in vistos: orfaos.setdefault(sku, []).append((emp, int(bid)))
for sku, lst in orfaos.items():
    o = erp[sku][2]; total = 0.0; ok = True
    for emp in ("router", "saber"):
        if not o.get(emp): continue
        bid = int(o[emp]["bling_id"])
        if (emp, str(bid)) in vistos:
            p = next(p for u in uni.values() for e2, p in u.items() if e2 == emp and p["id"] == bid)
            if p["estoque"] is None: ok = False
            else: total += max(0.0, p["estoque"])
        else:
            s = saldos(emp, [bid])
            if bid not in s: ok = False
            else: total += max(0.0, s[bid])
    if ok and abs(erp[sku][1] - total) > 1e-9 and not any(a[0] == sku for a in ajustes):
        ajustes.append((sku, erp[sku][0], erp[sku][1], total, {}))

log(f"novos a criar: {len(novos)} | ajustes de estoque: {len(ajustes)} | sem resposta do Bling (não mexi): {sem_dado}")

# ------------------------------------------------------------------ 3) detalhe fiscal só dos novos
def detalhe(emp, bid):
    d = get(emp, f"/produtos/{bid}").get("data") or {}
    time.sleep(0.36)
    t = d.get("tributacao") or {}; dim = d.get("dimensoes") or {}
    ext = ((d.get("midia") or {}).get("imagens") or {}).get("externas") or []
    return dict(ncm=ncm_fmt(t.get("ncm")), origem=t.get("origem"), gtin=d.get("gtin") or None, peso=d.get("pesoBruto") or d.get("pesoLiquido") or None,
                larg=dim.get("largura") or None, alt=dim.get("altura") or None, prof=dim.get("profundidade") or None,
                unidade=(d.get("unidade") or "UN").upper()[:6], marca=d.get("marca") or None, img=(ext[0].get("link") if ext else None))

stmts = []
resumo_novos = []
for sku, total, partes in novos:
    base_emp = "router" if "router" in partes else "saber"
    b = partes[base_emp]; det = detalhe(base_emp, b["id"])
    if not det["ncm"] and len(partes) == 2:   # tenta completar pelo cadastro da outra empresa
        o2 = detalhe("saber", partes["saber"]["id"])
        for k in det:
            if not det[k] and o2.get(k): det[k] = o2[k]
    qt = sum(max(0.0, p["estoque"]) for p in partes.values())
    custo = sum(max(0.0, p["estoque"]) * p["custo"] for p in partes.values()) / qt if qt else b["custo"]
    origem = {emp: {"sku": p["sku"], "bling_id": p["id"]} for emp, p in partes.items()}
    if det["origem"] is not None: origem["icms_origem"] = det["origem"]
    notas = f"Importado do Bling em {HOJE} ({' + '.join(NOME[e] + ' ' + p['sku'] for e, p in partes.items())})."
    if not det["ncm"]: notas += " CADASTRO INCOMPLETO: falta o NCM — não emite nota fiscal até completar."
    pid = secrets.token_hex(12)
    # Ordem do Mauricio (02/10/2026): tudo que vem do Bling é IMPORTADO, mesmo que o cadastro de lá diga "nacional".
    # O valor original do Bling fica guardado em codigos_origem.icms_origem só como registro.
    pais = "Exterior"
    stmts.append(
        "insert into products (id, sku, name, ncm, origin_country, unit, weight_kg, width_cm, height_cm, length_cm, custo_manual_brl, stock_quantity, "
        "image_url, barcode, brand, status, notes, codigos_origem, created_date, updated_date, created_by) values ("
        + ", ".join([lit(pid), lit(sku), lit(b["nome"]), lit(det["ncm"]), lit(pais), lit(det["unidade"] or "UN"), lit(det["peso"]), lit(det["larg"]), lit(det["alt"]),
                     lit(det["prof"]), lit(round(custo, 4)), "0", lit(det["img"] or b.get("img")), lit(det["gtin"]), lit(det["marca"]), "'active'", lit(notas),
                     lit(json.dumps(origem, ensure_ascii=False)) + "::jsonb", "now()", "now()", "'importacao-bling'"]) + ");")
    motivo = "Saldo inicial importado do Bling (" + " + ".join(f"{NOME[e]} {p['estoque']:g}" for e, p in partes.items()) + ")"
    stmts.append((
        "insert into stock_movements (id, product_id, product_name, sku, product_sku, tipo, quantidade, origem_tipo, origem_id, origem_ref, motivo, unit_cost, "
        "type, quantity, reference_type, reference_id, notes, created_date, updated_date, created_by) values ("
        + ", ".join([lit(secrets.token_hex(12)), lit(pid), lit(b["nome"]), lit(sku), lit(sku), "'ajuste_inventario'", lit(total), "'manual'", "''", "'Bling'",
                     lit(motivo), lit(round(custo, 4)), "'adjustment'", lit(total), "'adjustment'", "''", lit("Bling — " + motivo), "now()", "now()", "'importacao-bling'"]) + ");"))
    resumo_novos.append((sku, b["nome"], total, round(custo, 2), det["ncm"], "+".join(partes)))

for sku, pid, atual, total, partes in ajustes:
    delta = total - atual
    motivo = f"Espelho diário do Bling em {HOJE}: saldo no Bling {total:g}, no ERP {atual:g}"
    nome = sql(f"select name from products where id={lit(pid)};").strip()
    stmts.append(
        "insert into stock_movements (id, product_id, product_name, sku, product_sku, tipo, quantidade, origem_tipo, origem_id, origem_ref, motivo, unit_cost, "
        "type, quantity, reference_type, reference_id, notes, created_date, updated_date, created_by) values ("
        + ", ".join([lit(secrets.token_hex(12)), lit(pid), lit(nome), lit(sku), lit(sku), "'ajuste_inventario'", lit(delta), "'manual'", "''", "'Bling'",
                     lit(motivo), "(select coalesce(cost_landed_brl, custo_manual_brl, 0) from products where id=" + lit(pid) + ")", "'adjustment'", lit(abs(delta)),
                     "'adjustment'", "''", lit("Bling — " + motivo), "now()", "now()", "'espelho-bling'"]) + ");")

json.dump({"novos": resumo_novos, "ajustes": [(a[0], a[2], a[3]) for a in ajustes]},
          open("/root/rotinas/state/erp-importa-bling-ultimo.json", "w"), ensure_ascii=False, indent=1)
if DRY:
    log("DRY: nada gravado.", "novos:", len(resumo_novos), "ajustes:", len(ajustes))
    for r in resumo_novos: print("  +", r)
    for a in ajustes: print("  ~", a[0], a[2], "->", a[3])
    sys.exit(0)
if stmts:
    sql("begin;\n" + "\n".join(stmts) + "\ncommit;")
log(f"gravado: {len(resumo_novos)} produtos criados, {len(ajustes)} ajustes de estoque")
