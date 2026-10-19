# SPEC — OTHELLO: variante «Eclipse relámpago» con casillas caídas, anclas y reloj de turno

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-13
> **Objetivo:** Diseñar un Othello 8×8 con tres reglas añadidas (agujeros en el tablero que crecen con el nivel, dos anclas por partida que hacen una ficha involteable y un reloj de 10 s por turno), contra una CPU de fuerza fija, con dos vidas y una racha que multiplica la puntuación.

---

## Por qué existe esta spec

Esta es la variante 02 de `othello`, junto a `specs/game-jam/othello/01-clasico-torneo.md`.
Comparte con ella el género, el tablero 8×8 de celdas de 64 px en un mundo de 800×600, las reglas
base del volteo y el contrato `GameEngine`, pero cambia el eje de diseño: la 01 sube la
**fuerza del rival** y deja las reglas intactas; esta mantiene la CPU constante y **deforma el
tablero y el ritmo**.

- **Agujeros («eclipses»):** casillas que ya no existen. Un agujero corta las líneas de volteo y
  convierte las esquinas y bordes en un terreno impredecible, así que la tabla de valores
  posicionales de toda la vida deja de servir. Cada victoria añade más agujeros.
- **Anclas:** dos por partida. Una ficha anclada no puede voltearse jamás; es la única decisión
  táctica de un solo uso que da al jugador algo que la CPU no tiene.
- **Reloj de turno:** 10 s por jugada. Convierte un juego de reflexión en uno de decisión rápida
  y premia con puntos la velocidad.

Como Snake (SPEC 10) y la variante 01, no hay código de referencia: las constantes de esta spec
son el diseño, no un ajuste posterior.

El contrato `GameEngine` encaja sin cambios. El reloj corre dentro del bucle con `dt`, nunca con
`setInterval`, para que la pausa lo congele.

---

## Alcance

**Dentro:**

- `lib/games/othello-eclipse/engine.ts`: motor nuevo, estado en la clausura de
  `createOthelloEclipseGame`, geometría simple con `ctx`, sin sprites. El `game-id` de la
  carpeta es `othello`; si se promueve esta variante, el motor puede vivir en
  `lib/games/othello/` (la ruta final la decide la promoción).
- `lib/games/othello-eclipse/rules.ts`: reglas puras (`legalMoves`, `applyMove`, `pickHoles`,
  `cpuMove`) que conocen agujeros y anclas.
- Tablero 8×8 de celdas de 64 px (`BOARD_X 144`, `BOARD_Y 44`).
- **Agujeros:** en pares simétricos por rotación de 180°. Nunca en las 4 casillas centrales ni
  en las 4 esquinas. Su número crece con el nivel (ver paso 1). Se eligen al azar al iniciar cada
  partida y se garantiza que el jugador tenga al menos un movimiento legal de apertura.
- **Anclas:** 2 por partida. Con el ancla armada, la jugada legal siguiente deja una ficha
  inquebrantable (se dibuja con un aro dorado). Solo el jugador las tiene.
- **Reloj de turno:** 10 s para el jugador. Si se agota, se juega automáticamente la jugada legal
  que más fichas voltea, sin puntos de velocidad y rompiendo la racha.
- **CPU de fuerza fija:** nivel «voraz posicional» (1 capa, tabla posicional con agujeros), con un
  15 % de jugadas aleatorias para no ser predecible. No sube con el nivel.
- 2 vidas (una derrota gasta una).
- **Racha:** victorias consecutivas; multiplica los puntos de partida.
- Entrada: clic o toque sobre una celda legal; flechas + `Enter` / espacio como alternativa;
  `A` arma o desarma un ancla.
- Una línea `othello` en `GAME_ENGINES` (referencial: esta spec no la aplica).

**Fuera de alcance (para specs futuras o para la variante 01):**

