#!/usr/bin/env python3
"""Extrato do PayPal para a conciliação do ERP (02/10/2026). SOMENTE LEITURA no PayPal.

Lê as transações da conta (API de relatórios, janelas de até 31 dias) e grava em public.extrato_movimentos:
venda (valor cheio, taxa e líquido), saque para o banco, estorno e o resto como "outro".
Uso: erp-extrato-paypal.py [--desde AAAA-MM-DD]     (padrão: últimos 35 dias; o PayPal demora até 3 h para mostrar)
"""
import sys, json, time, base64, datetime, subprocess, urllib.request, urllib.parse
ENV = {}
for l in open("/root/atendimento/.env", encoding="utf-8"):
    l = l.rstrip("\n")
    if l.startswith("PAYPAL_CLIENT_"):
        k, v = l.split("=", 1); ENV[k] = v.strip().strip('"').strip("'")
BASE = "https://api-m.paypal.com"
CONTA = "PayPal Robooster"
LOG = "/root/rotinas/logs/erp-extrato-paypal.log"
def log(*a):
    s = datetime.datetime.now().strftime("%d/%m %H:%M ") + " ".join(str(x) for x in a)
    print(s, flush=True)
    try: open(LOG, "a").write(s + "\n")
    except Exception: pass
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

def token():
    cred = base64.b64encode((ENV["PAYPAL_CLIENT_ID"] + ":" + ENV["PAYPAL_CLIENT_SECRET"]).encode()).decode()
    r = urllib.request.Request(BASE + "/v1/oauth2/token", data=b"grant_type=client_credentials", headers={"Authorization": "Basic " + cred}, method="POST")
    return json.load(urllib.request.urlopen(r, timeout=40))["access_token"]
TK = token()
def get(path):
    r = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + TK})
    try: return json.load(urllib.request.urlopen(r, timeout=60))
    except urllib.error.HTTPError as e: return {"_erro": e.code, "_body": e.read().decode()[:300]}

# Códigos de evento do PayPal: T00xx = pagamento recebido; T04xx = saque/transferência para o banco;
# T11xx/T12xx = estorno, devolução, contestação; T01xx = taxa avulsa.
def tipo_de(cod, valor):
    if cod.startswith("T00"): return "venda" if valor >= 0 else "outro"
    if cod.startswith("T04"): return "saque"
    if cod.startswith("T11") or cod.startswith("T12"): return "estorno"
    if cod.startswith("T01"): return "taxa"
    return "outro"

args = sys.argv[1:]
desde = datetime.date.fromisoformat(args[args.index("--desde") + 1]) if "--desde" in args else datetime.date.today() - datetime.timedelta(days=35)
hoje = datetime.date.today(); n = 0; ini = desde
while ini <= hoje:
    fim = min(ini + datetime.timedelta(days=30), hoje); pag = 1
    while True:
        q = urllib.parse.urlencode({"start_date": ini.isoformat() + "T00:00:00-0300", "end_date": fim.isoformat() + "T23:59:59-0300", "fields": "all", "page_size": 100, "page": pag})
        d = get("/v1/reporting/transactions?" + q)
        if "_erro" in d: log("erro PayPal", ini, d); break
        for x in d.get("transaction_details", []):
            i = x.get("transaction_info", {}); pg = x.get("payer_info", {}); cart = x.get("cart_info", {})
            moeda = (i.get("transaction_amount") or {}).get("currency_code") or "BRL"
            bruto = float((i.get("transaction_amount") or {}).get("value") or 0)
            taxa = float((i.get("fee_amount") or {}).get("value") or 0)
            cod = i.get("transaction_event_code") or ""
            tipo = tipo_de(cod, bruto)
            nome = (pg.get("payer_name") or {}).get("alternate_full_name") or " ".join(v for v in [(pg.get("payer_name") or {}).get("given_name"), (pg.get("payer_name") or {}).get("surname")] if v) or pg.get("email_address")
            desc = i.get("transaction_subject") or i.get("transaction_note") or "; ".join((it.get("item_name") or "") for it in (cart.get("item_details") or [])[:3]) or {"venda": "Pagamento recebido", "saque": "Saque para a conta bancária", "estorno": "Estorno"}.get(tipo, cod)
            saldo = (i.get("ending_balance") or {}).get("value")
            cols = dict(id="paypal:" + i.get("transaction_id", ""), fonte="paypal", conta=CONTA, data=i.get("transaction_initiation_date"), tipo=tipo, descricao=desc[:240],
                        valor=round(bruto + taxa, 2), bruto=bruto if tipo == "venda" else None, taxa=taxa if taxa else None, moeda=moeda,
                        referencia=i.get("invoice_id") or i.get("custom_field") or i.get("paypal_reference_id"), contraparte=nome,
                        saldo_apos=float(saldo) if saldo not in (None, "") else None, codigo_origem=cod + " " + (i.get("transaction_status") or ""), bruto_json=x)
            ks = list(cols)
            sql(f"insert into extrato_movimentos ({', '.join(ks)}) values ({', '.join(lit(cols[k]) for k in ks)}) on conflict (id) do update set "
                + ", ".join(f"{k}=excluded.{k}" for k in ks if k != "id") + ", updated_date=now();")
            n += 1
        if pag >= int(d.get("total_pages") or 0): break
        pag += 1
    ini = fim + datetime.timedelta(days=1)
log(f"PayPal: {n} movimentos gravados/atualizados desde {desde}")
