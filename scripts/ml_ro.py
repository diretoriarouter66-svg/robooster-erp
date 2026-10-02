# Leitura SOMENTE-LEITURA do Mercado Livre com o token da conexão do precificador.
# A renovação é feita pelo PRÓPRIO app do precificador (mlAuth action=check), nunca aqui.
import json, subprocess, time, urllib.request, urllib.parse, base64, hmac, hashlib
EMP={"router":"6a08d79690feae1bd26e70e1","saber":"6a0cc36d284263ae4fcfef40"}
def psql(q):
    c=subprocess.run("docker ps --format '{{.Names}}'|grep supabase_db",shell=True,capture_output=True,text=True).stdout.strip()
    return subprocess.run(["docker","exec",c,"psql","-U","postgres","-d","postgres","-AtF","\t","-c",q],capture_output=True,text=True).stdout
def _jwt(uid):
    env=subprocess.run("docker service inspect precificador_precificador-fn --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}'",shell=True,capture_output=True,text=True).stdout
    sec=[l.split("=",1)[1] for l in env.splitlines() if l.startswith("SUPABASE_JWT_SECRET=")][0]
    b=lambda x: base64.urlsafe_b64encode(x).rstrip(b"=").decode()
    now=int(time.time()); h=b(json.dumps({"alg":"HS256","typ":"JWT"}).encode()); p=b(json.dumps({"sub":uid,"role":"authenticated","aud":"authenticated","exp":now+600,"iat":now}).encode())
    return f"{h}.{p}."+b(hmac.new(sec.encode(),f"{h}.{p}".encode(),hashlib.sha256).digest())
def token(emp):
    t,exp,uid=psql(f"select access_token, expires_at, user_id from prec_ml_token where empresa_id='{EMP[emp]}'").strip().split("\t")
    if time.time()*1000 > float(exp)-300000:
        r=urllib.request.Request("https://precificador.robooster.com.br/functions/mlAuth",data=json.dumps({"empresa_id":EMP[emp],"action":"check"}).encode(),
            headers={"Content-Type":"application/json","Authorization":"Bearer "+_jwt(uid)},method="POST")
        res=json.load(urllib.request.urlopen(r,timeout=60))
        if not res.get("connected"): raise SystemExit(f"ML {emp}: conexão do precificador caiu ({res}) — reconectar no precificador")
        t=psql(f"select access_token from prec_ml_token where empresa_id='{EMP[emp]}'").strip()
    return t
def get(emp,path):
    for i in range(4):
        try:
            r=urllib.request.Request("https://api.mercadolibre.com"+path,headers={"Authorization":"Bearer "+token(emp)})
            return json.load(urllib.request.urlopen(r,timeout=40))
        except urllib.error.HTTPError as e:
            if e.code==429: time.sleep(2+2*i); continue
            return {"_erro":e.code,"_body":e.read().decode()[:300]}
    return {"_erro":429}
