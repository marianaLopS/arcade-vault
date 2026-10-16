# SPEC — QBERT: pirámide clásica

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-16
> **Objetivo:** Diseñar un port fiel al Q*bert de 1982 — un saltarín que recorre en diagonal una
> pirámide isométrica de 28 cubos cambiándolos de color, esquiva a Coily y a las bolas rojas,
> atrapa a Slick, y escapa con los discos voladores — como ficha nueva `qbert` en categoría
> `ARCADE`, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

El catálogo real (`asteroids`, `caida`, `arkanoid`, `snake`, `frogger`) está hecho de vista
cenital o lateral plana, con movimiento continuo en píxeles (Asteroids, Arkanoid, Frogger en su
recorrido) o en una grilla ortogonal (Snake, Caída). Ninguno tiene **movimiento discreto sobre
una superficie isométrica** ni la mecánica de «pintar» el terreno que se pisa: el progreso del
nivel no es destruir ni sobrevivir, sino **completar un mapa** a base de saltos. Q*bert aporta
eso, más un enemigo perseguidor (Coily) cuya inteligencia es una sola regla de distancia, lo
bastante simple para especificarla entera.

Como con Snake (SPEC 10) y con las variantes de `ciempies`, **no hay código de referencia**: no
existe ninguna carpeta `References/.../qbert` en el repositorio, solo la mención en
`game-suggestions-todo.md`. Las constantes de este documento son el diseño en sí; cambiarlas
durante la implementación es rediseñar, no implementar. El motor dibuja todo con primitivas de
canvas (rombos y paralelogramos para los cubos, círculos para los personajes): no hay spritesheet
que portar.

Esta variante es la lectura **fiel y mínima** del arcade original: pirámide de 7 filas, tres
reglas de color que se alternan por nivel, cuatro enemigos (huevo/Coily, bola roja, Slick) y los
discos de escape. La segunda variante (`02-piramide-inestable.md`) cambia el contrato de
presión: en lugar de enemigos variados, la propia pirámide se desmorona con el tiempo y los
saltos encadenados dan multiplicador.

**Nota de nombre:** `Q*bert` es una marca registrada. El `game-id` es `qbert` y el título del
catálogo es `QBERT` por coherencia con la sugerencia original; antes de publicar fuera del
entorno de aprendizaje convendría renombrarlo (ver Riesgos). Los personajes se dibujan como
formas genéricas, sin reproducir el diseño original.

---

## Alcance

**Dentro:**

- `lib/games/qbert/engine.ts`: motor nuevo, todo el estado en la clausura de `createQbertGame`,
  sin assets externos.
- Mundo lógico de **800×600**, el mismo marco 4/3 de Asteroids, Arkanoid y Snake.
- Pirámide de **7 filas** (28 cubos) en proyección isométrica fija, dibujada con el algoritmo
  del pintor (de atrás hacia delante).
- Movimiento por **salto discreto** en las cuatro diagonales de pantalla; un salto dura un
  tiempo fijo y no se puede cancelar.
- Tres reglas de color que rotan por nivel: un salto, dos saltos, y alternancia.
- Enemigos: **huevo morado → Coily** (perseguidor), **bola roja** (peligro aleatorio) y
  **Slick** (deshace colores; es inofensivo y se puntúa al atraparlo).
- **Dos discos voladores** de escape que llevan al jugador a la cima y eliminan a Coily.
- 3 vidas, vida extra cada 8000 puntos con tope de 5.
- Niveles sin fin con enemigos y saltos más rápidos hasta un tope.
- Controles de teclado y cruceta táctil (flechas) sin botones A/B.
- Nueva ficha `qbert` en `lib/games.ts` (categoría `ARCADE`) y clase de portada `cover-qbert`
  en `app/globals.css`.
