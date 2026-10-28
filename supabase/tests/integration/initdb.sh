#!/bin/sh
# Inicializa el Postgres de integración: entorno tipo Supabase + migraciones + roles de PostgREST.
set -e
psql -v ON_ERROR_STOP=1 -q -U postgres -f /supabase/tests/00_supabase_stub.sql
for f in /supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -U postgres -f "$f"; done
psql -v ON_ERROR_STOP=1 -q -U postgres -f /supabase/tests/integration/00_users_and_postgrest.sql
touch /tmp/costea-db-ready
