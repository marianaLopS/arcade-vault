-- SPEC 08 — da de alta CAÍDA en `games`.
-- Con esta fila el juego deja de pintar `seededScores()` y pasa a leer y
-- escribir en `scores`: hasLeaderboard() lo decide por la existencia de la fila.
insert into public.games (id, title) values ('caida', 'CAÍDA');
