#!/usr/bin/env python3
"""Extrato do MERCADO PAGO (relatório de liberações / release_report) para a conciliação do ERP. Criado 07/10/2026.
SOMENTE LEITURA no Mercado Pago (GET), exceto o pedido do relatório (POST release_report, que só cria o arquivo na conta).

O que entra em public.extrato_movimentos (fonte 'mercadopago', conta 'Mercado Pago ROUTER 66'):
  payment              → tipo 'venda'  (bruto, taxa, líquido; referencia = id do pagamento, o mesmo de ml_pedidos.pagamentos)
  shipping             → tipo 'taxa'   (custo de envio debitado)
  payout               → tipo 'saque'  (valor negativo; a rotina erp-concilia-saques.py casa com o Pix "R B RESSUTI" no Itaú)
  reserve_for_dispute  → tipo 'outro'  (valor retido em disputa)
  refund / chargeback  → tipo 'estorno'
  reserve_for_payout / reserve_for_payment → ignorados (pares de reserva que se anulam no mesmo instante)
A venda NÃO vira lançamento no Financeiro (a receita do Mercado Livre já entra pelos pedidos); só o saque casado alimenta a entrada
no banco, como no PayPal. O saldo final do relatório vai para extrato_saldos.

Uso:
  erp-extrato-mercadopago.py <arquivo.csv> [--conta router]   importa um arquivo já baixado
  erp-extrato-mercadopago.py --baixar [--conta router]        lista os relatórios prontos na API, baixa os novos e importa
  erp-extrato-mercadopago.py --pedir AAAA-MM [--conta router] pede à API o relatório do mês (fica pronto em horas/dias)
Só a conta ROUTER 66 tem configuração de relatório; a da Saber precisa ser criada no painel do Mercado Pago (decisão do dono).
"""
import sys, csv, json, datetime, subprocess, urllib.request, os
sys.path.insert(0, "/root/rotinas"); import ml_ro

LOG = "/root/rotinas/logs/erp-extrato-mercadopago.log"
DIR = "/root/financeiro-extratos"
# A conta da SABER é de outro CNPJ: fica visível na Conciliação, mas com nome que NÃO casa com a conta "Mercado Pago" do Financeiro
# (o Financeiro do ERP é só do CNPJ da Router até a virada de janeiro/2027).
CONTAS = {"router": "Mercado Pago ROUTER 66", "saber": "Saber — Mercado Pago (outro CNPJ)"}
def log(*a):
    s = datetime.datetime.now().strftime("%d/%m %H:%M ") + " ".join(str(x) for x in a); print(s, flush=True)
    try: open(LOG, "a").write(s + "\n")
    except Exception: pass
