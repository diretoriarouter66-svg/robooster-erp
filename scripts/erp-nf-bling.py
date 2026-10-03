#!/usr/bin/env python3
"""Notas fiscais de saída do Bling → public.fiscal_notas (03/10/2026). SOMENTE LEITURA no Bling.

Lê as NF-e de saída das duas empresas (lista por período + detalhe de cada nota) e grava/atualiza no ERP, para o
fechamento mensal com a contabilidade (venda × nota, nota cancelada × estorno, receita do mês).
Uso: erp-nf-bling.py [--mes AAAA-MM] [--desde AAAA-MM-DD --ate AAAA-MM-DD]   (padrão: mês atual e o anterior)
"""
import sys, json, time, datetime, subprocess, urllib.parse
sys.path.insert(0, "/root/precificador-unificado/scripts"); import bling_ro
LOG = "/root/rotinas/logs/erp-nf-bling.log"
SIT = {1: "pendente", 2: "cancelada", 3: "pendente", 4: "rejeitada", 5: "autorizada", 6: "autorizada", 7: "autorizada", 8: "pendente", 9: "denegada", 10: "pendente", 11: "pendente"}
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
    if isinstance(v, (int, float)): return repr(v)
    if isinstance(v, (dict, list)): return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"

args = sys.argv[1:]
hoje = datetime.date.today()
if "--desde" in args:
    desde, ate = args[args.index("--desde") + 1], args[args.index("--ate") + 1]
elif "--mes" in args:
    a, m = map(int, args[args.index("--mes") + 1].split("-")); desde = f"{a}-{m:02d}-01"
    ate = (datetime.date(a + (m == 12), (m % 12) + 1, 1) - datetime.timedelta(days=1)).isoformat()
else:
    p = (hoje.replace(day=1) - datetime.timedelta(days=1)).replace(day=1); desde, ate = p.isoformat(), hoje.isoformat()

# o que já está gravado (para só buscar detalhe de nota nova ou que mudou de situação)
ja = {}
for l in sql("select id, situacao_cod from fiscal_notas where origem='bling';").split("\n"):
    if l.strip(): i, s = (l.split("\t") + [""])[:2]; ja[i] = int(s) if s else None

n_total = n_det = 0
for emp in ("router", "saber"):
    pag = 1
    while True:
        q = urllib.parse.urlencode({"dataEmissaoInicial": desde, "dataEmissaoFinal": ate, "tipo": 1, "limite": 100, "pagina": pag})
        d = bling_ro.get(emp, "/nfe?" + q); time.sleep(0.36)
        if "_erro" in d: log("erro na lista", emp, d); break
        its = d.get("data") or []
        for x in its:
            nid = f"bling:{emp}:{x['id']}"; cod = x.get("situacao")
            n_total += 1
            if nid in ja and ja[nid] == cod: continue
            det = bling_ro.get(emp, f"/nfe/{x['id']}"); time.sleep(0.36)
            dd = det.get("data") or {}
            if "_erro" in det or not dd: log("erro no detalhe", emp, x.get("numero"), det.get("_erro")); continue
            ct = dd.get("contato") or {}; end = ct.get("endereco") or {}
            cols = dict(id=nid, origem="bling", empresa=emp, numero=dd.get("numero"), serie=str(dd.get("serie") or ""), chave=dd.get("chaveAcesso"),
                        data_emissao=(dd.get("dataEmissao") or "").replace(" ", "T") + "-03:00" if dd.get("dataEmissao") else None,
                        situacao=SIT.get(cod, "pendente"), situacao_cod=cod, valor=dd.get("valorNota"), valor_frete=dd.get("valorFrete"),
                        contato_nome=ct.get("nome"), contato_doc=ct.get("numeroDocumento"), contato_uf=end.get("uf"),
                        pedido_loja=str(dd.get("numeroPedidoLoja") or "") or None, natureza_id=(dd.get("naturezaOperacao") or {}).get("id"),
                        link_danfe=dd.get("linkDanfe"), bruto={k: v for k, v in dd.items() if k not in ("xml",)})
            ks = list(cols)
            sql(f"insert into fiscal_notas ({', '.join(ks)}) values ({', '.join(lit(cols[k]) for k in ks)}) on conflict (id) do update set "
                + ", ".join(f"{k}=excluded.{k}" for k in ks if k != "id") + ", updated_date=now();")
            n_det += 1
        if len(its) < 100: break
        pag += 1
log(f"NF-e de saída {desde} a {ate}: {n_total} na lista, {n_det} gravadas/atualizadas")