- Escalera de CPUs de fuerza creciente (variante 01).
- Más de un tipo de ancla, anclas para la CPU, o anclas que se recargan.
- Agujeros que aparecen o se mueven en mitad de la partida: los agujeros son fijos por partida.
- Tableros que no sean 8×8.
- Dos jugadores en local.
- Sonido y animaciones 3D.
- Modificar `lib/games.ts` o `lib/games/registry.ts`.
- Migraciones de Supabase.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas. El leaderboard se enciende con una fila en `games`
(`othello`, `OTHELLO`) cuando la variante se promueva; esa migración no forma parte de esta
propuesta. `scores.user_id` lo rellena la acción de guardado de la plataforma (SPEC 15).

Tipos locales, sin exportar fuera de su carpeta:

```ts
type Piece = 0 | 1 | 2; // 0 vacía, 1 jugador, 2 CPU
type Board = {
  cells: Piece[]; // 64, índice = row * 8 + col
  holes: boolean[]; // 64: true = casilla caída, ni se pisa ni se cruza
  anchored: boolean[]; // 64: true = ficha inquebrantable
};
type Move = { row: number; col: number; flips: number[] };
type Phase = "player" | "cpu-wait" | "flipping" | "match-over" | "gameover";
```

Estado en la clausura:

- `board: Board`, `turn: 1 | 2`, `legal: Move[]`, `cursor`, `hover`, `lastMove`.
- `anchorsLeft` (0–2), `anchorArmed: boolean`.
- `turnClock` (ms restantes del turno del jugador), `clockPaused` (verdadero fuera de `player`).
- `score`, `lives`, `level`, `streak`, `matchNo`.
- `phase`, `cpuTimer`, `bannerText`, `bannerTimer`, `flipAnim`.
- Bucle: `rafId`, `lastTime`, `destroyed`.

---

## Plan de implementación

### 1. Constantes de diseño

```
W 800 · H 600 · CELL 64 px · N 8 · BOARD_X 144 · BOARD_Y 44
LIVES_START 2 · ANCHORS_PER_MATCH 2
TURN_TIME 10000 ms · CPU_DELAY 450 ms · FLIP_DURATION 180 ms
BANNER_DURATION 1400 ms · DT_MAX 50 ms
HOLES(level) = min(10, 2 × level)      (nivel 1 → 2 agujeros, … nivel 5+ → 10; siempre par)
CPU_RANDOM_RATE 0.15
MOVE_POINTS: +1 por ficha volteada · +10 por esquina · +5 por ficha anclada colocada
SPEED_BONUS: floor(segundos restantes del reloj) por jugada del jugador   (0–9)
TIMEOUT: sin bonus, racha a 0, −25 puntos (mínimo score 0)
MATCH_WIN: (100 + 8 × (fichas jugador − fichas CPU)) × min(3, 1 + 0.5 × (streak − 1))
           con streak ya incrementada; ejemplo: 3.ª victoria seguida → ×2
MATCH_DRAW: 40, racha sin cambios
MATCH_LOSS: 0 puntos, racha a 0, −1 vida
```

Tabla posicional de la CPU: esquina +100; casillas X (diagonal a una esquina) −50; casillas C
(adyacentes a una esquina) −20; borde +10; resto 0. **Si una esquina es un agujero, las casillas X
y C que la rodean valen 0** (ya no hay esquina que regalar).

Generación de agujeros (`pickHoles(level)`):

1. Candidatas: todas las celdas salvo las 4 centrales y las 4 esquinas.
2. Elegir `HOLES(level) / 2` celdas al azar y añadir su simétrica `(7 − row, 7 − col)`.
3. Rechazar el reparto si el jugador no tiene ningún movimiento de apertura. Hasta 20 intentos; si
   se agotan, usar el reparto fijo de respaldo `[(1,1),(6,6),(1,6),(6,1)]` recortado al número
   que toque.

Comprobación: `npm run build` limpio; 1000 llamadas a `pickHoles` para cada nivel no producen
ninguna celda prohibida ni un reparto sin movimientos.

### 2. Reglas puras con agujeros y anclas

`rules.ts`:

- `legalMoves(board, who)`: igual que Othello estándar, con tres diferencias: una celda `hole` no
  es colocable; recorrer una línea se **corta** al llegar a un agujero (una línea que lo cruza no
  se cierra); y una ficha `anchored` rival **cierra** la línea normalmente pero **no entra en
  `flips`** (si una anclada rival está en medio de una línea, esa línea no se voltea: el ancla
  actúa de muro para el volteo, no de ficha propia).
- `applyMove(board, move, who, anchor)`: coloca, voltea `flips`, y si `anchor` marca
  `anchored[idx] = true`.
- `isOver(board)`: ningún bando tiene movimientos. La partida también termina cuando no quedan
  celdas vacías no-agujero.
- `cpuMove(board)`: con probabilidad 0,15 elige un legal al azar; si no, el de mayor
  `valor posicional + volteos`.

Comprobación: casos a mano: una línea cortada por un agujero no voltea; una ficha anclada rival
dentro de una línea impide ese volteo pero no impide otras líneas de la misma jugada.

### 3. Motor: turnos, reloj y anclas

- `initMatch()`: tablero inicial estándar (4 fichas centrales), `holes = pickHoles(level)`,
  `anchorsLeft = 2`, `anchorArmed = false`, `turnClock = TURN_TIME`, `phase = "player"`.
- `initGame()`: `score = 0`, `lives = 2`, `level = 1`, `streak = 0`, `matchNo = 0`, `initMatch()`.
- Turno del jugador: el reloj decrece con `dt`. Al colocar, `score += SPEED_BONUS + MOVE_POINTS`
  y el reloj se detiene hasta el siguiente turno suyo.
- `A` (o pulsar de nuevo `A`) alterna `anchorArmed`, solo si `anchorsLeft > 0`. Con el ancla
  armada, la siguiente jugada legal consume un ancla y deja la ficha inquebrantable. Armar un ancla
  no gasta tiempo ni turno. Cambiar de turno por pase **no** desarma el ancla.
- Reloj agotado: `autoPlay()` ejecuta la jugada legal con más volteos (sin gastar ancla), aplica
  `TIMEOUT` y sigue como una jugada normal.
- Pases: si un bando no tiene movimiento pasa (banner `SIN MOVIMIENTOS`); con dos pases seguidos
  termina la partida. El reloj no corre durante un pase.
- Fin de partida: se aplican `MATCH_WIN` / `MATCH_DRAW` / `MATCH_LOSS`.
  - Victoria: `streak += 1` antes de puntuar; `level += 1` (sin tope; los agujeros topan en 10).
  - Empate: mismo nivel y misma racha.
  - Derrota: `streak = 0`, `lives -= 1`; con 0 vidas, game over; si no, mismo nivel.
- Game over: `stopLoop()` y `onGameOver(score)` **una sola vez**; `resume()` es no-op después.

Comprobación: forzar `turnClock` a 0 y verificar la jugada automática, la racha a 0 y los −25.

### 4. Motor: bucle, entrada y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`. `onLives(2)` y `onLevel(1)` al inicio.
- Entrada de puntero: `pointerdown` sobre el canvas, convertida a coordenadas lógicas con
  `rect.width` / `rect.height`. Una celda hole o no legal se ignora sin consumir ancla ni turno.
- Entrada de teclado: `GAME_KEYS` = `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter`,
  `Space`, `KeyA`. `preventDefault()` solo para esas. El cursor salta por encima de los agujeros
  (se salta a la siguiente celda no-agujero en esa dirección; si no hay, se queda). `P` y `Escape`
  no llegan al motor.