def sql(q):
    c = subprocess.run("docker ps --format '{{.Names}}'|grep supabase_db", shell=True, capture_output=True, text=True).stdout.strip()
    r = subprocess.run(["docker", "exec", "-i", c, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-AtF", "\t"], input=q, capture_output=True, text=True)
    if r.returncode != 0: raise SystemExit("ERRO SQL: " + r.stderr[:600])
    return r.stdout
def lit(v):
    if v is None or v == "": return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return repr(round(v, 4))
    if isinstance(v, (dict, list)): return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"

args = sys.argv[1:]
emp = args[args.index("--conta") + 1] if "--conta" in args else "router"
CONTA = CONTAS[emp]
TIPO = {"payment": "venda", "shipping": "taxa", "payout": "saque", "reserve_for_dispute": "outro", "refund": "estorno", "chargeback": "estorno", "dispute": "estorno"}
DESC = {"payment": "Venda no Mercado Livre liberada", "shipping": "Custo de envio (Mercado Envios)", "payout": "Saque para o banco (Pix)",
        "reserve_for_dispute": "Valor retido em disputa", "refund": "Estorno ao comprador", "chargeback": "Contestação (chargeback)", "dispute": "Disputa"}

def importar(arq):
    nome = os.path.basename(arq); n = 0; ult = None
    for r in csv.DictReader(open(arq, encoding="utf-8-sig"), delimiter=";"):
        d = (r.get("DESCRIPTION") or "").strip(); sid = (r.get("SOURCE_ID") or "").strip()
        if not d or d.startswith("reserve_for_payout") or d.startswith("reserve_for_payment"):
            if r.get("BALANCE_AMOUNT") not in (None, ""):
                if (r.get("DATE") or "")[:10]: ult = (r["DATE"][:10], float(r["BALANCE_AMOUNT"]))
                elif ult: ult = (ult[0], float(r["BALANCE_AMOUNT"]))   # linha final de saldo vem sem data
            continue
        cred = float(r.get("NET_CREDIT_AMOUNT") or 0); deb = float(r.get("NET_DEBIT_AMOUNT") or 0)
        valor = round(cred - deb, 2); bruto = float(r.get("GROSS_AMOUNT") or 0); taxa = float(r.get("MP_FEE_AMOUNT") or 0)
        tipo = TIPO.get(d, "outro"); desc = DESC.get(d, d)
        if tipo == "venda" and r.get("PAYMENT_METHOD"): desc += f" · {r['PAYMENT_METHOD']}"
        if tipo == "venda" and r.get("TRANSACTION_APPROVAL_DATE"): desc += f" · pago em {r['TRANSACTION_APPROVAL_DATE'][:10]}"
        cat = {"venda": "Venda no Mercado Livre (liberação)", "taxa": "Frete do Mercado Envios", "saque": "Saque para o banco", "estorno": "Estorno de venda", "outro": "Valor retido pelo Mercado Pago"}[tipo]
        # 07/10: coluna PAYOUT_BANK_ACCOUNT_NUMBER (ligada hoje) diz para onde foi o saque: 00997810 = Itaú 99781-0 da Router;
        # 00085434 = conta Mercado Pago da SABER (conferido pelo dono). Outro destino → transferência, não saque para o banco.
        dest = (r.get("PAYOUT_BANK_ACCOUNT_NUMBER") or "").strip()
        if tipo == "saque" and dest:
            if dest.endswith("997810"): desc += " · Itaú 99781-0"
            elif dest.endswith("85434"): cat = "Transferência para a conta da Saber (Mercado Pago)"; desc = "Transferência para o Mercado Pago da SABER"; tipo = "transferencia"
            else: cat = "Transferência para outra conta (Mercado Pago)"; desc = f"Transferência para a conta {dest}"; tipo = "transferencia"
        cols = dict(id=f"mercadopago:{emp}:{sid}:{d}:{r['DATE'][:19]}", fonte="mercadopago", conta=CONTA, data=r["DATE"], tipo=tipo, descricao=desc[:240],
                    valor=valor, bruto=bruto if tipo == "venda" else None, taxa=taxa if tipo == "venda" else None, moeda="BRL",
                    referencia=sid or None, contraparte="Mercado Livre" if tipo == "venda" else None, categoria=cat, categoria_confirmada=False,
                    codigo_origem=d, arquivo=nome, saldo_apos=float(r["BALANCE_AMOUNT"]) if r.get("BALANCE_AMOUNT") not in (None, "") else None,
                    bruto_json={k: v for k, v in r.items() if v not in (None, "")})
        ks = [k for k in cols if cols[k] is not None]
        sql(f"insert into extrato_movimentos ({', '.join(ks)}) values ({', '.join(lit(cols[k]) for k in ks)}) on conflict (id) do update set "
            + ", ".join(f"{k}=excluded.{k}" for k in ks if k not in ("id", "categoria", "categoria_confirmada")) + ", categoria=coalesce(extrato_movimentos.categoria, excluded.categoria), updated_date=now();")
        n += 1
    if ult:
        sql(f"insert into extrato_saldos (conta, data, saldo, arquivo) values ({lit(CONTA)}, '{ult[0]}', {ult[1]!r}, {lit(nome)}) on conflict (conta, data) do update set saldo=excluded.saldo, arquivo=excluded.arquivo;")
    log(f"{CONTA}: {n} movimentos de {nome}" + (f" | saldo R$ {ult[1]:.2f} em {ult[0]}" if ult else ""))
    return n

if "--pedir" in args:
    a, m = map(int, args[args.index("--pedir") + 1].split("-"))
    ini = f"{a}-{m:02d}-01T03:00:00Z"; fim = (datetime.date(a + (m == 12), (m % 12) + 1, 1)).isoformat() + "T02:59:59Z"
    tok = ml_ro.token(emp)
    req = urllib.request.Request("https://api.mercadopago.com/v1/account/release_report", data=json.dumps({"begin_date": ini, "end_date": fim}).encode(),
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"}, method="POST")
    try: print(json.load(urllib.request.urlopen(req, timeout=60)))
    except urllib.error.HTTPError as e: print("erro", e.code, e.read().decode()[:200])
    log(f"relatório pedido: {emp} {a}-{m:02d}"); sys.exit(0)

if "--baixar" in args:
    lista = ml_ro.mp_get(emp, "/v1/account/release_report/list")
    if not isinstance(lista, list): log("lista indisponível:", str(lista)[:160]); sys.exit(0)
    tok = ml_ro.token(emp); novos = 0
    for x in lista:
        fn = x.get("file_name");
        if not fn: continue
        dest = os.path.join(DIR, f"mp-{emp}-{fn}")
        if os.path.exists(dest): continue
        r = urllib.request.Request("https://api.mercadopago.com/v1/account/release_report/" + fn, headers={"Authorization": "Bearer " + tok})
        open(dest, "wb").write(urllib.request.urlopen(r, timeout=120).read()); os.chmod(dest, 0o600); novos += 1
        importar(dest)
    log(f"--baixar {emp}: {len(lista)} relatórios na conta, {novos} novos importados")
else:
    arqs = [a for a in args if a.endswith(".csv")]
    if not arqs: raise SystemExit(__doc__)
    for a in arqs: importar(a)

# casa os saques com as entradas no banco (02/10/2026) e reancora saldos
subprocess.run(["python3", "/root/rotinas/erp-concilia-saques.py"])
log("Financeiro:", sql("select extrato_para_financeiro();").strip())
