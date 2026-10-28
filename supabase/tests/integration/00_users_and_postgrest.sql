-- Solo para la prueba de integración local con PostgREST (no se usa en Supabase real).
do $$ begin create role authenticator login password 'authenticator-solo-pruebas' noinherit; exception when duplicate_object then null; end $$;
grant anon, authenticated to authenticator;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b@example.com');