- Una línea `qbert` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('qbert', 'QBERT')` y su aplicación.

**Fuera de alcance (para specs futuras o para la variante `02-piramide-inestable.md`):**

- Derrumbe de filas, multiplicador por combo o cualquier presión por temporizador.
- Segunda ola de enemigos (Ugg, Wrongway, Sam como entidad distinta de Slick).
- Pirámides de otras formas, discos en posiciones variables, o varios mapas.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Modo de dos jugadores.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla nueva, ni columna, ni tipo de plataforma.** `GameEngineEntry` ya
existe desde la SPEC 08; `scores` y `game_stats` sirven a este juego sin tocarlas, y el
leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Hop = "ul" | "ur" | "dl" | "dr";           // arriba-izq, arriba-der, abajo-izq, abajo-der
type Cell = { r: number; c: number };            // r 0..6 · c 0..r · fuera de eso = vacío/disco
type Rule = "one" | "two" | "toggle";
type EnemyKind = "egg" | "coily" | "ball" | "slick";
type Mover = {
  from: Cell; to: Cell;                          // celda lógica de salida y de llegada
  t: number;                                     // ms transcurridos del salto actual; -1 = quieto
  dur: number;                                   // duración del salto en ms
};
type Player = Mover & { mode: "idle" | "hop" | "fall" | "disc" | "hit" };
type Enemy = Mover & { kind: EnemyKind; wait: number; hatch: number; doomed: boolean };
type Disc = { cell: Cell; side: "left" | "right"; used: boolean };
```

Estado en la clausura de `createQbertGame`:

- `cubes: number[]` — 28 estados de color (`índice = r*(r+1)/2 + c`): `0` base, `1` intermedio,
  `2` objetivo de la regla `two`.
- `rule: Rule`, `target: number` (estado objetivo: 1 en `one` y `toggle`, 2 en `two`).
- `player: Player`, `pending: Hop | null` (un solo salto en buffer), `enemies: Enemy[]`,
  `discs: Disc[]` (siempre 2 por nivel).
- `score`, `lives`, `level`, `nextExtraLife`.
- `state: "ready" | "playing" | "dying" | "levelclear" | "gameover"`, `stateT` (ms en el estado).
- `spawnAccum` (ms), `spawnGrace` (ms sin spawns tras empezar o reaparecer).
- Bucle: `rafId`, `lastTime`, `destroyed`. Entrada: ninguna tecla mantenida; solo `pending`.

**Geometría isométrica** (mundo 800×600):

```
CUBE_W 64 · TOP_H 32 · SIDE_H 32
ROW_DX 32 (desplazamiento horizontal por fila) · ROW_DY 48 (vertical por fila)
APEX (centro de la cara superior del cubo (0,0)) = (400, 110)
centro(r, c) = ( 400 + (c - r/2) * 64 , 110 + r * 48 )
```

El plano de saltos es una cuadrícula ortogonal en las coordenadas `a = c`, `b = r - c`: los
cuatro saltos son `±1` en una sola de ellas. Por eso la **distancia entre celdas** es
`|Δc| + |Δ(r−c)|`, y es la métrica que usa Coily.

---

## Plan de implementación

### 1. Constantes y geometría

`lib/games/qbert/engine.ts`, primera parte. Constantes de diseño:

