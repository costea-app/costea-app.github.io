#!/bin/sh
# Aplica las migraciones sobre una base de datos NUEVA y ejecuta las pruebas de RLS.
# Cada ejecución usa su propia base, así que se puede repetir sin reiniciar el contenedor.
set -e
DB="costea_rls_$(date +%s)_$$"
createdb -U postgres "$DB"
trap 'dropdb -U postgres --if-exists "$DB" >/dev/null 2>&1 || true' EXIT
export PGDATABASE="$DB"
PSQL="psql -v ON_ERROR_STOP=1 -q -X"
$PSQL -f /supabase/tests/00_supabase_stub.sql
for f in /supabase/migrations/*.sql; do
  echo "Aplicando migración $(basename "$f")"
  $PSQL -f "$f"
done
status=0
$PSQL -o /dev/null -f /supabase/tests/rls_test.sql > /tmp/rls.log 2>&1 || status=$?
sed "s/^psql:[^ ]* NOTICE:  /  /" /tmp/rls.log
[ "$status" = 0 ] || { echo "FALLARON las pruebas de RLS"; exit "$status"; }
echo "OK: todas las pruebas de RLS pasaron"
