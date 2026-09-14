-- SPEC 09 — da de alta ARKANOID en `games`.
-- Con esta fila el juego deja de pintar `seededScores()` y pasa a leer y
-- escribir en `scores`. `bloque-buster` nunca tuvo fila: no hay nada que renombrar.
insert into public.games (id, title) values ('arkanoid', 'ARKANOID');
