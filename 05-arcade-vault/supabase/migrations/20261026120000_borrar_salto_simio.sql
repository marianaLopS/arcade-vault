-- Retira SALTO SIMIO (alta en 20261019120000_juego_salto_simio.sql): el juego sale del catálogo.
-- Primero sus puntuaciones (FK a `games`), luego la fila.
delete from public.scores where game_id = 'salto-simio';
delete from public.games where id = 'salto-simio';
