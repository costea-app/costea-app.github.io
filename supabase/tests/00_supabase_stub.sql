-- Imitación mínima del entorno de Supabase para probar migraciones y RLS en un Postgres simple.
-- NO se ejecuta en Supabase real (allí ya existen auth.users, auth.uid() y los roles).
-- Los roles son globales del clúster: se crean solo si no existen (permite repetir las pruebas).
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  -- Igual que Supabase: claim.sub o, si no existe, claims->>'sub'.
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