```
W 800 · H 600 · ROWS 7 · CUBES 28
CUBE_W 64 · TOP_H 32 · SIDE_H 32 · ROW_DX 32 · ROW_DY 48 · APEX (400, 110)
HOP_MS 240 · HOP_ARC 26 px (altura máxima del arco del salto)
SPRITE_LIFT 14 px (el personaje se dibuja 14 px por encima del centro de la cara superior)
FALL_MS 800 · HIT_MS 900 · RESPAWN_GRACE_MS 1500 · LEVELCLEAR_MS 1600
DISC_LEFT  celda virtual (3, -1) · alcanzable solo con "ul" desde (4, 0)
DISC_RIGHT celda virtual (3,  4) · alcanzable solo con "ur" desde (4, 4)
DISC_FLIGHT_MS 1000 (del disco a la cima (0,0), en línea recta con arco de 60 px)
LIVES_START 3 · MAX_LIVES 5 · EXTRA_LIFE_EVERY 8000
DT_MAX 50
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Funciones puras: `idx(r, c)`, `valid(r, c)` (`0 ≤ r ≤ 6` y `0 ≤ c ≤ r`), `step(cell, hop)`
(devuelve la celda de destino, válida o no) y `centro(cell)` (válida o virtual, con la misma
fórmula).

`step`: `ul → (r-1, c-1)`, `ur → (r-1, c)`, `dl → (r+1, c)`, `dr → (r+1, c+1)`.

Comprobación: `npm run build` limpio con el motor aún sin registrar; en una consola de pruebas,
`centro(6, 0)` es `(208, 398)` y `centro(6, 6)` es `(592, 398)`.

### 2. Reglas de color y niveles

Regla por nivel: `rule(level) = ["one", "two", "toggle"][min(floor((level - 1) / 2), 2)]`. Es
decir, niveles 1–2 `one`, 3–4 `two`, 5 en adelante `toggle`.

```
one:    estado 0 → 1 al pisar.        Objetivo: los 28 cubos en 1.
two:    estado 0 → 1 → 2 (un paso por pisada). Objetivo: los 28 en 2; pisar un 2 no cambia nada.
toggle: pisar alterna 0 ↔ 1.          Objetivo: los 28 en 1; pisar un 1 lo devuelve a 0.
```

Colores (fijos, sin skins): estado 0 `#3b4cca`, estado 1 `#ffd23f`, estado 2 `#ff4fa3`. Cara
izquierda = color al 65 % de brillo; cara derecha = al 45 %.

Puntos por pisada que **avanza** hacia el objetivo: `POINTS_STEP 25`. En `two`, el primer paso
(0→1) da `15` y el segundo (1→2) da `25`. En `toggle`, volver un cubo de 1 a 0 da `0`.

Fin de nivel: en el instante en que el aterrizaje del jugador deja los 28 cubos en el estado
objetivo (ver paso 5 para el orden de resolución).

Bonus de nivel: `LEVEL_BONUS = 1000 + 250 * (level - 1)` más `DISC_BONUS 50` por cada disco sin
usar. `state = "levelclear"` durante `LEVELCLEAR_MS` con todos los cubos parpadeando entre su
color y blanco a 8 Hz; al terminar, `level++`, `onLevel(level)`, pirámide y discos reiniciados.

Comprobación: `npm run build` limpio; en el nivel 3 los cubos necesitan dos pisadas.

### 3. Jugador: salto, buffer y caída

- Entrada: `keydown` sobre el canvas, **ignorando `e.repeat`** (un salto por pulsación; mantener
  la tecla no encadena saltos ni empuja al jugador al vacío). Mapeo, girado 45° como el joystick
  original, para que cada flecha apunte a un cuadrante de la pantalla:

  ```
  ArrowUp / KeyW / KeyE     → "ur"   (arriba-derecha)
  ArrowRight / KeyD / KeyC  → "dr"   (abajo-derecha)
  ArrowDown / KeyS / KeyZ   → "dl"   (abajo-izquierda)
  ArrowLeft / KeyA / KeyQ   → "ul"   (arriba-izquierda)
  ```

- En `ready`, el primer salto válido pasa a `playing`. En `playing`, si el jugador está `idle`
  el salto empieza de inmediato; si está en `hop`, se guarda en `pending` (sobrescribe el
  anterior). Al aterrizar, si hay `pending`, se ejecuta en el mismo frame sin pausa visible.
  En `dying`, `levelclear` y `gameover`, la entrada se descarta y `pending = null`.
- Salto: `t` avanza con `dt`; posición dibujada = interpolación lineal de `centro(from)` a
  `centro(to)` más un arco parabólico `-4 * HOP_ARC * u * (1 - u)` con `u = t / HOP_MS`.
  La celda lógica del jugador cambia **al aterrizar** (`t ≥ HOP_MS`).
