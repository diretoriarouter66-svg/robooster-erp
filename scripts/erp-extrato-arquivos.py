#!/usr/bin/env python3
"""Extratos em ARQUIVO para a conciliação do ERP (02/10/2026): OFX do banco e fatura do cartão Itaú em Excel.

Uso: erp-extrato-arquivos.py <arquivo.ofx|arquivo.xlsx> [--conta "rótulo"]
Grava em public.extrato_movimentos (idempotente: o id vem do banco/da linha da fatura). Sugere a categoria por regra;
o que não tem regra fica sem categoria, para o dono classificar.
"""
import sys, re, json, hashlib, datetime, subprocess, os
def sql(q):
    c = subprocess.run("docker ps --format '{{.Names}}'|grep supabase_db", shell=True, capture_output=True, text=True).stdout.strip()
    r = subprocess.run(["docker", "exec", "-i", c, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-AtF", "\t"], input=q, capture_output=True, text=True)
    if r.returncode != 0: raise SystemExit("ERRO SQL: " + r.stderr[:600])
    return r.stdout
def lit(v):
    if v is None or v == "": return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return repr(round(v, 4))
    if isinstance(v, (dict, list)): return "'" + json.dumps(v, ensure_ascii=False, default=str).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"

# (trecho do histórico em maiúsculas, tipo, categoria) — só o que é inequívoco. O resto fica para classificar.
REGRAS_BANCO = [
    ("REDECARD", "entrada", "Recebimento de cartão (maquininha Rede)"),
    ("PIX RECEBIDO R B RES", "transferencia", "Transferência de conta própria (saque do Mercado Pago ou PayPal)"),
    ("INT RESGATE", "transferencia", "Resgate de aplicação"),
    ("APLICACAO", "transferencia", "Aplicação financeira"),
    ("REND PAGO APLIC", "entrada", "Rendimento de aplicação"),
    ("SISPAG SALARIOS", "saida", "Salários"),
    ("PARCELA GIRO", "saida", "Parcela de empréstimo (capital de giro)"),
    ("BUSINESS", "transferencia", "Pagamento da fatura do cartão de crédito"),
    ("RECEITA FEDERAL", "saida", "Imposto federal"),
    ("CEF MATRIZ", "saida", "FGTS"),
    ("PM SOROCABA", "saida", "Taxa municipal"),
    ("IOF", "saida", "IOF"),
    ("TAR PLANO", "saida", "Tarifa bancária"),
    ("SAE-SOROC", "saida", "Água"),
    ("CLARO", "saida", "Telefone e internet"),
    ("CPFL", "saida", "Energia elétrica"),
    ("CORREIOS", "saida", "Correios"),
    ("CONTABIL", "saida", "Contabilidade"),
    ("PIX RECEBIDO", "entrada", "Recebimento de cliente (Pix)"),
    ("RECEBIMENTOS", "entrada", "Recebimento de cliente"),
]
REGRAS_CARTAO = [("GOOGLE ADS", "Anúncios (Google Ads)"), ("HOSTINGER", "Hospedagem e servidores (Hostinger)"), ("ANUIDADE", "Anuidade do cartão"),
                 ("MERCADOLIVRE", "Compra no Mercado Livre"), ("ADAPTAORG", "Assinatura de software")]

arq = sys.argv[1]; args = sys.argv[2:]
rotulo = args[args.index("--conta") + 1] if "--conta" in args else None
nome_arq = os.path.basename(arq); n = 0

def gravar(c):
    global n
    ks = list(c)
    sql(f"insert into extrato_movimentos ({', '.join(ks)}) values ({', '.join(lit(c[k]) for k in ks)}) on conflict (id) do update set "
        + ", ".join(f"{k}=excluded.{k}" for k in ks if k not in ("id", "categoria")) + ", categoria=coalesce(extrato_movimentos.categoria, excluded.categoria), updated_date=now();")
    n += 1

if arq.lower().endswith(".ofx"):
    raw = open(arq, encoding="cp1252", errors="ignore").read()
    g = lambda tag, txt: (re.search(r"<%s>([^<\r\n]*)" % tag, txt) or [None, ""])[1].strip()
    conta_id = g("ACCTID", raw); banco = g("BANKID", raw)
    conta = rotulo or f"Banco {banco} conta {conta_id}"
    for b in re.findall(r"<STMTTRN>(.*?)</STMTTRN>", raw, re.S):
        memo = g("MEMO", b); valor = float(g("TRNAMT", b)); d = g("DTPOSTED", b)[:8]
        tipo, cat = ("entrada" if valor > 0 else "saida"), None
        for k, t, c in REGRAS_BANCO:
            if k in memo.upper(): tipo, cat = t, c; break
        doc = re.search(r"(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\s*$", memo)
        gravar(dict(id=f"banco:{conta_id}:{g('FITID', b)}", fonte="banco", conta=conta, data=f"{d[:4]}-{d[4:6]}-{d[6:8]}T12:00:00-03:00", tipo=tipo, descricao=memo[:240],
                    valor=valor, moeda=g("CURDEF", raw) or "BRL", referencia=doc.group(1) if doc else None, categoria=cat, codigo_origem=g("TRNTYPE", b), arquivo=nome_arq,
                    bruto_json={"memo": memo, "fitid": g("FITID", b)}))
    print(f"{conta}: {n} movimentos | saldo final informado R$ {g('BALAMT', raw)} em {g('DTASOF', raw)[:8]}")
elif arq.lower().endswith(".xlsx"):
    import openpyxl, warnings; warnings.simplefilter("ignore")
    ws = openpyxl.load_workbook(arq, data_only=True).active
    linhas = [[c for c in r] for r in ws.iter_rows(values_only=True)]
    txt = lambda r: [str(x).strip() for x in r if x not in (None, "")]
    cartao = venc = total = titular = None; em_lanc = False
    for r in linhas:
        v = txt(r)
        if not v: continue
        j = " | ".join(v)
        m = re.search(r"(VISA|MASTER\w*)\s*-\s*(\d{4})", j, re.I)
        if m and not cartao: cartao = f"Cartão Itaú {m.group(1).title()} {m.group(2)}"
        if v[0].lower() in ("fechada", "aberta") and len(v) > 1: venc = str(v[1])[:10]
        if v[0].lower().startswith("total da fatura") and len(v) > 1 and total is None:
            try: total = float(v[1])
            except Exception: pass
        if re.search(r" - FINAL \d{4}$", v[0]): titular = v[0]
        if v[0].lower() == "data" and len(v) >= 3: em_lanc = True; continue
        if v[0].lower().startswith("total de lan"): em_lanc = False; continue
        if em_lanc and len(v) >= 3 and re.match(r"\d{4}-\d{2}-\d{2}", v[0]):
            desc = v[1]; valor = float(v[2]); cat = None
            for k, c in REGRAS_CARTAO:
                if k in desc.upper(): cat = c; break
            if valor < 0 and cat is None: cat = "Estorno no cartão"
            hid = hashlib.sha1(f"{venc}|{v[0][:10]}|{desc}|{valor}|{n}".encode()).hexdigest()[:14]
            gravar(dict(id=f"cartao:{(cartao or 'cartao').replace(' ', '')}:{venc}:{hid}", fonte="cartao", conta=rotulo or cartao or "Cartão de crédito", data=v[0][:10] + "T12:00:00-03:00",
                        tipo="estorno" if valor < 0 else "saida", descricao=desc[:240], valor=-valor, referencia=f"fatura {venc}", contraparte=titular, categoria=cat, arquivo=nome_arq,
                        bruto_json={"fatura_vencimento": venc, "fatura_total": total, "titular": titular}))
    print(f"{rotulo or cartao}: {n} lançamentos | fatura com vencimento {venc}, total R$ {total}")
else:
    raise SystemExit("formato não reconhecido (use .ofx ou .xlsx)")
