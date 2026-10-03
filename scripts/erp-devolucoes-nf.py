#!/usr/bin/env python3
"""Devolução de venda do Mercado Livre → rascunho da NF-e de devolução no ERP (03/10/2026).

Venda do Mercado Livre devolvida (dinheiro voltou inteiro ao comprador) ou cancelada DEPOIS da nota de saída
autorizada: o sistema prepara sozinho, em Notas Fiscais, a nota avulsa de ENTRADA (finalidade 4, CFOP 1202/2202,
referenciando a chave da nota original), com o comprador como contato e os itens da nota original. Ninguém emite
sozinho: o rascunho espera o botão "Emitir" (hoje em homologação).
Só para vendas da conta da empresa do ERP (ROUTER 66). Venda da SABER (outro CNPJ) é marcada "fazer no Bling".
Idempotente: cada venda gera no máximo um rascunho. Uso: erp-devolucoes-nf.py [--dry]
"""
import sys, json, secrets, datetime, subprocess, re
DRY = "--dry" in sys.argv
EMPRESA_ERP = "router"
LOG = "/root/rotinas/logs/erp-devolucoes-nf.log"
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
def j(s):
    try: return json.loads(s) if s else {}
    except Exception: return {}
def doc_fmt(d):
    d = re.sub(r"\D", "", d or "")
    if len(d) == 11: return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    if len(d) == 14: return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    return d

hoje = datetime.date.today().isoformat()
rows = [l.split("\t") for l in sql(
    "select p.id, p.conta, coalesce(p.pack_id,''), p.status, p.total, coalesce(p.mp_estornado,0), coalesce(p.mp_status,''), p.comprador::text, "
    "       to_char(p.data_pedido at time zone 'America/Sao_Paulo','DD/MM/YYYY'), coalesce(p.devolucao_nfe_id,''), coalesce(p.devolucao_obs,'') "
    "  from ml_pedidos p "
    " where p.devolucao_nfe_id is null and p.devolucao_obs is null "
    "   and (p.status = 'cancelled' or coalesce(p.mp_estornado,0) >= p.total - 0.005) "
    " order by p.data_pedido;").split("\n") if l.strip()]
