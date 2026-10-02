#!/usr/bin/env python3
"""Casa os saques das contas de pagamento (PayPal, Mercado Pago) com a entrada no banco (02/10/2026).

Lê e grava só em public.extrato_movimentos (casado_com, casado_tipo, situacao). Não toca em nada fora do ERP.
Regra do par: mesmo valor em centavos, entrada no banco do dia do saque até 5 dias depois, lançamento do banco
ainda sem par. Com mais de um candidato, vale o que cita a origem no histórico; se continuar empatado, fica sem
casar e sai no relatório (nunca chuta).
situacao do saque: casado | sem_par (o banco tem extrato do período e a entrada não está lá) |
                   sem_extrato_banco (nenhum extrato de banco cobre o período).
Uso: erp-concilia-saques.py [--refazer]     (--refazer desfaz os pares de saque e casa tudo de novo)
"""
import sys, datetime, subprocess
JANELA = 5  # dias corridos entre o saque e a entrada no banco
PISTA = {"paypal": ("PAYPAL",), "mercadopago": ("MERCADO PAGO", "MERCADOPAGO", "MERCADO LIVRE", "MERCADOLIVRE")}
LOG = "/root/rotinas/logs/erp-concilia-saques.log"
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
def q(s): return "'" + str(s).replace("'", "''") + "'"

if "--refazer" in sys.argv:
    sql("update extrato_movimentos set casado_com=null, casado_tipo=null, situacao='a_conciliar', updated_date=now() where casado_tipo='saque' or situacao in ('sem_par','sem_extrato_banco');")

movs = []
for l in sql("select id, fonte, conta, (data at time zone 'America/Sao_Paulo')::date, tipo, round(valor*100)::bigint, upper(coalesce(descricao,'')), coalesce(casado_com,'') from extrato_movimentos order by data;").split("\n"):
    if not l.strip(): continue
    i, fonte, conta, d, tipo, cent, desc, casado = (l.split("\t") + [""] * 8)[:8]
    movs.append(dict(id=i, fonte=fonte, conta=conta, data=datetime.date.fromisoformat(d), tipo=tipo, cent=int(cent), desc=desc, casado=casado))

banco = [m for m in movs if m["fonte"] == "banco"]
# período que cada extrato de banco cobre (do primeiro ao último lançamento lido)
cobertura = {}
for m in banco:
    a, b = cobertura.get(m["conta"], (m["data"], m["data"]))
    cobertura[m["conta"]] = (min(a, m["data"]), max(b, m["data"]))
def banco_cobre(d):
    return any(a <= d <= b for a, b in cobertura.values())

saques = [m for m in movs if m["fonte"] in PISTA and m["tipo"] == "saque" and m["cent"] < 0]
n_casado = n_sem_par = n_sem_extrato = n_empate = 0
for s in saques:
    if s["casado"]: n_casado += 1; continue
    fim = s["data"] + datetime.timedelta(days=JANELA)
    cands = [b for b in banco if not b["casado"] and b["cent"] == -s["cent"] and s["data"] <= b["data"] <= fim]
    if len(cands) > 1:
        com_pista = [b for b in cands if any(p in b["desc"] for p in PISTA[s["fonte"]])]
        if len(com_pista) == 1: cands = com_pista
    if len(cands) == 1:
        b = cands[0]; b["casado"] = s["id"]; s["casado"] = b["id"]; n_casado += 1
        sql(f"update extrato_movimentos set casado_com={q(b['id'])}, casado_tipo='saque', situacao='casado', updated_date=now() where id={q(s['id'])};"
            f"update extrato_movimentos set casado_com={q(s['id'])}, casado_tipo='saque', situacao='casado', updated_date=now() where id={q(b['id'])};")
        log(f"casado: {s['conta']} {s['data']} R$ {-s['cent']/100:.2f} ↔ {b['conta']} {b['data']}")
        continue
    if len(cands) > 1:
        n_empate += 1; sit = "sem_par"
        log(f"empate ({len(cands)} entradas iguais no banco), não casei: {s['conta']} {s['data']} R$ {-s['cent']/100:.2f}")
    elif banco_cobre(s["data"]) or banco_cobre(fim):
        n_sem_par += 1; sit = "sem_par"
    else:
        n_sem_extrato += 1; sit = "sem_extrato_banco"
    sql(f"update extrato_movimentos set situacao={q(sit)}, updated_date=now() where id={q(s['id'])} and situacao is distinct from {q(sit)};")

# entradas no banco vindas de conta da própria empresa que continuam sem origem identificada
orfas = [b for b in banco if not b["casado"] and b["tipo"] == "transferencia" and b["cent"] > 0 and ("PIX RECEBIDO" in b["desc"] or any(p in b["desc"] for ps in PISTA.values() for p in ps))]
log(f"saques: {len(saques)} | casados {n_casado} | sem par no banco {n_sem_par} | empate {n_empate} | sem extrato do banco no período {n_sem_extrato}"
    f" | entradas de conta própria no banco ainda sem origem: {len(orfas)} (R$ {sum(b['cent'] for b in orfas)/100:.2f})")
