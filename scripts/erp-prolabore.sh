#!/usr/bin/env bash
# ERP (08/10/2026, "PUBLICAR DRE"): pró-labore do mês corrente + do mês anterior (o anterior serve para abater o pró-labore
# da retirada do sócio quando o extrato do banco chega depois do fim do mês). Idempotente. Ver robooster-erp/scripts/prolabore-participacoes.sql
DB=$(docker ps --format '{{.Names}}' | grep supabase_db)
echo "$(date '+%F %T') $(docker exec "$DB" psql -U postgres -d postgres -At -c "select prolabore_mensal()" -c "select prolabore_mensal((date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 day')::date)" 2>&1 | tr '\n' ' ')"
