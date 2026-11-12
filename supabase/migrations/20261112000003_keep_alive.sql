-- =====================================================================
-- Costea — ping para mantener el proyecto activo
-- El plan gratuito de Supabase pausa el proyecto tras ~7 días sin actividad.
-- El workflow .github/workflows/keep-alive.yml llama a esta función cada 3 días.
-- Solo devuelve la hora del servidor: no lee ninguna tabla ni expone datos.
-- =====================================================================
create or replace function public.keep_alive()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$ select now() $$;

revoke all on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon, authenticated;