- Listeners `keydown`, `pointerdown`, `pointermove` y `blur` sobre el canvas, nunca sobre `window`.
- `draw()`: fondo oscuro; los agujeros como cuadros vacíos con un borde discontinuo que dejan ver
  el fondo; fichas como círculos; las ancladas con aro dorado; las legales con un punto, y con
  el ancla armada con un punto dorado; un **anillo de cuenta atrás** alrededor del tablero (o una
  barra bajo él) que se vacía en `TURN_TIME` y se vuelve rojo en los últimos 3 s; un indicador
  `ANCLAS ◉◉` con las restantes. Rótulos propios del juego: `TU TURNO`, `CPU PIENSA…`,
  `ANCLA ARMADA`, `TIEMPO`, y los banners de partida. **Nunca** puntos, vidas, nivel, racha ni overlay
  de game over: eso es de la plataforma (la racha se refleja solo en el banner de victoria:
  `GANAS ×2`).
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar: el reloj no avanza durante la pausa.
- `restart()`, `destroy()` e `initGame(); draw();` antes de devolver, igual que el resto de
  motores.

Comprobación: `npm run build` limpio; con `npm run dev` el tablero muestra agujeros y el reloj
corre.

### 5. Registrar (referencial)

Al promover la spec: `othello: { create: createOthelloEclipseGame, width: 800, height: 600,
controls: "clic o flechas y Enter para colocar; A arma un ancla" }` en `lib/games/registry.ts`,
una ficha `othello` en `lib/games.ts` y `insert into public.games (id, title) values ('othello',
'OTHELLO')`. Si el usuario elige las dos variantes, se promueven como `id` distintos. Nada de
esto se hace en la propuesta.

### 6. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido manual
de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/othello` muestra un canvas de 800×600 con un tablero 8×8 y 2 agujeros en el nivel 1,
      simétricos por rotación de 180°, nunca en el centro ni en las esquinas.
- [ ] Al empezar hay al menos un movimiento legal marcado para el jugador, en todas las
      partidas de una tanda de 50 reinicios.
- [ ] No se puede colocar sobre un agujero y una línea de volteo no lo atraviesa.
- [ ] Pulsar `A` muestra `ANCLA ARMADA`; la siguiente jugada deja una ficha con aro dorado y el
      contador de anclas baja de 2 a 1. Pulsar `A` otra vez antes de jugar la desarma sin gastarla.
- [ ] Una ficha anclada nunca cambia de color por muchas jugadas de la CPU que la rodeen.
- [ ] Con 0 anclas, `A` no hace nada.
- [ ] El anillo/barra de tiempo se vacía en 10 s y se pone rojo en los últimos 3 s.
- [ ] Si el reloj llega a 0 se juega sola la jugada legal con más volteos, se restan 25 puntos
      (sin bajar de 0) y la racha vuelve a 0.
- [ ] Jugar rápido suma el bonus de velocidad: colocar con 9 s restantes suma 9 puntos.
- [ ] La CPU no usa anclas y su nivel de juego es el mismo en el nivel 1 y en el 5.
- [ ] Ganar una partida sube el HUD de nivel y añade 2 agujeros hasta un máximo de 10.
- [ ] La segunda victoria seguida multiplica la puntuación de partida por 1,5 y la tercera por 2
      (tope ×3).
- [ ] Perder resta una vida (2 → 1 → 0), pone la racha a 0 y mantiene el nivel; con 0 vidas se
      abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] Empatar no quita vida, ni cambia el nivel ni la racha.
- [ ] El canvas no dibuja puntos, nivel, vidas ni racha, ni ningún overlay de game over.
- [ ] El botón `PAUSA` congela el reloj de turno y la espera de la CPU; `REANUDAR` no descuenta
      tiempo ni mueve a la CPU de golpe; `P` y `Escape` hacen lo mismo.
- [ ] Con el canvas enfocado, flechas, espacio y `A` no hacen scroll ni disparan atajos de la
      página; escribir `A` en el campo de iniciales no arma un ancla.
- [ ] Un clic con el canvas escalado por CSS cae en la celda correcta.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, 2 vidas, racha 0 y 2 anclas sin recargar.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'othello'` (una vez
      promovida la spec y dada de alta la fila en `games`), con `user_id` según SPEC 15.
- [ ] Esa puntuación aparece en `/salon?juego=othello` y en `/juegos/othello` sin recargar a
      mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Navegar de `/jugar/othello` a `/biblioteca` y volver no duplica el bucle ni los listeners.