- Destino válido (`valid(to)`): aterriza y aplica la regla de color del paso 2.
- Destino igual a un disco libre (`DISC_LEFT` o `DISC_RIGHT` con el salto correcto): aterriza
  sobre el disco y pasa a `mode = "disc"` (paso 6).
- Cualquier otro destino: el jugador sigue el arco hasta pasar del borde y entra en
  `mode = "fall"` durante `FALL_MS`, cayendo con aceleración (`y += 900 * (t/1000)² `) y
  desvaneciéndose. Al terminar la caída: `lives--` (paso 7). Saltar hacia abajo desde la fila
  6 es una caída; no existe «pared invisible».

Comprobación: `npm run build` limpio; con el motor arrancado a mano, el jugador recorre las
cuatro diagonales, y un salto «ur» desde (4, 4) lo lleva al disco derecho.

### 4. Enemigos: reglas comunes y spawns

Todos los enemigos usan `Mover`: saltan celda a celda con el mismo arco, esperan `wait` ms entre
saltos y se dibujan con el mismo algoritmo del pintor que el jugador.

Constantes que dependen del nivel (`L = level`):

```
COILY_HOP_MS(L)  = max(260, 440 - 20 * (L - 1))   // tiempo entre saltos de Coily
BALL_HOP_MS(L)   = max(320, 600 - 20 * (L - 1))   // bola roja y huevo
SLICK_HOP_MS(L)  = max(300, 520 - 20 * (L - 1))
SPAWN_INTERVAL_MS(L) = max(1800, 3400 - 150 * (L - 1))
FIRST_SPAWN_MS 2200 (tras el primer salto del jugador)
MAX_COILY_LINE 1 (un huevo o un Coily a la vez) · MAX_BALLS 2 · MAX_SLICK 1
HATCH_MS 500 (pausa en la fila 6 antes de eclosionar)
```

Duración del salto de un enemigo: `HOP_MS` igual que el jugador; lo que cambia con el nivel es
la espera entre saltos.

**Aparición:** cada `SPAWN_INTERVAL_MS` se elige un tipo con estos pesos, descartando los que ya
estén en su tope: huevo 40 · bola roja 40 · Slick 20. El enemigo aparece en la celda (0, 0)
sin salto previo. Si el jugador está en (0, 0) o saltando hacia allí, el spawn se retrasa al
siguiente frame hasta que quede libre. No hay spawns durante `ready`, `dying`, `levelclear`, ni
durante `spawnGrace` (`RESPAWN_GRACE_MS` tras aparecer el jugador).

**Comportamiento por tipo:**

- **Huevo (`egg`)** y **bola roja (`ball`)**: cada salto elige `dl` o `dr` al azar (50/50). Al
  llegar a la fila 6, la bola roja salta fuera por el borde inferior y desaparece sin
  puntos; el huevo se queda `HATCH_MS` y se convierte en `coily`.
- **Coily (`coily`)**: cada salto elige, entre los cuatro vecinos con `valid(...)`, el que
  **minimiza la distancia** `|Δc| + |Δ(r−c)|` a la celda **lógica** actual del jugador; el
  empate se resuelve al azar; nunca salta al vacío por voluntad propia. Si el jugador está en
  el aire (`hop`), Coily persigue la celda **de salida** del salto.
- **Slick (`slick`)**: salta `dl`/`dr` al azar como la bola. Cada aterrizaje en un cubo con
  estado `> 0` lo baja un nivel (`toggle` y `one`: 1→0; `two`: 2→1 o 1→0). Al llegar a la fila 6
  sale por el borde inferior sin puntos.

**Colisión con el jugador:** se resuelve cuando cualquiera de los dos **aterriza** y las celdas
lógicas coinciden. Además, si jugador y enemigo intercambian celdas a la vez (salen y llegan
a la misma pareja de cubos con los saltos solapados en el tiempo), cuenta como colisión.

- Contra `egg`, `coily` o `ball`: el jugador muere (paso 7).
- Contra `slick`: Slick desaparece con un destello y el jugador suma `POINTS_SLICK 300`; no hay
  daño.