n_rasc = n_saber = n_sem_nota = 0
for pid, conta, pack, status, total, estornado, mp_status, comprador, data_venda, _, _ in rows:
    total, estornado = float(total), float(estornado)
    # nota de saída autorizada desta venda (pelo número do pedido/pack gravado na nota)
    notas = [l.split("\t") for l in sql(
        f"select id, numero, chave, situacao, valor, bruto::text from fiscal_notas where empresa = {lit(conta)} and situacao = 'autorizada' "
        f"  and pedido_loja in ({lit(pid)}, {lit(pack or '-')}) order by data_emissao desc limit 1;").split("\n") if l.strip()]
    if not notas:
        # cancelada sem nota: nada a devolver fiscalmente
        continue
    nid, numero, chave, _, valor_nf, bruto = notas[0]
    if estornado < total - 0.005 and status != "cancelled":
        continue  # estorno parcial não é devolução inteira: fica para o fechamento apontar
    if conta != EMPRESA_ERP:
        obs = f"NF {numero} é da {conta.upper()} (outro CNPJ): a nota de devolução precisa ser feita no Bling"
        if not DRY: sql(f"update ml_pedidos set devolucao_obs = {lit(obs)}, updated_date = now() where id = {lit(pid)};")
        n_saber += 1; log("fora do ERP:", pid, obs); continue
    comp = j(comprador); b = j(bruto)
    # quem recebeu a nota original é quem devolve: dados do destinatário da nota; o cadastro do comprador no ML é reserva
    ct = b.get("contato") or {}; en = ct.get("endereco") or {}
    nome = (ct.get("nome") or " ".join(x for x in [comp.get("first_name"), comp.get("last_name")] if x).strip() or comp.get("nickname") or "Comprador Mercado Livre").strip()
    doc = re.sub(r"\D", "", ct.get("numeroDocumento") or comp.get("doc_number") or comp.get("doc") or "")
    uf = (en.get("uf") or (comp.get("state_code") or "BR-SP").split("-")[-1])[:2].upper()
    comp = dict(comp, zip_code=en.get("cep") or comp.get("zip_code"), street_name=en.get("endereco") or comp.get("street_name"), street_number=en.get("numero") or comp.get("street_number"),
                comment=en.get("complemento") or comp.get("comment"), neighborhood=en.get("bairro") or comp.get("neighborhood"), city_name=en.get("municipio") or comp.get("city_name"))
    # contato: pelo documento; sem documento, pelo nome; senão cria
    cid = ""
    if doc: cid = sql(f"select id from contatos where regexp_replace(coalesce(document,''),'\\D','','g') = {lit(doc)} limit 1;").strip()
    if not cid: cid = sql(f"select id from contatos where lower(name) = lower({lit(nome)}) limit 1;").strip()
    if not cid:
        cid = secrets.token_hex(12)
        contato = dict(id=cid, name=nome, tipos=["Cliente"], person_type="PJ" if len(doc) == 14 else "PF", document=doc_fmt(doc) or None,
                       zip_code=comp.get("zip_code"), address=comp.get("street_name"), address_number=comp.get("street_number"),
                       address_complement=(comp.get("comment") or "")[:60] or None, neighborhood=comp.get("neighborhood"), city=comp.get("city_name"),
                       state=uf, country="BR", status="active", channel="mercado_livre", notes=f"Criado pela devolução automática da venda ML {pid}", created_by="devolucoes-automaticas")
        ks = list(contato)
        if not DRY: sql(f"insert into contatos ({', '.join(ks)}, created_date, updated_date) values ({', '.join(lit(contato[k]) for k in ks)}, now(), now());")
    # itens: os da nota original, ligados ao produto do ERP pelo SKU
    itens = []
    for it in (b.get("itens") or []):
        sku = str(it.get("codigo") or "")
        prod = sql(f"select id, name, ncm, unit from products where sku = {lit(sku)} or codigos_origem->'router'->>'sku' = {lit(sku)} limit 1;").strip().split("\t")
        prod = prod + [""] * (4 - len(prod))
        itens.append(dict(product_id=prod[0] or "", sku=sku, name=it.get("descricao") or prod[1] or "Item", ncm=(it.get("classificacaoFiscal") or prod[2] or "").replace(".", ""),
                          unit=(it.get("unidade") or prod[3] or "UN"), quantity=float(it.get("quantidade") or 0), unit_price=float(it.get("valor") or 0)))
    nf_id = secrets.token_hex(12)
    nota = dict(id=nf_id, data=hoje, tipo="entrada", preset="devolucao_venda", natureza_operacao="Devolucao de venda", finalidade=4,
                cfop="1202" if uf == "SP" else "2202", csosn="102", contato_id=cid, chave_referenciada=chave, items=itens,
                informacoes_adicionais=f"Devolucao referente a NF-e {numero} (venda Mercado Livre {pid} de {data_venda}, estorno de R$ {estornado:.2f} ao comprador). Mercadoria retorna ao estoque.",
                created_by="devolucoes-automaticas")
    ks = list(nota)
    if not DRY:
        sql(f"insert into nfe_avulsas ({', '.join(ks)}, created_date, updated_date) values ({', '.join(lit(nota[k]) for k in ks)}, now(), now());"
            f"update ml_pedidos set devolucao_nfe_id = {lit(nf_id)}, updated_date = now() where id = {lit(pid)};")
    n_rasc += 1; log(f"rascunho preparado: venda {pid} ({data_venda}) R$ {total:.2f} → NF {numero} · {len(itens)} item(ns) · contato {nome}")
log(f"devoluções: {n_rasc} rascunho(s) de NF de devolução preparados | {n_saber} fora do ERP (outro CNPJ)" + (" [--dry]" if DRY else ""))
