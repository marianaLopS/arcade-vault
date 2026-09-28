-- SPEC 15 — Seguridad básica.
--
-- `rls_auto_enable()` la generó Supabase (no viene de ninguna migración): la usa
-- el event trigger `ensure_rls` para activar RLS en cada tabla nueva, así que se
-- queda. Pero es SECURITY DEFINER y el linter la marca como ejecutable por
-- anon/authenticated vía /rest/v1/rpc: se le quita EXECUTE. El event trigger no
-- lo necesita (lo dispara Postgres, no un rol de la API).
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Autor de la puntuación: null = invitado. Si se borra la cuenta, la marca
-- queda como de invitado en vez de desaparecer.
alter table public.scores
  add column user_id uuid null references auth.users (id) on delete set null;
comment on column public.scores.user_id is
  'Cuenta que guardó la puntuación; null = invitado. Sólo se puede insertar la propia.';

-- Antes: `with check (true)`. Ahora nadie puede firmar una puntuación en nombre
-- de otra cuenta; los invitados siguen guardando con user_id null.
drop policy "cualquiera puede guardar una puntuación" on public.scores;
create policy "invitados o la propia cuenta guardan puntuación" on public.scores
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
