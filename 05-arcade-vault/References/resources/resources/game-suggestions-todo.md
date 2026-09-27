# Sugerencias de juegos — Arcade Vault

## 2026-09-21

**Sugerencia:** invasores
**Motivo:** Ya está en maqueta (slot, portada, categoría SHOOTER y UI), solo falta el motor. Equilibra el catálogo: ARCADE ya tiene snake y arkanoid reales, y SHOOTER solo tiene asteroids; además reutiliza la experiencia de disparo/colisiones de asteroids con menor esfuerzo que `duelo-pixel` (VERSUS, requiere rival).
**Estado:** pendiente

## 2026-09-22

**Petición:** el usuario pidió explícitamente 5 juegos clásicos de plataformas/carrera/habilidad que NO estén ya en `lib/games.ts` ni en las specs `01-10`, o sea, ignorando por esta vez el criterio por defecto de "primero terminar los 4 de maqueta" (invasores/gloton/ranaria/duelo-pixel siguen siendo la prioridad real para el próximo slot; esto es una lista de candidatos para juegos totalmente nuevos, fuera del catálogo actual).

**Sugerencia:** donkey-kong (plataformas de saltos y escaleras, tipo "SALTO SIMIO")
**Motivo:** Ninguno de los 8 juegos del catálogo tiene mecánica de salto/plataformeo vertical con obstáculos rodantes; cubriría el hueco de "plataformas" puro que ni ARCADE ni SHOOTER tienen hoy.
**Estado:** pendiente

**Sugerencia:** pole-position (carrera de vista trasera tipo Out Run/Pole Position)
**Motivo:** El catálogo no tiene categoría de carreras (`CATS` es ARCADE/PUZZLE/SHOOTER/VERSUS); un racer clásico abriría una categoría RACING nueva y aporta la mecánica de "carrera" que el usuario pidió explícitamente y que hoy no existe en ningún juego.
**Estado:** pendiente

**Sugerencia:** qbert (salto isométrico sobre pirámide de cubos)
**Motivo:** Mecánica de habilidad/precisión distinta a todo lo existente (isométrica, sin gravedad ni colisión de proyectiles); diversifica el estilo visual del catálogo, que hoy es todo vista cenital o lateral plana.
**Estado:** pendiente

**Sugerencia:** dig-dug (excavar túneles y reventar enemigos con bomba de aire)
**Motivo:** Combina laberinto + habilidad como `gloton`, pero con mecánica de excavación/creación de terreno en vez de recorrido fijo; encajaría en ARCADE sin duplicar a snake/arkanoid/gloton.
**Estado:** pendiente

**Sugerencia:** paperboy (esquivar obstáculos en bicicleta mientras repartes periódicos)
**Motivo:** Híbrido de carrera lateral + puntería/habilidad (lanzar periódicos a buzones) que no se solapa con ningún juego actual ni con `ranaria` (que es cruce estático, no scroll continuo); buen segundo candidato de RACING/ARCADE si `pole-position` se reserva para un slot puramente de carreras.
**Estado:** pendiente

## 2026-09-22

**Sugerencia (lote de 5, juegos totalmente nuevos fuera del catálogo actual):** el usuario pidió explícitamente retro clásicos misceláneos (pong-likes, pinball, estrategia simple, cartas arcade) que no se solapen con shooters/puzzles/plataformas ni con los 4 juegos ya en maqueta (`gloton`, `invasores`, `ranaria`, `duelo-pixel` — este último ya cubre el hueco "pong"). Ninguno de los 5 tiene slot en `lib/games.ts`, entrada en `lib/games/registry.ts` ni spec en `specs/`.

