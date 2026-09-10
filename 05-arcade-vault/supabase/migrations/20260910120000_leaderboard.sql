-- SPEC 06 — Leaderboard real y tabla de juegos.
--
-- `games` no es el catálogo de la maqueta: sólo entra aquí lo que se puede
-- jugar de verdad, que hoy es Asteroids. Así la clave foránea de `scores`
-- impide por construcción guardar la partida de un juego que no existe.
create table public.games (
  id text primary key,
  title text not null,
  created_at timestamptz not null default now()
);
comment on table public.games is
  'Juegos jugables. El id es el slug: segmento de URL y clave de GAME_ENGINES.';

-- Puntuaciones anónimas: `player` son las iniciales del modal de fin de
-- partida. La columna `user_id` llegará con la spec de autenticación.
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  player text not null check (player ~ '^[A-Z]{1,3}$'),
  score integer not null check (score >= 0 and score <= 1000000),
  created_at timestamptz not null default now()
);
comment on table public.scores is
  'Puntuaciones anónimas. Insertables por cualquiera; no editables ni borrables.';

create index scores_game_score_idx on public.scores (game_id, score desc, created_at);

-- `best` y `plays` son estado derivado, no columnas de `games`: no pueden
-- quedar desincronizadas y no hay trigger que mantener. `security_invoker`
-- hace que la vista respete la RLS de quien consulta, no la del propietario.
create view public.game_stats with (security_invoker = true) as
  select game_id,
         max(score)::integer as best,
         count(*)::integer as plays
  from public.scores
  group by game_id;

alter table public.games enable row level security;
alter table public.scores enable row level security;

-- Lectura pública de las dos tablas.
create policy "games son públicos" on public.games
  for select to anon, authenticated using (true);
create policy "scores son públicas" on public.scores
  for select to anon, authenticated using (true);

-- Escritura anónima de puntuaciones. Los CHECK de la tabla son la única
-- garantía real de formato; la Server Action valida además para dar un
-- mensaje legible. Sin políticas de update ni delete: nadie edita ni borra.
create policy "cualquiera puede guardar una puntuación" on public.scores
  for insert to anon, authenticated with check (true);

insert into public.games (id, title) values ('asteroids', 'ASTEROIDS');
