#!/usr/bin/env python3
"""08/10/2026 — capturas da DRE Realizada (set e out/2026) e das Categorias do Financeiro, SÓ LEITURA.
Uso: UID_ERP=... python3 erp-prolabore-shot.py <base_url> <prefixo_saida> [--config]
Grava <prefixo>-dre-set.jpg, <prefixo>-dre-out.jpg, (<prefixo>-config.jpg) e <prefixo>-dre.json (linhas: rótulo, set, out, total).
Modelo: /root/erp-revisao-shot.py (sessão injetada, CDP headless). Segredo /root/.erp-shot-jwt não é impresso."""
import json, os, sys, time, subprocess, urllib.request, base64, hmac, hashlib
sys.path.insert(0, "/root/rotinas"); from cdp_shot import CDP
BASE = sys.argv[1].rstrip("/"); PREF = sys.argv[2]; COM_CONFIG = "--config" in sys.argv
SEC = open("/root/.erp-shot-jwt").read().strip(); UID = os.environ["UID_ERP"]; EMAIL = "diretoria@robooster.com.br"
def b64(x): return base64.urlsafe_b64encode(x).rstrip(b"=").decode()
now = int(time.time()); h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
p = b64(json.dumps({"sub": UID, "role": "authenticated", "aud": "authenticated", "exp": now + 3600, "iat": now, "email": EMAIL, "app_metadata": {"provider": "email"}, "user_metadata": {}, "session_id": "diag"}).encode())
tok = f"{h}.{p}." + b64(hmac.new(SEC.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
sess = {"access_token": tok, "token_type": "bearer", "expires_in": 3600, "expires_at": now + 3600, "refresh_token": "diag", "user": {"id": UID, "aud": "authenticated", "role": "authenticated", "email": EMAIL, "app_metadata": {"provider": "email"}, "user_metadata": {}}}
port = 9381; W, H = 1600, 2200
proc = subprocess.Popen(["/snap/bin/chromium", "--headless", "--no-sandbox", "--disable-gpu", f"--remote-debugging-port={port}", f"--user-data-dir=/root/cdpprof{port}", f"--window-size={W},{H}", "--hide-scrollbars", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    ws = None
    for _ in range(60):
        try:
            tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2)); pg = next((t for t in tabs if t.get("type") == "page"), None)
            if pg: ws = pg["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    c = CDP(ws); c.call("Page.enable"); c.call("Runtime.enable")
    def ev(js):
        r = c.call("Runtime.evaluate", {"expression": js, "returnByValue": True})
        return r.get("result", {}).get("value")
    def shot(nome, altura=None):
        if altura: c.call("Emulation.setDeviceMetricsOverride", {"width": W, "height": int(altura), "deviceScaleFactor": 1, "mobile": False}); time.sleep(0.8)
        r = c.call("Page.captureScreenshot", {"format": "jpeg", "quality": 82}); open(f"{PREF}-{nome}.jpg", "wb").write(base64.b64decode(r["data"]))
    def esperar(cond, teto=30):
        t0 = time.time()
        while time.time() - t0 < teto:
            if ev(cond): return True
            time.sleep(0.5)
        return False
    c.call("Page.navigate", {"url": BASE + "/robots.txt"}); time.sleep(2)
    ev("localStorage.setItem('sb-supabase-auth-token', %s); 'ok'" % json.dumps(json.dumps(sess)))
    c.call("Emulation.setDeviceMetricsOverride", {"width": W, "height": H, "deviceScaleFactor": 1, "mobile": False})
    c.call("Page.navigate", {"url": BASE + "/dre"})
    esperar("[...document.querySelectorAll('button')].some(b=>/DRE Realizada/.test(b.innerText))")
    ev("[...document.querySelectorAll('button')].find(b=>/DRE Realizada/.test(b.innerText)).click()")
    esperar("[...document.querySelectorAll('td')].some(t=>/Resultado Líquido/.test(t.innerText))")
    time.sleep(3)
    linhas = ev("""[...document.querySelectorAll('tbody tr')].map(tr=>[...tr.children].map(td=>td.innerText.trim()))""") or []
    cab = ev("[...document.querySelectorAll('thead th')].map(t=>t.innerText.trim())") or []
    iset = next((i for i, t in enumerate(cab) if t.lower().startswith("set")), 9); iout = next((i for i, t in enumerate(cab) if t.lower().startswith("out")), 10)
    dados = [{"rotulo": l[0], "set": l[iset] if len(l) > iset else "", "out": l[iout] if len(l) > iout else "", "total": l[-1]} for l in linhas if l]
    erro = ev("/Something went wrong|is not defined|Cannot read|before initialization/.test(document.body.innerText)")
    json.dump({"cabecalho": cab, "linhas": dados, "erro_na_tela": erro, "rodape": ev("document.body.innerText.split('Cartão de crédito')[0].slice(-600)")}, open(f"{PREF}-dre.json", "w"), ensure_ascii=False, indent=1)
    alt = ev("Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)") or H
    for nome, mes in (("dre-set", "Set"), ("dre-out", "Out")):
        ev("[...document.querySelectorAll('thead th')].find(t=>t.innerText.trim().toLowerCase().startsWith('%s')).click()" % mes.lower()); time.sleep(1)
        shot(nome, min(alt + 40, 4000))
    if COM_CONFIG:
        c.call("Emulation.setDeviceMetricsOverride", {"width": W, "height": H, "deviceScaleFactor": 1, "mobile": False})
        c.call("Page.navigate", {"url": BASE + "/financial"})
        esperar("[...document.querySelectorAll('button')].some(b=>/^Categorias/.test(b.innerText.trim()))")
        time.sleep(2)
        ev("[...document.querySelectorAll('button')].find(b=>/^Categorias/.test(b.innerText.trim())).click()")
        esperar("[...document.querySelectorAll('[role=dialog]')].some(d=>/Participação nos lucros/.test(d.innerText))", 15)
        time.sleep(1.5)
        # rola a lista até o bloco de participações para a captura
        ev("(()=>{const el=[...document.querySelectorAll('[role=dialog] *')].find(e=>/^Distribuição de lucros$/.test((e.innerText||'').trim()) && e.tagName==='H4'); if(el) el.scrollIntoView({block:'start'}); return !!el})()")
        time.sleep(1); shot("config")
        json.dump({"dialogo": ev("(document.querySelector('[role=dialog]')||{}).innerText||''")}, open(f"{PREF}-config.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps({"ok": True, "erro_na_tela": erro, "linhas": len(dados)}))
finally:
    proc.terminate()