1. **PINBALL** — Motivo: físicas de flippers y rebote son un género arcade icónico que la plataforma no cubre nada (todo lo actual es colisión simple tipo breakout/snake); aportaría variedad de mecánica real, no solo de tema.
2. **BLACKJACK** — Motivo: primer juego de cartas del catálogo; mecánica de turnos/decisión discreta (sin loop de físicas) diversifica frente a los reflejos en tiempo real de todo lo existente, y encaja con el leaderboard por score/racha de victorias.
3. **OTHELLO / REVERSI** — Motivo: estrategia simple de tablero 8x8, sin apenas físicas ni sprites animados — bajo costo de motor, alto contraste de género frente a ARCADE/SHOOTER/PUZZLE actuales; podría abrir una categoría `ESTRATEGIA` o encajar en VERSUS (CPU o local 2P).
4. **AIR HOCKEY** — Motivo: variante de "duelo de paletas" pero con física de disco en mesa cerrada (rebotes en 4 bordes, gol en cada extremo) en vez del pong vertical de `duelo-pixel`; cubre VERSUS con una mecánica físicamente distinta, no un remake del mismo pong.
5. **BOWLING** — Motivo: único juego "de puntería con física de trayectoria + pines" del lote; aporta un loop de turnos cortos (10 frames) que ningún juego actual tiene, y un sistema de scoring propio del género (strikes/spares) distinto del score acumulado genérico.

**Estado:** pendiente

## 2026-09-22

**Sugerencia:** match-cristal (match-3 estilo Bejeweled/Candy Crush)
**Motivo:** La categoría PUZZLE solo tiene TETRIS (`caida`) real; un match-3 es un clásico arcade de lógica totalmente distinto (swap-and-match en grilla) que no está en el catálogo ni en ninguna spec, y da variedad real a PUZZLE más allá de piezas que caen.
**Estado:** pendiente

**Sugerencia:** bloque-deslizante (Sokoban / puzzle de empujar cajas)
**Motivo:** Mecánica de lógica pura basada en niveles fijos (no supervivencia ni puntuación por tiempo), complementa TETRIS/match-3 con un ritmo de juego pausado y resolución de rompecabezas, algo ausente en el catálogo actual.
**Estado:** pendiente

**Sugerencia:** laberinto-neon (juego de laberinto con recolección, estilo Pac-Man de logica/recorrido, distinto de gloton)
**Motivo:** `gloton` ya cubre el concepto tipo Pac-Man en categoría ARCADE con fantasmas; este sería un laberinto de navegación/lógica puro (encontrar salida, llaves, trampas) categorizado en PUZZLE, cubriendo el hueco de "laberintos" mencionado como ejemplo de puzzle clásico sin duplicar `gloton`.
**Estado:** pendiente

**Sugerencia:** columnas-caida (Columns, variante de bloques por color en vez de forma, distinto de TETRIS)
**Motivo:** Aunque similar en superficie a TETRIS por usar piezas que caen, la mecánica de lógica es distinta (alinear 3+ del mismo color, no encajar formas geométricas), es un clásico arcade reconocible de Sega y no está en catálogo ni specs.
**Estado:** pendiente

**Sugerencia:** rompecabezas-numerico (15-puzzle / juego deslizante de números en grilla)
**Motivo:** Puzzle de lógica minimalista y de bajo costo de implementación (grilla fija, sin física ni colisiones), ofrece una mecánica de ordenar/deslizar totalmente ausente del catálogo y sirve como opción rápida de bajo esfuerzo si se busca variedad PUZZLE con poco desarrollo.
**Estado:** pendiente

**Sugerencia:** paquete de 5 shooters/acción rápida totalmente nuevos (fuera de catálogo): `galaga`, `ciempies` (Centipede), `comando-misiles` (Missile Command), `defensor` (Defender), `contra-run-gun` (run and gun estilo Metal Slug/Contra)
**Motivo:** El usuario pidió explícitamente ideas de shooters clásicos que NO estén ya en el catálogo ni en specs (excepción justificada a la prioridad por defecto de terminar `invasores`/`gloton`/`ranaria`/`duelo-pixel`, que sigue vigente y recomendada primero). Cada uno cubre una mecánica de disparo distinta a lo ya existente (`asteroids` = free-roam gravedad cero, `invasores` maqueta = formación estática descendente): Galaga añade formación en picada + captura de nave; Centipede añade terreno destructible (hongos) y enemigo segmentado; Missile Command cambia el paradigma de input a apuntado/trayectoria con mouse y defensa de base; Defender añade scroll lateral de mundo abierto y mecánica de rescate; el run-and-gun estilo Contra/Metal Slug añade plataformas + disparo direccional, un género de acción que hoy no existe en absoluto en Arcade Vault (todo es o nave o pala, nada de personaje corriendo/saltando con arma). Verificado contra `lib/games.ts`, `lib/games/registry.ts`, `implemented-games.md` y `specs/*.md`: ninguno de los 5 aparece.
**Estado:** pendiente