Comprobación: `npm run build` limpio; un Coily de prueba cierra distancia con el jugador quieto
y nunca salta al vacío.

### 5. Bucle y orden de resolución

Por frame, con `dt` capado a `DT_MAX` y solo en `playing`:

1. Avanzar el salto del jugador; si aterriza, en este orden:
   1. Si hay un enemigo letal en la celda → muerte (paso 7), sin pintar. Fin del frame.
   2. Si hay un Slick en la celda → atraparlo (+300).
   3. Aplicar la regla de color y sumar puntos.
   4. Si los 28 cubos están en el objetivo → `levelclear` inmediato: se borran todos los
      enemigos y **ningún aterrizaje de enemigo del mismo frame se evalúa**.
   5. Ejecutar `pending` si lo hay.
2. Avanzar a cada enemigo; resolver aterrizajes y colisiones (paso 4).
3. Avanzar el spawner.

`emit()` con `lastScore` / `lastLives` / `lastLevel`, llamando a los callbacks solo cuando el
valor cambia. `onLives(LIVES_START)` y `onLevel(1)` una vez al iniciar. Vida extra: cada vez
que `score ≥ nextExtraLife` (empieza en 8000, suma 8000 cada vez) y `lives < MAX_LIVES`,
`lives++`; con `lives === MAX_LIVES` el umbral avanza igualmente sin dar vida.

Comprobación: `npm run build` limpio; completar un nivel de prueba dispara `levelclear` y sube
el bonus.

### 6. Discos de escape

- Cada nivel crea 2 discos: `DISC_LEFT` y `DISC_RIGHT`. Se dibujan como elipses de 44×18 px
  junto al borde, con un ciclo de color de 4 pasos a 6 Hz.
- Al aterrizar en un disco: `player.mode = "disc"`, el jugador vuela en línea recta con arco
  hasta `centro(0, 0)` durante `DISC_FLIGHT_MS` y el disco se marca `used`. Durante el vuelo
  el jugador es intangible, el spawner se detiene y no se acepta entrada (se descarta).
- **Efecto sobre los enemigos al embarcar:**
  - Un Coily eclosionado ya no persigue: en su siguiente salto va hacia donde estaba el
    jugador; si esa celda es vacío, **cae por el borde** y suma `POINTS_COILY_DISC 500`.
    Si no puede alcanzar el borde, desaparece igualmente con los 500 puntos.
  - Huevo, bola roja y Slick desaparecen al instante sin puntos.
- Al terminar el vuelo, el jugador queda `idle` en (0, 0) con `spawnGrace` renovado.
- Un cubo no se pinta ni se despinta por volar en el disco.

Comprobación: `npm run build` limpio; usar un disco con Coily en pantalla da 500 puntos y
limpia el tablero.

### 7. Muerte, vidas y game over

- Muerte por enemigo: `state = "dying"`, el jugador muestra un bocadillo de colisión durante
  `HIT_MS`; muerte por caída: `FALL_MS`. En ambos casos `lives--`, `onLives(lives)`.
- Con `lives > 0`: se borran los enemigos, el jugador reaparece en (0, 0) con `idle`,
  `pending = null` y `spawnGrace = RESPAWN_GRACE_MS`; **los cubos pintados se conservan**.
  Se vuelve a `playing`.
- Con `lives === 0`: `state = "gameover"`, `stopLoop()` y `onGameOver(score)` **una sola vez**.
  `resume()` es no-op después.
- `restart()`: detiene el bucle, reinicia pirámide, discos, enemigos, `score`, `lives`, `level`,
  `nextExtraLife`, `state = "ready"`, `emit()` y arranca.

Comprobación: `npm run build` limpio; perder las 3 vidas abre el modal `FIN DEL JUEGO`.

### 8. Dibujo y ciclo de vida

