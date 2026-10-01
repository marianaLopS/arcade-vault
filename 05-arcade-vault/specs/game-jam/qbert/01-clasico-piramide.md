# SPEC — QBERT: variante clásica de la pirámide

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06 (y SPEC 14/15 para `scores.user_id`)
> **Fecha:** 2026-10-01
> **Objetivo:** Diseñar un Q\*bert clásico y mínimo contra el contrato `GameEngine`: pirámide isométrica de 28 cubos que se pintan de un solo salto, tres enemigos (bola roja, Coily, Slick), discos de escape y niveles que solo aceleran, con puntuación en el leaderboard real.

---

## Por qué existe esta spec

Es la primera de dos variantes de diseño para `qbert`, el juego sorteado de la lista de sugerencias
pendientes de `game-planner` (`donkey-kong`, `pole-position`, `qbert`, `dig-dug`, `paperboy`…). Q\*bert
aporta lo que el catálogo no tiene: **movimiento diagonal sobre una malla isométrica**, sin gravedad,
sin proyectiles y sin colisión de frente. Todo lo existente (`asteroids`, `caida`, `arkanoid`, `snake`,
`frogger`) es cenital o lateral plano.

Esta variante es la versión **fiel y mínima**: la regla de siempre (pisar un cubo lo pinta del color
objetivo, pintar los 28 pasa de nivel), una única capa de dificultad (enemigos y velocidad) y nada
más. La segunda variante, `02-cubos-triples-corrupcion.md`, comparte el género, el mundo lógico, los
controles y el sistema de coordenadas de la pirámide, pero cambia la regla central: cubos de tres
pasos, pirámide que crece con el nivel y una «corrupción» que deshace tu trabajo.

Como Snake (SPEC 10) y las variantes de `ranaria`, no hay código de referencia: las constantes del
paso 2 **son** el diseño. Cambiarlas durante la implementación es rediseñar, no implementar.

---

## Alcance

**Dentro:**

- `lib/games/qbert/engine.ts`: motor nuevo con todo el estado en la clausura de `createQbertGame`.
  Sin sprites externos: cubos, personajes y discos se dibujan con polígonos y arcos de `ctx`.
- Mundo lógico 800×600. Pirámide de 7 filas (28 cubos) en proyección isométrica, cubos de
  80 px de ancho de cara superior.
- Movimiento por salto discreto en las 4 diagonales. Un salto por pulsación, con un búfer de un
  salto.
- Un solo paso por cubo: pisarlo lo cambia de color base a color objetivo.
- Enemigos: **bola roja** (mata al tocar), **Coily** (huevo que eclosiona en serpiente perseguidora,
  mata al tocar) y **Slick** (verde, revierte cubos; atraparlo da puntos, no mata).
- Dos **discos de escape** a los lados de la fila 3: un solo uso cada uno, llevan a Q\*bert a la
  cima y matan a Coily.
- 3 vidas. Caer de la pirámide o tocar un enemigo letal cuesta una vida.
- Niveles infinitos: completar la pirámide sube el nivel; solo cambian velocidades y cadencias de
  aparición y la paleta (visual).
- Puntuación en el HUD de React vía `onScore`; vidas y nivel vía `onLives` / `onLevel`.
- Controles: flechas o WASD, rotadas 45° (ver paso 2).
- Una línea `qbert` en `GAME_ENGINES` y una fila en `games` **cuando la variante se promueva**;
  esta spec no las aplica.

**Fuera de alcance (para specs futuras o para la variante 02):**

- Cubos de varios pasos, pirámide de tamaño variable, corrupción, combos (son la variante 02).
- Sam, Ugg, Wrongway y los cubos que revierten al volver a pisarlos (los niveles 3+ del arcade).
- Sprites, skins (`skins: false` en el registro), sonido.
- Controles táctiles específicos: la cruceta de la plataforma ya envía las cuatro flechas, con la
  misma rotación; no hay botones A/B (`touch: {}`).
