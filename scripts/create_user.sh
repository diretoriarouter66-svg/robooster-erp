#!/usr/bin/env bash
# Cria o usuário inicial no Supabase Auth (e-mail/senha), já confirmado.
# A senha é digitada por você e NÃO é gravada em lugar nenhum.
set -euo pipefail

URL="https://supabase.robooster.com.br"
EMAIL="${1:-diretoria@robooster.com.br}"
SVC=$(grep 'Service Key' /root/dados_vps/dados_supabase | sed 's/.*Service Key *: *//' | tr -d ' ')

read -r -s -p "Digite a senha para ${EMAIL}: " PW;  echo
read -r -s -p "Confirme a senha: " PW2; echo
[ "$PW" = "$PW2" ] || { echo "As senhas não conferem."; exit 1; }
[ "${#PW}" -ge 6 ] || { echo "A senha precisa ter ao menos 6 caracteres."; exit 1; }

BODY=$(E="$EMAIL" P="$PW" python3 -c 'import json,os; print(json.dumps({
  "email": os.environ["E"], "password": os.environ["P"], "email_confirm": True,
  "user_metadata": {"full_name": "Diretoria Robooster", "role": "admin"}}))')

RESP=$(curl -s -w $'\n%{http_code}' -X POST "$URL/auth/v1/admin/users" \
  -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" \
  -d "$BODY")
unset PW PW2 BODY

CODE=$(printf '%s' "$RESP" | tail -n1)
JSON=$(printf '%s' "$RESP" | sed '$d')
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
  echo "✅ Usuário criado: $(printf '%s' "$JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("email"))')"
  echo "   Acesse: https://erp.robooster.com.br  (login com $EMAIL e a senha digitada)"
else
  echo "⚠️  Falha (HTTP $CODE):"
  printf '%s\n' "$JSON"
fi