- `draw()`: fondo `#0a0a1a`; cubos de atrás hacia delante (fila 0 a 6), cada uno con cara
  superior (rombo 64×32) y dos laterales (paralelogramos de 32 px de alto); discos; personajes
  y destellos ordenados por `y` de pantalla junto con los cubos de su fila; sombra elíptica
  bajo cada personaje.
- Personajes con primitivas: el jugador es un círculo naranja de radio 12 con un hocico en
  forma de tubo; el huevo es un círculo morado de radio 9; Coily es un círculo morado de
  radio 11 con dos aros; la bola roja es un círculo rojo de radio 10; Slick es un círculo
  verde de radio 10 con dos ojos.
- Indicador de objetivo (esquina superior izquierda, dentro del canvas, porque es regla del
  nivel y no un dato del HUD): un cubo pequeño del color objetivo; en `two`, dos cubos con una
  flecha; en `toggle`, un cubo con flecha circular. Sin puntos, nivel ni vidas dibujados.
- Mientras `state === "ready"`, el rótulo `PULSA UNA FLECHA` dentro del canvas.
- `GAME_KEYS`: las 12 teclas del mapeo del paso 3. `preventDefault()` solo para esas.
- Listeners `keydown` / `blur` sobre el canvas, nunca sobre `window` o `document`. `P` y
  `Escape` no llegan al motor.
- `dt` en milisegundos, capado a `DT_MAX`; `lastTime = null` al reanudar.
- `destroy()` cancela el frame, quita los listeners y es idempotente.
- `initGame(); draw();` antes de devolver el motor.

Comprobación: `npm run build` limpio; `getEngine("qbert")` (tras el paso 10) devuelve la entrada.

### 9. Catálogo: nueva ficha `qbert`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "qbert",
  title: "QBERT",
  short: "Salta por la pirámide y píntala entera sin caer.",
  long: "Un saltarín de hocico largo recorre una pirámide isométrica de 28 cubos cambiándolos de color. Una serpiente morada lo persigue, las bolas rojas rebotan sin piedad y los discos voladores son la única salida de emergencia. Un salto en falso y caerás al vacío.",
  cat: "ARCADE",
  cover: "cover-qbert",
  color: "yellow",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-qbert` nueva, en el mismo patrón que las portadas generadas
existentes (pirámide de rombos con gradientes, sin imagen externa).

Comprobación: `/juegos/qbert` muestra la ficha con su portada antes de registrar el motor (cae
en `.game-arena` con `seededScores()`).

### 10. Registrar el motor

`lib/games/registry.ts`:

```ts
qbert: {
  create: createQbertGame,
  width: 800,
  height: 600,
  controls:
    "flechas o WASD para saltar en diagonal: arriba = arriba-derecha, derecha = abajo-derecha, abajo = abajo-izquierda, izquierda = arriba-izquierda",
  touch: {},
},
```

`touch: {}` basta: la cruceta táctil envía las cuatro flechas y un toque es un salto
(`repeat` ausente, coherente con ignorar `e.repeat`).

Comprobación: `/jugar/qbert` pinta el canvas real en vez de `.game-arena`.

### 11. Leaderboard

`supabase/migrations/<timestamp>_juego_qbert.sql`, con timestamp posterior a
`20260927130000`:

```sql
insert into public.games (id, title) values ('qbert', 'QBERT');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema.

Comprobación: `select * from public.games` incluye la fila `qbert`.

### 12. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/qbert` muestra un canvas de 800×600 con una pirámide isométrica de 28 cubos, no la
      `.game-arena`.
- [ ] El jugador empieza en el vértice, no se mueve hasta pulsar una flecha y el canvas muestra
      `PULSA UNA FLECHA` mientras tanto.
- [ ] Las cuatro flechas (y WASD) saltan a la diagonal indicada en el mapeo; `Q`, `E`, `Z` y `C`
      saltan a su diagonal directa.
- [ ] Mantener pulsada una flecha da **un solo** salto, no una cadena.
- [ ] Una segunda pulsación durante un salto se ejecuta al aterrizar, sin pausa; una tercera la
      sustituye y no se acumulan más.