- Vidas extra por puntuación.
- Modo dos jugadores.
- Tocar `lib/games.ts`, `lib/games/registry.ts`, la portada `cover-*` o `globals.css`.
- Migraciones de Supabase y autenticación nueva.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats` sirven
a este juego sin tocarlas; el leaderboard se enciende con una fila en `games` al promover la spec.

Integración con `scores` (la hace `components/game-player.tsx`, no el motor):

- El motor solo llama a `onScore(n)` cuando cambia y a `onGameOver(finalScore)` **una vez**.
- `GUARDAR PUNTUACIÓN` inserta `{ game_id: 'qbert', player: <1-3 letras A-Z>, score, user_id }` donde
  `user_id` es `null` (invitado) o `auth.uid()` según la política de SPEC 15.
- La tabla impone `score between 0 and 1000000`. El motor **satura** `score` a `1_000_000` antes de
  emitirlo, para que ninguna partida larga produzca un insert rechazado por el `check`.
- El leaderboard (`/salon?juego=qbert`, `/juegos/qbert`) y `game_stats` leen de `scores` sin cambios.

Tipos locales del motor, sin exportar:

```ts
// Coordenadas de pirámide: fila r (0 = cima) y columna c, con 0 <= c <= r.
// Las celdas con c < 0 o c > r son el vacío; (2,-1) y (2,3) son las casillas de los discos.
type Cell = { r: number; c: number };
type Dir = "ul" | "ur" | "dl" | "dr"; // arriba-izq, arriba-der, abajo-izq, abajo-der
type Cube = { painted: boolean }; // 28 entradas, índice = r*(r+1)/2 + c
type Disc = { side: "left" | "right"; cell: Cell; used: boolean };

type Hopper = {
  cell: Cell; // celda lógica de destino
  from: Cell;
  t: number; // 0..1 dentro del salto actual, ms acumulados / duración
  phase: "idle" | "hop" | "fall" | "disc";
};
type Enemy =
  | (Hopper & { kind: "red" })
  | (Hopper & { kind: "egg" | "coily"; hatchT: number })
  | (Hopper & { kind: "slick" });
```

Estado en la clausura de `createQbertGame`:

- `cubes: Cube[]`, `discs: Disc[]`, `qbert: Hopper`, `enemies: Enemy[]`, `queued: Dir | null`.
- `score`, `lives`, `level`, `state: "waiting" | "playing" | "dying" | "clearing" | "gameover"`.
- Temporizadores en ms: `redTimer`, `coilyTimer`, `slickTimer`, `stateTimer`, `graceTimer`.
- Bucle: `rafId`, `lastTime`, `destroyed`. Recorte de `emit()`: `lastScore`, `lastLives`, `lastLevel`.

---

## Plan de implementación

### 1. Geometría isométrica y coordenadas

`lib/games/qbert/engine.ts`. Constantes de geometría:

```
W 800 · H 600 · ROWS 7 · CUBES 28
CUBE_W 80 (cara superior, ancho) · CUBE_TOP_H 40 (cara superior, alto) · SIDE_H 40 (caras laterales)
STEP_X 40 · STEP_Y 60   // desplazamiento del centro de la cara superior por salto diagonal
ORIGIN (400, 100)       // centro de la cara superior de la cima (0,0)
screenX(r,c) = 400 + (c - r/2) * 80
screenY(r)   = 100 + r * 60
Disco izquierdo en (2,-1) → (240,220) · disco derecho en (2,3) → (560,220) · radio 28×14
```

Vecinos de `(r,c)`: `ul = (r-1,c-1)` · `ur = (r-1,c)` · `dl = (r+1,c)` · `dr = (r+1,c+1)`. Una celda es de
pirámide si `0 <= r < 7` y `0 <= c <= r`. Es disco si coincide con una de las dos casillas de disco y
ese disco no está `used`. Cualquier otra es el vacío.

Comprobación: `npm run build` limpio; una función auxiliar (no exportada) recorre las 28 celdas y
todas caen dentro de 800×600 con la pirámide centrada (cubo más a la izquierda de la fila 6 en
x = 120 ± 40, y más a la derecha en x = 680 ± 40).

### 2. Motor: constantes y lógica

Constantes de diseño:

```
HOP_MS 160 · HOP_ARC 24 px · INPUT_BUFFER 1 salto
FALL_MS 500 · FALL_DIST 260 px
DISC_RIDE_MS 900 · DT_MAX 50 ms
LIVES 3 · RESPAWN_GRACE_MS 1500 · DEATH_FREEZE_MS 900 · LEVEL_CLEAR_MS 1200

