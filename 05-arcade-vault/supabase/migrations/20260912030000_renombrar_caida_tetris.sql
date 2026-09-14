-- Renombra el título visible del juego: CAÍDA -> TETRIS.
-- El `id` (slug, URL y clave de GAME_ENGINES) se queda en `caida`: sólo cambia el nombre.
update public.games set title = 'TETRIS' where id = 'caida';