- [ ] En los niveles 1–2 un cubo cambia a amarillo al pisarlo y suma 25 puntos.
- [ ] En los niveles 3–4 un cubo necesita dos pisadas (azul → amarillo → rosa) y suma 15 y 25.
- [ ] Desde el nivel 5 pisar un cubo ya objetivo lo devuelve al azul y suma 0.
- [ ] Saltar fuera de la pirámide en cualquier borde (salvo un disco libre) hace caer al jugador y
      resta una vida.
- [ ] Saltar fuera por el borde inferior de la fila 6 también resta una vida.
- [ ] Un huevo aparece en el vértice a los ~2.2 s del primer salto, baja saltando al azar y
      eclosiona en Coily al llegar a la fila 6.
- [ ] Coily reduce siempre la distancia al jugador y nunca salta al vacío por su cuenta.
- [ ] Tocar un huevo, un Coily o una bola roja quita una vida; los cubos pintados se conservan.
- [ ] Tocar a Slick lo elimina y suma 300; no quita vida.
- [ ] Slick pisando un cubo pintado lo baja un estado.
- [ ] Saltar a un disco lleva al jugador al vértice en ~1 s, es intangible durante el vuelo y
      el disco desaparece.
- [ ] Con Coily eclosionado en pantalla, usar un disco suma 500 y despeja a los demás enemigos.
- [ ] Completar los 28 cubos abre `levelclear` y suma `1000 + 250 × (nivel − 1)` más 50 por
      disco sin usar; el HUD pasa a nivel 02.
- [ ] Si el último cubo se completa en el mismo frame en que un enemigo aterrizaría sobre el
      jugador, gana el nivel y no se pierde la vida.
- [ ] El HUD muestra 3 vidas al inicio y sube una vida a los 8000 puntos, con tope de 5.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real, una sola vez.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni overlay de game over; solo el indicador de
      objetivo y `PULSA UNA FLECHA`.
- [ ] `JUGAR DE NUEVO` reinicia pirámide, discos, puntuación, vidas y nivel sin recargar la
      página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'qbert'`.
- [ ] Esa puntuación aparece en `/salon?juego=qbert` y en `/juegos/qbert` sin recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=qbert` muestra el estado vacío.
- [ ] El botón `PAUSA` congela el juego (incluido un salto a medias) y `REANUDAR` lo reanuda sin
      que nadie se teletransporte.
- [ ] `P` y `Escape` hacen lo mismo que el botón, y el motor no los interpreta como jugada.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D`, `Q`, `E`, `Z` o `C` en el campo de iniciales no mueve ni
      reinicia el juego.
- [ ] En móvil, la cruceta táctil mueve al jugador un salto por toque.
- [ ] Navegar de `/jugar/qbert` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no hace avanzar a los enemigos varios saltos de
      golpe.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger`
      se juegan igual que antes.