Bola roja:  RED_SPAWN_MS(level) = max(2200, 4000 - 200*(level-1)) · RED_HOP_MS 480 · MAX_RED 2
Coily:      COILY_FIRST_MS 2500 (desde el primer salto) · COILY_RESPAWN_MS 4000
            EGG_HOP_MS 520 · HATCH_MS 400
            COILY_HOP_MS(level) = max(260, 420 - 20*(level-1)) · MAX_COILY 1
Slick:      desde level >= 2 · SLICK_SPAWN_MS 8000 · SLICK_HOP_MS 450 · MAX_SLICK 1
Spawn de enemigos: fila 1, columna 0 o 1 al azar; si esa celda está ocupada por Q*bert, se reintenta a los 500 ms.

CUBE_POINTS 25 · DISC_BONUS 50 (por disco sin usar al completar) · COILY_DISC_POINTS 500
SLICK_CATCH_POINTS 300 · CLEAR_BONUS(level) 500 * level · SCORE_MAX 1_000_000
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Reglas, con `dt` en milisegundos:

- **Espera.** En `waiting` no hay temporizadores ni enemigos. El primer salto válido pasa a
  `playing` y arranca `coilyTimer`, `redTimer` y `slickTimer`.
- **Entrada.** Cada tecla de juego mapea a una `Dir` (flechas/WASD rotadas 45° en sentido horario):
  `ArrowUp`/`KeyW` → `ur` · `ArrowRight`/`KeyD` → `dr` · `ArrowDown`/`KeyS` → `dl` ·
  `ArrowLeft`/`KeyA` → `ul`. Si Q\*bert está en `hop`, `fall` o `disc`, la `Dir` se guarda en `queued` (un
  solo hueco; una pulsación nueva sustituye a la anterior). Al aterrizar se consume `queued`.
- **Salto de Q\*bert.** El destino se calcula con la tabla de vecinos. Si el destino es el vacío sin
  disco, Q\*bert salta igualmente y **cae**: `phase = "fall"`, `FALL_MS`, la vida se pierde al acabar.
  Si el destino es un disco libre, `phase = "disc"` y el disco queda `used`.
- **Aterrizaje en cubo.** Si el cubo no está pintado: `painted = true` y `+CUBE_POINTS`. Si ya lo
  estaba, nada. Tras pintar, si las 28 celdas están pintadas: `state = "clearing"`.
- **Disco.** Durante `DISC_RIDE_MS` Q\*bert se interpola en línea recta hasta `(0,0)` y **todos los
  enemigos se congelan** (sus temporizadores de salto no avanzan). Si hay un Coily en fase `coily`
  vivo al subirse al disco, se marca para caer: a mitad del viaje (`DISC_RIDE_MS / 2`) Coily entra en
  `fall` y suma `COILY_DISC_POINTS`. Un huevo no se ve afectado. Al aterrizar en la cima Q\*bert queda
  `idle` sobre `(0,0)`; el disco desaparece (no se reutiliza).
- **Bola roja.** Aparece cada `RED_SPAWN_MS(level)` si hay menos de `MAX_RED`. Salta cada `RED_HOP_MS`
  a `dl` o `dr` con probabilidad 50 %. Al salir por la fila 6 entra en `fall` y se elimina.
- **Coily.** Aparece como `egg` cuando `coilyTimer` llega a 0 y no hay otro Coily. Salta como bola
  (`dl`/`dr` al azar, `EGG_HOP_MS`). Al aterrizar en la fila 6, espera `HATCH_MS` y pasa a `coily`.
  Como `coily`, cada `COILY_HOP_MS` elige entre sus cuatro vecinos de pirámide el que minimiza la
  **distancia de grafo** (BFS sobre las 28 celdas) a la celda lógica actual de Q\*bert; en empate,
  al azar. Si Q\*bert muere o Coily cae, `coilyTimer = COILY_RESPAWN_MS`.
- **Slick.** Aparece como la bola roja cada `SLICK_SPAWN_MS` desde el nivel 2. Al aterrizar en un
  cubo pintado lo revierte (`painted = false`; no resta puntos). Si Q\*bert y Slick coinciden en una
  celda, Slick desaparece y suma `SLICK_CATCH_POINTS`; Q\*bert no pierde vida.