- [ ] Dejar la pestaña en segundo plano y volver no agota el reloj de golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid` y `/jugar/snake` se juegan igual que
      antes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/othello`.

---

## Decisiones

- **Sí:** CPU de fuerza fija. La dificultad creciente la aporta el tablero, y esto diferencia el
  diseño de la variante 01 en vez de repetir su escalera.
- **Sí:** agujeros simétricos por rotación de 180°. Mantiene el reparto justo para ambos bandos.
- **No:** agujeros en el centro o las esquinas. Romper la apertura o eliminar el concepto central
  del juego sería otro juego.
- **Sí:** agujeros fijos durante la partida. Que cambien en mitad de la jugada obligaría a
  recalcular legales y a explicar el cambio visualmente.
- **Sí:** el ancla es una acción del jugador, no automática. Es la decisión táctica de un solo uso
  del juego; automatizarla la mataría.
- **Sí:** el ancla actúa de muro para el volteo, no de ficha propia cerrando líneas ajenas. Regla
  simple y verificable.
- **No:** anclas para la CPU. Una CPU voraz con anclas sería injusta sin una IA que sepa cuándo
  usarlas.
- **Sí:** reloj de 10 s con jugada automática. Sin castigo el reloj sería decorado; con partida
  perdida sería excesivo.
- **Sí:** −25 puntos por timeout y racha a 0. Duele sin matar la partida.
- **Sí:** 2 vidas y no 3. Con una racha que multiplica, perder tiene que pesar.
- **Sí:** la racha se muestra solo en el banner. El HUD lo pone la plataforma y no tiene campo de
  racha; añadirlo cambiaría la plataforma.
- **No:** sonido.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                            | Mitigación                                                                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Un reparto de agujeros deja al jugador sin movimientos de apertura.               | `pickHoles` rechaza y reintenta hasta 20 veces; respaldo fijo; probado con 1000 repartos por nivel.   |
| Agujeros que aíslan regiones del tablero dejan celdas inalcanzables y partidas sin fin. | `isOver` considera «sin celdas vacías colocables»; con dos pases seguidas también termina.    |
| Las reglas de ancla y agujero producen volteos ambiguos.                          | Reglas puras en `rules.ts` con los dos casos a mano del paso 2; el ancla nunca entra en `flips`.      |
| El reloj sigue corriendo en pausa, en pase o durante el turno de la CPU.          | `clockPaused` fuera de `phase = "player"`; `dt` capado y `lastTime = null` al reanudar.                |
| Con el canvas fuera de foco, `A` y las flechas cambian el estado sin ser vistas.  | Listeners en el canvas, no en `window`; `blur` desarma el ancla y no pierde turno.                     |
| Tras niveles altos (10 agujeros) el tablero se vuelve injugable o trivial.        | `HOLES` topa en 10; se verifica a mano en nivel 5+, y el balance fino va a una spec posterior.        |
| El bonus de velocidad incentiva jugar sin pensar y rompe el equilibrio de puntos. | Máximo 9 puntos por jugada frente a ~100 por victoria; el multiplicador de racha pesa más.            |
| La CPU con 15 % de azar pierde la partida con un movimiento absurdo y hunde la tensión. | El 15 % se aplica solo a la elección entre legales; nunca descarta una esquina disponible.      |
| Escribir en el campo de iniciales arma anclas o mueve el cursor.                  | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                            |

---

## Lo que **no** entra en esta spec

- Escalera de CPUs de fuerza creciente (variante 01).
- Anclas para la CPU, anclas recargables o más de un tipo.
- Agujeros dinámicos en mitad de partida.
- Dos jugadores en local o tableros de otro tamaño.
- Sonido.
- Controles táctiles dedicados (el toque en una celda ya funciona; `A` en móvil requiere un botón
  del mando táctil, que es otra spec).
- Aplicar la migración, tocar `lib/games.ts` o `lib/games/registry.ts`.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
