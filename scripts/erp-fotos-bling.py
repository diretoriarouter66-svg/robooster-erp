#!/usr/bin/env python3
"""Fotos dos produtos importados do Bling → armazenamento do próprio ERP (03/10/2026).

O Bling entrega as fotos por link temporário (S3 assinado, vence em dias). O importador gravou esses links em
products.image_url e eles pararam de abrir. Esta rotina baixa a 1ª foto de cada produto pelo link novo (lido na hora
no Bling, só leitura) e sobe para o bucket 'uploads' do Supabase do ERP, gravando o link permanente.
Roda para quem ainda tem link do Bling (ou nenhuma foto) e tem código de origem no Bling. Idempotente.
Uso: erp-fotos-bling.py [--todos]   (--todos refaz também quem já tem foto no ERP)
"""
import sys, json, time, subprocess, urllib.request, urllib.parse, mimetypes
sys.path.insert(0, "/root/precificador-unificado/scripts"); import bling_ro
SUPABASE = "https://supabase.robooster.com.br"; BUCKET = "uploads"
def env_storage(k):
    o = subprocess.run(["docker", "service", "inspect", "supabase_supabase_storage", "--format", "{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}"], capture_output=True, text=True).stdout
    return next((l.split("=", 1)[1] for l in o.split("\n") if l.startswith(k + "=")), "")
SERVICE_KEY = env_storage("SERVICE_KEY")
def sql(q):
    c = subprocess.run("docker ps --format '{{.Names}}'|grep supabase_db", shell=True, capture_output=True, text=True).stdout.strip()
    r = subprocess.run(["docker", "exec", "-i", c, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-AtF", "\t"], input=q, capture_output=True, text=True)
    if r.returncode != 0: raise SystemExit("ERRO SQL: " + r.stderr[:400])
    return r.stdout
def log(*a): print(time.strftime("%d/%m %H:%M"), *a, flush=True)

todos = "--todos" in sys.argv
cond = "" if todos else "and (p.image_url is null or p.image_url ilike '%orgbling%' or p.image_url ilike '%bling.com%')"
linhas = [l.split("\t") for l in sql(f"select p.id, p.sku, coalesce(p.codigos_origem->'router'->>'bling_id',''), coalesce(p.codigos_origem->'saber'->>'bling_id','') "
                                       f"from products p where p.codigos_origem is not null {cond} order by p.sku;").split("\n") if l.strip()]
log(f"{len(linhas)} produto(s) para buscar foto")
ok = sem = erro = 0
for pid, sku, b_router, b_saber in linhas:
    emp, bid = ("router", b_router) if b_router else ("saber", b_saber)
    if not bid: sem += 1; continue
    d = bling_ro.get(emp, f"/produtos/{bid}"); time.sleep(0.36)
    if "_erro" in d: log("erro Bling", sku, d.get("_erro")); erro += 1; continue
    img = d.get("data", {}).get("midia", {}).get("imagens", {}) or {}
    link = next((i.get("link") for i in (img.get("internas") or []) if i.get("link")), None) or next((i.get("link") for i in (img.get("externas") or []) if i.get("link")), None)
    if not link: sem += 1; continue
    try:
        with urllib.request.urlopen(urllib.request.Request(link, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as r:
            ctype = (r.headers.get("Content-Type") or "image/jpeg").split(";")[0].strip(); dados = r.read()
    except Exception as e:
        log("erro baixando", sku, str(e)[:80]); erro += 1; continue
    if not ctype.startswith("image/") or len(dados) < 200: log("não é imagem", sku, ctype, len(dados)); erro += 1; continue
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}.get(ctype, mimetypes.guess_extension(ctype) or ".jpg").lstrip(".")
    path = f"products/{pid}_bling.{ext}"
    req = urllib.request.Request(f"{SUPABASE}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}", data=dados, method="POST",
                                 headers={"Authorization": "Bearer " + SERVICE_KEY, "apikey": SERVICE_KEY, "Content-Type": ctype, "x-upsert": "true", "Cache-Control": "max-age=31536000"})
    try: urllib.request.urlopen(req, timeout=60).read()
    except urllib.error.HTTPError as e:
        log("erro subindo", sku, e.code, e.read().decode()[:120]); erro += 1; continue
    url = f"{SUPABASE}/storage/v1/object/public/{BUCKET}/{path}"
    sql(f"update products set image_url = '{url}', updated_date = now() where id = '{pid}';")
    ok += 1
log(f"fotos: {ok} gravadas no ERP | {sem} sem foto no Bling | {erro} erro(s)")