- **Colisión letal.** Hay colisión entre Q\*bert y una bola roja, un huevo o un Coily si **coinciden
  en la misma celda lógica al aterrizar cualquiera de los dos**, o si **se intercambian de celda en el
  mismo instante** (Q\*bert A→B mientras el enemigo B→A, detectado al comenzar los dos saltos). Se
  ignora durante `RESPAWN_GRACE_MS` y mientras Q\*bert está en `disc` o `fall`.
- **Vida perdida.** `state = "dying"` durante `DEATH_FREEZE_MS` (o `FALL_MS` si fue una caída),
  `lives--`. Con `lives > 0`: Q\*bert vuelve a `(0,0)`, los enemigos desaparecen, los cubos pintados
  **se conservan**, los discos usados **no regresan**, `RESPAWN_GRACE_MS` y vuelve a `playing`. Con
  `lives == 0`: `gameover`.
- **Nivel completo.** Durante `LEVEL_CLEAR_MS` el juego se congela mientras los cubos parpadean
  entre color base y objetivo. Después: `+CLEAR_BONUS(level)`, `+DISC_BONUS` por cada disco sin usar,
  `level++`, pirámide nueva sin pintar, discos repuestos, enemigos y temporizadores a cero, Q\*bert en
  `(0,0)` y `state = "waiting"`.
- **Aritmética.** `score = min(score + points, SCORE_MAX)`.

Comprobación: `npm run build` limpio.

### 3. Motor: bucle, entrada y dibujo

- `emit()` con `lastScore` / `lastLives` / `lastLevel`: llama a `onScore`, `onLives`, `onLevel` solo si
  el valor cambió. `onLives(3)` y `onLevel(1)` en el arranque.
- `draw()`, en este orden: fondo `#0a0a1a`; cubos de atrás hacia delante (fila 0 → 6), cada uno con
  tres polígonos (cara superior en el color del estado, laterales al 70 % y 50 % de luminosidad);
  discos (elipse con borde de `#ff4fd8` y brillo giratorio); sombras elípticas de los personajes;
  enemigos; Q\*bert. Los personajes en `fall` se dibujan **al final**, por delante de los cubos.
- Colores: paleta por nivel `PALETTES[(level-1) % 4]`, solo visual:
  `[ {base:"#2b3a9e", target:"#ffd23f"}, {base:"#7a1fa2", target:"#33e0a1"},
     {base:"#1b6a5d", target:"#ff7a3d"}, {base:"#3a3a3a", target:"#f2f2f2"} ]`.
- Q\*bert: círculo naranja `#ff8a1f` de radio 16, hocico (rectángulo redondeado 14×8 al frente) y dos
  ojos blancos con pupila. Durante `hop`, el desplazamiento vertical es
  `-sin(pi * t) * HOP_ARC` y la sombra se queda en el suelo. Bola roja: círculo `#ff3b3b` de radio 12.
  Huevo: óvalo `#b36bff`. Coily: serpiente de tres círculos apilados `#b36bff` con ojos. Slick: círculo
  `#37e86a` de radio 12 con gorra.
- Al perder una vida por enemigo, se dibuja sobre Q\*bert una burbuja de texto `¡@#!` durante
  `DEATH_FREEZE_MS` (es estado propio del juego, como el rótulo de Snake). Mientras `waiting`, un
  rótulo `PULSA UNA FLECHA` y un pequeño diagrama de las 4 flechas rotadas.