- [ ] `select * from public.games` incluye una fila `qbert` además de las ya existentes.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/qbert`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mundo 800×600. La pirámide ocupa ~384 px de ancho y ~340 de alto; sobra margen a los
  lados para los discos y el indicador de objetivo sin cambiar el marco 4/3 de la plataforma.
- **Sí:** salto con duración fija que no se puede cancelar. Es la esencia del género: cada
  decisión compromete al jugador durante 240 ms, y el reto es leer a los enemigos antes.
- **Sí:** ignorar `e.repeat`. Con auto-repetición del teclado, mantener una flecha en el borde
  de la pirámide lo tiraría al vacío; el original tampoco encadena saltos por mantener.
- **Sí:** buffer de un solo salto. Sin buffer el juego se siente sordo; con más, el jugador
  acumula saltos que ya no corresponden a lo que ve.
- **Sí:** mapeo de flechas girado 45°. Cada flecha apunta al cuadrante de pantalla que
  recorre; es el esquema del joystick original y el único que no necesita explicación a la hora
  de leer el `aria-label`. Q/E/Z/C dan las diagonales directas para quien prefiera teclas
  diagonales.
- **Sí:** distancia de Coily = `|Δc| + |Δ(r−c)|`. Es exacta para la red de saltos y no necesita
  búsqueda en grafo ni tablas.
- **Sí:** Coily persigue la celda de salida si el jugador está en el aire. Evita que «prediga»
  el aterrizaje y deja una ventana de 240 ms que premia la lectura.
- **Sí:** el jugador pierde una vida al caer pero los cubos pintados se conservan. Mantiene el
  progreso del nivel entre vidas, como el original.
- **Sí:** tres reglas de color que rotan por nivel. Es la progresión de dificultad real del
  juego; sin ella lo único que cambia es la velocidad.
- **Sí:** el nivel se gana en el aterrizaje del jugador y tiene prioridad sobre un aterrizaje
  enemigo del mismo frame. Es un empate arbitrario, pero resuelto siempre a favor de quien
  ejecutó la acción.
- **No:** barra de tiempo ni derrumbe. La presión viene de los enemigos; el desmoronamiento
  es la idea central de `02-piramide-inestable.md`.
- **No:** Ugg, Wrongway ni Sam como entidad propia. Aumentarían el coste del motor (saltos por
  los laterales de la pirámide) sin cambiar el género.
- **Sí:** ficha en `ARCADE`. No hay categoría de plataformas y la ficha no justifica abrir una.
- **No:** sembrar puntuaciones en `scores`.
- **No:** skins. Pueden añadirse después con `skin-designer`.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `Q*bert` es una marca registrada y el nombre/personajes originales pueden ser un problema de publicación. | Personajes con formas genéricas; `game-id` y título son un solo valor fácil de cambiar antes de publicar (ficha + registro + migración). |
| La proyección isométrica y el algoritmo del pintor producen solapes incorrectos entre personaje y cubos de la fila siguiente. | El orden de dibujo es por `y` de pantalla de la base del cubo/personaje; el arco del salto se aplica después de ordenar, nunca para ordenar. |
| Coily con persecución exacta es injusto en los niveles altos. | El único freno es la espera entre saltos (`COILY_HOP_MS`, mínimo 260 ms) y el hecho de que persigue la celda de salida; se verifica jugando los niveles 1, 5 y 10. |
| Colisión en el aire: jugador y enemigo se cruzan sin coincidir en celda y no se detecta. | Regla explícita de intercambio de celdas con saltos solapados; es el caso a probar a mano con un Coily adyacente. |
| El orden de resolución (nivel completo vs. enemigo) cambia vidas por un solo frame. | Documentado en el paso 5 y en un criterio de aceptación concreto. |
| El buffer de entrada hace saltar al jugador al vacío tras una pulsación rezagada. | Un solo salto en buffer, descartado al morir/ganar/pausar; un salto fuera de la pirámide sigue siendo una decisión visible en el momento de pulsar. |
| Pestaña en segundo plano: los enemigos acumulan varios saltos al volver. | `dt` capado a 50 ms, `lastTime = null` al reanudar, y como mucho un salto por enemigo y frame. |
| El jugador queda atrapado entre dos enemigos sin salida en la fila 6. | Siempre existe un salto al vacío o a una celda libre; no se garantiza ausencia de situaciones perdidas, igual que en el original. |
| `touch: {}` obliga a un toque por salto y hace difícil esquivar con precisión en móvil. | Se acepta para esta propuesta; la SPEC 11 ya generaliza la cruceta y se puede mejorar después con una spec propia. |
| WASD y Q/E/Z/C llegan al motor mientras se escriben iniciales. | Bucle parado con el modal abierto y listeners en el canvas, no en `window`. |

---

## Lo que **no** entra en esta spec

- Derrumbe de filas, combo, temporizador o cualquier otra mecánica de la variante
  `02-piramide-inestable.md`.
- Ugg, Wrongway y Sam como enemigos aparte.
- Pirámides distintas, discos en otras filas o mapas por nivel.
- Sonido.
- Skins.
- Dos jugadores.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