- Sin puntuación, vidas, nivel ni overlays de game over en el canvas: eso es del HUD de React.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez. `resume()` es no-op después.
- `restart()`: detiene el bucle, `initGame()` (nivel 1, 3 vidas, 0 puntos), `emit()`, arranca.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar. Máximo un cambio de fase por frame.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`.
  `preventDefault()` solo para esas.
- Listeners `keydown` / `blur` sobre el canvas, nunca sobre `window`. `P` y `Escape` no llegan.
  `blur` descarta `queued`.
- `destroy()` cancela el frame, quita los listeners y es idempotente. `initGame(); draw();` antes de
  devolver.

Comprobación: `npm run build` limpio; la pirámide se ve y Q\*bert salta en las 4 diagonales.

### 4. Registrar (al promover)

`lib/games/registry.ts`:
`qbert: { create: createQbertGame, width: 800, height: 600, controls: "flechas o WASD para saltar en diagonal: arriba = arriba-derecha, derecha = abajo-derecha, abajo = abajo-izquierda, izquierda = arriba-izquierda", touch: {} }`.

`lib/games.ts`: ficha nueva `{ id: "qbert", title: "Q*BERT", cat: "ARCADE", cover: <portada nueva o reutilizada>,
color: "yellow", best: 0, plays: "0" }` con `short` y `long` en el tono del catálogo.

Comprobación: `/jugar/qbert` pinta el canvas real; el resto de juegos se comporta igual.

### 5. Leaderboard (al promover)

`supabase/migrations/<timestamp>_juego_qbert.sql`, con timestamp posterior a `20260927130000`:

```sql
insert into public.games (id, title) values ('qbert', 'Q*BERT');
```

Se aplica con `apply_migration` y se comprueba con `execute_sql`. Los tipos no se regeneran: insertar una fila no
cambia el esquema.

Comprobación: `select * from public.games` incluye `qbert`.

### 6. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos y el recorrido manual de
los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/qbert` muestra un canvas de 800×600 con una pirámide isométrica de 28 cubos y Q\*bert en la cima.
- [ ] Q\*bert no se mueve ni aparecen enemigos hasta pulsar una flecha; mientras tanto se ve `PULSA UNA FLECHA`.
- [ ] `↑` salta arriba-derecha, `→` abajo-derecha, `↓` abajo-izquierda, `←` arriba-izquierda; `WASD` igual.
- [ ] Un salto dura unos 160 ms con arco visible y la sombra se queda en el cubo de origen.
- [ ] Pulsar dos flechas durante un salto aplica **solo la última** al aterrizar, no se acumulan más.
- [ ] Pisar un cubo azul lo pinta de amarillo y suma 25; volver a pisarlo no suma.
- [ ] Saltar fuera de la pirámide por un borde (sin disco) hace caer a Q\*bert por delante de los cubos y cuesta una vida.
- [ ] Una bola roja aparece en la fila 1 y baja saltando; tocarla (aterrizando tú o ella) cuesta una vida.
- [ ] Intercambiar celda con una bola roja en el mismo instante cuenta como choque, no se atraviesan.
- [ ] El huevo de Coily baja hasta la fila 6, eclosiona y pasa a perseguir por el camino más corto.
- [ ] Subirse a un disco lleva a Q\*bert a la cima en unos 0,9 s, congela a los enemigos y, si Coily estaba
      eclosionado, cae y suma 500.
- [ ] Cada disco se usa una sola vez y desaparece.
- [ ] Desde el nivel 2 aparece Slick; al aterrizar revierte el cubo, y atraparlo suma 300 sin perder vida.
- [ ] Tras perder una vida, Q\*bert reaparece en la cima, los enemigos desaparecen y los cubos pintados se conservan.
- [ ] Durante 1,5 s tras reaparecer no hay colisión letal.
- [ ] Pintar los 28 cubos parpadea 1,2 s, suma `500 × nivel` más 50 por disco sin usar y pasa al nivel siguiente con la pirámide limpia.
- [ ] El HUD muestra 3 vidas al inicio y baja una por cada muerte; el nivel sube al completar la pirámide.
- [ ] Con 0 vidas se abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] El canvas no dibuja puntos, vidas, nivel ni modal de game over.
- [ ] `PAUSA`/`REANUDAR`, `P` y `Escape` congelan y reanudan sin que los enemigos salten de más.
- [ ] Con el canvas enfocado, las flechas no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S` o `D` en el campo de iniciales no mueve a Q\*bert.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 3 vidas y 0 puntos sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'qbert'` y la puntuación del HUD; pulsarlo dos veces no inserta dos.
- [ ] La puntuación aparece en `/salon?juego=qbert` y en `/juegos/qbert`; con `scores` vacía se ve el estado vacío.
- [ ] `score` nunca supera 1 000 000 aunque se fuerce un valor alto por consola.
- [ ] Navegar de `/jugar/qbert` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no dispara varios saltos de enemigos a la vez.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger` se juegan igual que antes.
- [ ] La consola no muestra errores ni avisos de hidratación en `/jugar/qbert`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mundo 800×600, el mismo marco 4/3 que Asteroids, Arkanoid y Snake.
- **Sí:** flechas rotadas 45° en sentido horario. Es el mapeo más aprendible con cuatro teclas y es
  el mismo en la cruceta táctil de la plataforma, que no se modifica.
- **No:** teclas diagonales (`Q/E/Z/C`). Duplican el mapeo y el teclado numérico no existe en móvil.
- **Sí:** un solo hueco de búfer de entrada. Con más, una ráfaga de pulsaciones lanza a Q\*bert al vacío.
- **Sí:** cubos de un solo paso. Es el Q\*bert del nivel 1 y deja la regla de varios pasos para la variante 02.
- **Sí:** los niveles solo aceleran enemigos. Las reglas no cambian: cada nivel es la misma partida más rápida.
- **Sí:** Coily muere simplificado al subirse a un disco (cae a mitad del viaje) en vez de simular su
  salto al vacío. Mismo resultado de juego, sin una trayectoria extra.
- **Sí:** la distancia de grafo para perseguir. Con 28 nodos un BFS por salto de Coily es trivial y
  evita el caso de la heurística de coordenadas, que se atasca en los bordes.
- **Sí:** los cubos pintados se conservan al perder una vida; los discos usados no vuelven.
  Evita castigar la muerte dos veces y da valor a la decisión de gastar un disco.
- **Sí:** saturar `score` a 1 000 000 en el motor. La tabla rechaza más, y perder una partida entera
  por un `check` sería peor que un tope.
- **No:** skins. Los colores de nivel ya dan variedad y evitan un `lib/games/qbert/skins.ts` por ahora.
- **No:** sonido, no hay assets de audio.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                             | Mitigación                                                                                                            |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| El mapeo de flechas rotadas desorienta a quien espera «arriba = arriba».                           | Diagrama de las 4 flechas en el rótulo de espera y descripción en `controls` (`aria-label` del canvas).              |
| Pulsar rápido lanza a Q\*bert al vacío por accidente.                                              | Búfer de un solo hueco y salto de 160 ms; la caída es la regla del juego, no un fallo.                               |
| Dos entidades que se cruzan en el aire no se detectan y se atraviesan.                              | Detección explícita de intercambio de celda al comenzar los saltos, además de coincidir al aterrizar.                |
| Coily persigue por heurística y se queda atascado en un borde.                                      | BFS sobre el grafo de 28 celdas en lugar de comparar filas y columnas.                                               |
| Orden de dibujo isométrico incorrecto: un cubo tapa a un personaje o al revés.                      | Cubos de la fila 0 a la 6; personajes después; los que caen, al final por delante de todo.                           |
| Pestaña en segundo plano: los temporizadores de enemigos se acumulan y spawnean varios a la vez.   | `dt` capado a 50 ms, `lastTime = null` al reanudar, un solo spawn por tipo y frame, y topes `MAX_RED/COILY/SLICK`.  |
| Spawn de un enemigo justo sobre Q\*bert en la cima o en la fila 1.                                  | Reintento a 500 ms si la celda de spawn está ocupada, y `RESPAWN_GRACE_MS` tras cada muerte.                         |
| Los discos congelan a los enemigos y el reloj de spawn sigue corriendo, saliendo todo de golpe.    | Los temporizadores de spawn también se detienen durante `DISC_RIDE_MS`.                                              |
| El leaderboard rechaza una partida larga por superar el `check` de 1 000 000.                       | `SCORE_MAX` en el motor.                                                                                             |
| WASD llega al motor mientras se escriben iniciales.                                                | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                                          |

---

## Lo que **no** entra en esta spec

- Cubos de varios pasos, tamaño de pirámide variable, corrupción y combos (variante 02).
- Sam, Ugg, Wrongway y cubos que revierten al re-pisar.
- Sprites, skins y sonido.
- Controles táctiles con botones propios.
- Vidas extra y modo de dos jugadores.
- Tocar `lib/games.ts`, `lib/games/registry.ts` y la migración en esta fase: son del paso de promoción.
- Autenticación nueva o cambios en `scores.user_id`.

Cada una de ellas, si entra, va en su propia spec.
