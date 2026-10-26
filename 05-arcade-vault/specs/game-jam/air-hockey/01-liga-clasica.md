# SPEC — AIR HOCKEY: liga clásica

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-26
> **Objetivo:** Diseñar `air-hockey` como un port fiel al hockey de aire de salón — mesa vertical,
> un disco, dos mazos circulares, dos porterías — contra una CPU que sube de nivel partido a
> partido, como ficha nueva en categoría VERSUS con motor real y leaderboard en Supabase desde el
> primer día.

---

## Por qué existe esta spec

La categoría VERSUS solo tiene `duelo-pixel`, que sigue en maqueta y es un pong: dos paletas
verticales sobre un eje fijo y una pelota que rebota en línea recta. El hockey de aire parece
cercano pero es otra mecánica: el jugador mueve un **mazo libre en dos dimensiones** dentro de su
mitad de la mesa, el disco **conserva el impulso** del golpe y rebota en cuatro bordes, y el gol
es una **abertura** en el borde, no un fondo entero. Lo que se juega es el ángulo (bandas),
no el reflejo sobre un eje. Por eso no duplica a `duelo-pixel`; la sugerencia de
`game-suggestions-todo.md` ya lo distingue explícitamente.

Como con Snake (SPEC 10) y las variantes de `ranaria` y `ciempies`, **no hay código de
referencia**: no existe carpeta `References/.../air-hockey`. Las constantes de este documento
**son** el diseño; cambiarlas durante la implementación es rediseñar, no implementar. Todo se
dibuja con primitivas de canvas — rectángulos, círculos, arcos y líneas — sin assets externos.

Esta variante es la lectura **mínima y fiel**: un solo disco, sin obstáculos ni potenciadores,
partidos a 7 goles contra una CPU con diez niveles de dificultad. La variante
`02-mesa-electrica.md` añade bumpers, potenciadores y varios discos en una partida continua; esta
se queda en el conjunto más pequeño que ya es reconociblemente hockey de aire.

---

## Alcance

**Dentro:**

- `lib/games/air-hockey/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createAirHockeyGame`, sin assets externos.
- Mundo lógico de **480×720** (proporción 2:3, mesa vertical). Jugador abajo, CPU arriba.
- Física propia de disco y mazos con paso fijo de 1/120 s: rebote en bordes, rebote en postes
  de portería, colisión disco–mazo con transferencia de velocidad del mazo, amortiguación suave.
- Dos porterías de 170 px de boca, centradas, una en cada borde corto.
- Mazo del jugador controlado por **puntero** (ratón o dedo, arrastrando sobre el canvas) o por
  **teclado** (flechas o WASD), con el último método usado tomando el control.
- CPU con tres parámetros por nivel (velocidad máxima, retardo de reacción y error de puntería)
  y dos comportamientos: defender su portería y atacar cuando el disco está en su mitad.
- Estructura de campaña: partidos a 7 goles; ganar sube el nivel de la CPU; perder resta una de
  las 3 vidas; con 0 vidas, fin del juego.
- Límite de 180 s por partido con gol de oro si hay empate.
- Marcador del partido dibujado **en la mesa** (dígitos tenues sobre el campo), porque es parte
  del mobiliario de la mesa y no un HUD.
- Nueva ficha `air-hockey` en `lib/games.ts` (categoría `VERSUS`) y clase de portada
  `cover-air-hockey` en `app/globals.css`.
- Una línea `air-hockey` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('air-hockey', 'AIR HOCKEY')` y su
  aplicación.

**Fuera de alcance (para specs futuras o para la variante `02-mesa-electrica.md`):**

- Bumpers, potenciadores, varios discos y cualquier modificador de mesa.
- Modo de dos jugadores local u online.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Spin o rozamiento mazo–disco: el golpe transfiere velocidad lineal, no rotación.
- Dificultad elegible por el jugador: la CPU sube sola por partido.
- Autenticación nueva, cambios en `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma.** `GameEngineEntry` existe desde la
SPEC 08, y `scores` y `game_stats` sirven a este juego sin tocarlas: el leaderboard se enciende
con una fila en `games`. El guardado pasa por `guardarScore` tal como está tras la SPEC 15
(`user_id` del `sub` de la sesión o `null` para invitados); el motor no sabe nada de eso.

Tipos locales del motor, sin exportar:

```ts
type Vec = { x: number; y: number };
type Body = { x: number; y: number; vx: number; vy: number }; // px y px/s, centro
type Side = "player" | "cpu";
type Phase = "serve" | "play" | "goal" | "matchEnd" | "gameover";
```

Estado en la clausura de `createAirHockeyGame`:

- `puck: Body`, `player: Body`, `cpu: Body` (los mazos usan `vx/vy` solo para transferir impulso;
  se calculan por desplazamiento real en cada paso).
- `target: Vec` (destino del mazo del jugador) y `inputMode: "pointer" | "keys"`.
- `goals: { player: number; cpu: number }` del partido en curso.
- `score`, `lives`, `matchNo` (1 en adelante; es el «nivel» del HUD) y `cpuLevel = min(matchNo, 10)`.
- `phase: Phase`, `phaseTimer` (s), `serveSide: Side`, `lastTouch: Side | null`,
  `matchClock` (s), `goldenGoal: boolean`, `stallTimer` (s).
- `history: { t: number; x: number; y: number }[]` — muestras de la posición del disco para el
  retardo de reacción de la CPU (ventana de 0.5 s).
- Entrada: `keys: Set<string>`.
- Bucle: `rafId`, `lastTime`, `acc` (acumulador del paso fijo), `destroyed`.

---

## Plan de implementación

### 1. Constantes y geometría de la mesa

`lib/games/air-hockey/engine.ts`. Constantes de diseño:

```
W 480 · H 720 · CENTER_Y 360
GOAL_W 170 · GOAL_X0 155 · GOAL_X1 325   (boca centrada)
POST_R 5   (postes: círculos fijos en (155,0), (325,0), (155,720), (325,720))
PUCK_R 15 · MALLET_R 30
PLAYER_HOME (240, 620) · CPU_HOME (240, 100)
PLAYER_BOUNDS x 30..450 · y 394..690     (mitad inferior, mazo entero dentro)
CPU_BOUNDS    x 30..450 · y 30..326      (mitad superior)
SERVE_PLAYER (240, 540) · SERVE_CPU (240, 180)
FIXED_DT 1/120 s · DT_MAX 50 ms
PUCK_DAMP 0.25 por s            (v *= exp(-PUCK_DAMP * dt) en cada paso)
PUCK_MAX 1000 px/s
WALL_REST 0.95 · POST_REST 0.9 · MALLET_REST 0.85
MALLET_MAX_SPEED 1400 px/s      (tope del mazo del jugador al seguir el destino)
KEY_SPEED 520 px/s
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Comprobación de no-túnel: a `PUCK_MAX` el disco recorre `1000/120 ≈ 8.3 px` por paso, menos que
`PUCK_R + MALLET_R = 45` y que `PUCK_R + POST_R = 20`; con el mazo a `MALLET_MAX_SPEED`
(`≈ 11.7 px` por paso) el solape máximo por paso también queda muy por debajo de esos radios. El
paso fijo no necesita colisión continua.

Comprobación: `npm run build` limpio.

### 2. Física: disco, bordes y postes

Bucle de física a paso fijo: `acc += min(dt, DT_MAX)`; mientras `acc >= FIXED_DT`, `step()` y
`acc -= FIXED_DT`. Cada `step()`, en este orden:

1. Mover los mazos (paso 3 y 4) y calcular su velocidad como `Δpos / FIXED_DT`.
2. `puck.x += vx*dt; puck.y += vy*dt`; `v *= exp(-PUCK_DAMP*dt)`; limitar `|v|` a `PUCK_MAX`.
3. **Bordes laterales** (`x < PUCK_R` o `x > W-PUCK_R`): reponer `x` al límite e invertir `vx`
   multiplicado por `WALL_REST`.
4. **Bordes cortos** (`y < PUCK_R` o `y > H-PUCK_R`): si `x` está **fuera** de `GOAL_X0..GOAL_X1`
   rebota igual que un lateral. Si está **dentro**, el disco entra en la ranura y no rebota.
5. **Postes**: círculo contra círculo con cada uno de los cuatro, `POST_REST`, empujando el disco
   fuera del solape a lo largo de la normal.
6. **Gol**: el disco marca cuando su centro cruza `y < -PUCK_R` (portería de la CPU, gol del
   jugador) o `y > H + PUCK_R` (portería del jugador, gol de la CPU) con `x` dentro de la boca.
   Un disco dentro de la ranura sin llegar a ese umbral sigue en juego y puede salir de nuevo.
7. **Disco parado**: si `|v| < 30 px/s` durante 3 s seguidos, `stallTimer` lo empuja con 300 px/s
   hacia la mitad contraria a donde está. Evita partidas congeladas con el disco en una esquina.

Comprobación: `npm run build` limpio.

### 3. Mazos y colisión disco–mazo

Para cada mazo, cada paso: si `dist(mazo, disco) < MALLET_R + PUCK_R`:

- Normal `n` = (disco − mazo) / dist; si `dist == 0`, `n = (0, ∓1)` hacia la portería rival.
- Reponer el disco a `dist = MALLET_R + PUCK_R` a lo largo de `n`.
- Velocidad relativa `vr = v_disco − v_mazo`; si `vr·n < 0`: `v_disco −= (1 + MALLET_REST) (vr·n) n`.
- Limitar a `PUCK_MAX`; anotar `lastTouch`.
- **Pinzamiento**: si tras reponer, el disco queda contra una pared y aún solapa el mazo, el mazo
  cede: se aparta a lo largo de `−n` dentro de su zona. El disco nunca queda atrapado ni
  atraviesa la pared.

El mazo del jugador persigue `target` con velocidad máxima `MALLET_MAX_SPEED` y se clampa a
`PLAYER_BOUNDS`. Con `inputMode == "keys"`, `target` se desplaza `KEY_SPEED * dt` según las
teclas pulsadas (diagonales normalizadas) y se clampa a los mismos límites. El mazo nunca cruza
`CENTER_Y`.

Comprobación: `npm run build` limpio.

### 4. La CPU

Tabla por nivel `L = cpuLevel` (1..10):

```
CPU_SPEED(L)  = min(1000, 380 + 70 * (L - 1))  px/s
CPU_REACT(L)  = max(0.04, 0.30 - 0.03 * (L - 1)) s
CPU_AIM_ERR(L)= max(2.5, 16 - 1.5 * (L - 1))   grados
```

- **Percepción retardada**: la CPU decide con la posición del disco registrada hace `CPU_REACT`
  segundos (`history`), no la actual. A nivel 1 llega tarde a los tiros rápidos; a nivel 10 casi
  no.
- **Defender** (disco en la mitad del jugador, o disco rápido hacia la CPU): su `x` objetivo es
  la del disco (retardado) clamada a `CPU_BOUNDS`; su `y` objetivo es `CPU_HOME.y`. Se mueve hacia el objetivo con `CPU_SPEED`.
- **Atacar** (disco en la mitad de la CPU con `|v| < 350 px/s`): se coloca 40 px detrás del
  disco respecto a la portería del jugador y avanza golpeándolo hacia el centro de esa portería
  con un desvío aleatorio uniforme de ±`CPU_AIM_ERR` grados. Tras golpear vuelve a defender.
- **Saque propio**: espera 0.8 s con el disco quieto en `SERVE_CPU` y lo ataca.
- La CPU **no** hace trampa: mismo `CPU_BOUNDS`, misma colisión, sin teletransporte, sin ver el
  futuro más allá del retardo.

Comprobación: `npm run build` limpio.

### 5. Partidos, saques y puntuación

Estructura:

- **Saque**: al empezar el partido y tras cada gol, el disco aparece quieto — en `SERVE_PLAYER`
  si saca el jugador, en `SERVE_CPU` si saca la CPU. Saca **quien encajó el gol**; al empezar el
  partido saca el jugador en los partidos impares y la CPU en los pares. Mientras
  `phase == "serve"` hay una pausa de 0.9 s con el rótulo `LISTO` dentro del canvas y los mazos
  se mueven pero el disco no; después pasa a `play`.
- **Gol**: `phase = "goal"` durante 1.2 s (el disco desaparece en la ranura, destello en la
  portería), suma al marcador del partido y vuelve a `serve`.
- **Fin de partido**: el primero en llegar a `MATCH_GOALS = 7`, o al agotarse
  `MATCH_SECONDS = 180` el que vaya por delante. Empate al agotar el tiempo: `goldenGoal = true`
  y el siguiente gol decide.
- **Victoria**: `matchNo++`, el marcador se reinicia, `phase = "matchEnd"` 2 s con rótulo
  `PARTIDO GANADO`, y empieza el siguiente contra una CPU más fuerte.
- **Derrota**: `lives--`; si quedan vidas, mismo `matchNo`, mismo nivel de CPU, marcador a cero
  tras 2 s con rótulo `PARTIDO PERDIDO`. Con `lives == 0`: `phase = "gameover"`.

Puntuación (`L = matchNo`, sin tope; el nivel de la CPU sí tiene tope 10):

```
GOAL_POINTS 100 · MATCH_WIN_BONUS 500 · SHUTOUT_BONUS 300 · LIVES_START 3
gol del jugador:     +GOAL_POINTS * L
victoria de partido: +MATCH_WIN_BONUS * L, y +SHUTOUT_BONUS * L si la CPU quedó a 0
gol de la CPU:       no resta
```

Comprobación: `npm run build` limpio.

### 6. Bucle, entrada, dibujo y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`: `onScore(score)`, `onLives(lives)`,
  `onLevel(matchNo)` solo cuando el valor cambia, como el resto de motores.
- Entrada: listeners `keydown` / `keyup` / `blur` / `pointermove` / `pointerdown` /
  `pointerup` / `pointercancel` sobre el canvas, nunca sobre `window`. `pointermove` y
  `pointerdown` escalan por `W / rect.width` y `H / rect.height` porque el CSS estira el canvas;
  poner `inputMode = "pointer"` y `target` (clamado). Al pulsar una tecla de juego,
  `inputMode = "keys"` y `target` parte del mazo actual. `pointerdown` hace `setPointerCapture`
  para que arrastrar fuera del canvas no corte el control.
- `canvas.style.touchAction = "none"` al crear el motor y se restaura en `destroy()`; si no, un
  arrastre vertical con el dedo desplaza la página.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`.
  `preventDefault()` solo para esas. `P` y `Escape` no llegan al motor.
- `draw()`: fondo azul noche; borde de la mesa con las dos bocas de portería marcadas; línea
  central, círculo central de 60 px de radio y puntos de saque; mazos como círculos con anillo
  interior (jugador magenta, CPU cian); disco blanco con estela de las últimas 6 posiciones;
  marcador del partido (`goals.cpu` arriba, `goals.player` abajo) como dígitos grandes con
  alfa 0.15 en cada mitad. Sin puntos, vidas ni nivel en el canvas.
- Rótulos de fase (`LISTO`, `PARTIDO GANADO`, `PARTIDO PERDIDO`, `GOL DE ORO`) dentro del canvas
  como estado propio del juego; sin overlay de game over.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez. `resume()` es no-op después.
- `restart()`: detiene el bucle, suelta teclas y estado de puntero, `score = 0`, `lives = 3`,
  `matchNo = 1`, partido nuevo, `emit()`, arranca.
- `dt` capado a `DT_MAX`; `lastTime = null` y `acc = 0` al reanudar.
- `destroy()` cancela el frame, quita los listeners, restaura `touchAction` y es idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 7. Catálogo: nueva ficha `air-hockey`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "air-hockey",
  title: "AIR HOCKEY",
  short: "Un disco, dos mazos y una portería que defender.",
  long: "Una mesa de aire, un disco que no se detiene y una CPU que aprende de cada partido. Rebota en las bandas, guarda tu portería y gana a siete goles; cada victoria sube el nivel del rival, y solo tienes tres partidos que perder.",
  cat: "VERSUS",
  cover: "cover-air-hockey",
  color: "magenta",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-air-hockey` nueva, en el mismo patrón que las portadas
generadas existentes (gradientes con línea y círculo central, sin imagen externa).

Comprobación: `/juegos/air-hockey` muestra la ficha en la biblioteca con su portada antes de que
el motor esté registrado (cae en `.game-arena` con `seededScores()`).

### 8. Registrar el motor

`lib/games/registry.ts`:

```ts
"air-hockey": {
  create: createAirHockeyGame,
  width: 480,
  height: 720,
  controls: "ratón o dedo para mover el mazo, o flechas y WASD",
  touch: {},
},
```

Comprobación: `/jugar/air-hockey` pinta el canvas real en vez de `.game-arena`.

### 9. Leaderboard

`supabase/migrations/<timestamp>_juego_air_hockey.sql`, con timestamp posterior al último de
`supabase/migrations/`:

```sql
insert into public.games (id, title) values ('air-hockey', 'AIR HOCKEY');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. Los tipos no se
regeneran: insertar una fila no cambia el esquema.

Comprobación: `select * from public.games` incluye la fila `air-hockey`.

### 10. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/air-hockey` muestra un canvas de 480×720 con mesa, mazos y disco, no la
      `.game-arena`.
- [ ] El mazo del jugador sigue al ratón dentro de su mitad y nunca cruza la línea central ni
      sale de la mesa, a cualquier tamaño de canvas (el cursor queda sobre el mazo).
- [ ] Arrastrar con el dedo sobre el canvas en móvil mueve el mazo sin desplazar la página.
- [ ] Flechas y WASD mueven el mazo, incluidas diagonales a la misma velocidad que las rectas;
      después de usar el teclado, mover el ratón devuelve el control al puntero.
- [ ] Un golpe fuerte lanza el disco más rápido que uno suave; el disco nunca supera 1000 px/s.
- [ ] El disco rebota en las bandas laterales y en las partes del borde corto fuera de la boca,
      perdiendo algo de velocidad en cada rebote.
- [ ] El disco entra en la ranura de la portería sin rebotar y marca; si no llega al umbral,
      puede volver a salir.
- [ ] Los postes desvían el disco sin atraparlo ni dejarlo pasar.
- [ ] El disco no atraviesa mazos ni paredes en un golpe a velocidad máxima, ni queda atrapado
      entre el mazo y una pared.
- [ ] Un disco parado en una esquina durante 3 s recibe un empujón hacia la otra mitad.
- [ ] Un gol del jugador suma `100 × partido` en el HUD; un gol de la CPU no resta.
- [ ] Tras un gol hay pausa de `LISTO` y el disco aparece quieto en la mitad de quien encajó.
- [ ] El primero en llegar a 7 goles gana el partido; ganar suma `500 × partido` y, si la CPU
      quedó a 0, `300 × partido` más, y sube el nivel del HUD a 02.
- [ ] A los 180 s gana quien vaya por delante; con empate aparece `GOL DE ORO` y el siguiente
      gol decide.
- [ ] Perder un partido resta una vida en el HUD y repite el mismo nivel de CPU; el HUD empieza
      en 3 vidas.
- [ ] La CPU de nivel 1 es claramente derrotable; la de nivel 5 devuelve la mayoría de tiros
      directos; la de nivel 10 es difícil pero no imbatible.
- [ ] La CPU nunca sale de su mitad ni de la mesa.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] El canvas no dibuja puntos, vidas ni nivel, ni ningún overlay de game over; solo el
      marcador del partido y los rótulos de fase.
- [ ] `JUGAR DE NUEVO` reinicia a partido 1, 0 puntos y 3 vidas sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'air-hockey'`.
- [ ] Esa puntuación aparece en `/salon?juego=air-hockey` y en `/juegos/air-hockey` sin
      recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=air-hockey` muestra el estado vacío.
- [ ] El botón `PAUSA` congela disco, mazos y reloj del partido, y `REANUDAR` los reanuda sin
      salto del disco ni de la CPU.
- [ ] `P` y `Escape` hacen lo mismo que el botón, y el motor no los interpreta como jugada.
- [ ] Con el canvas enfocado, las flechas y WASD no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D` en el campo de iniciales no mueve el mazo.
- [ ] Navegar de `/jugar/air-hockey` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no teletransporta el disco ni dispara golpes
      acumulados.
- [ ] `/jugar/asteroids`, `/jugar/caida`, `/jugar/arkanoid`, `/jugar/snake` y `/jugar/frogger`
      se juegan igual que antes; `/jugar/duelo-pixel` sigue en maqueta.
- [ ] `select * from public.games` incluye una fila `air-hockey` además de las existentes.
- [ ] `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en
      `/jugar/air-hockey`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** mundo lógico 480×720 vertical. La mesa real es alargada y las porterías van en los
  extremos cortos; un 800×600 apaisado obligaría a girar la mesa y a que el jugador mueva el
  mazo en horizontal contra la CPU, perdiendo la lectura natural «yo abajo, rival arriba».
- **Sí:** puntero como control principal y teclado como alternativa. El hockey de aire se juega
  con la mano sobre el mazo; con solo teclado el control es mucho menos preciso, pero se ofrece
  para quien no tenga ratón y para mantener el contrato de «jugable sin ratón» de los demás.
- **No:** cruceta táctil virtual. El arrastre directo sobre el canvas es mejor que cualquier
  cruceta para un mazo libre, así que `touch: {}` no pinta botones.
- **Sí:** mazo con velocidad máxima `MALLET_MAX_SPEED` al seguir el cursor, en vez de
  teletransportarlo. Evita golpes infinitamente fuertes con un movimiento brusco del ratón y
  elimina el túnel disco–mazo.
- **Sí:** el golpe transfiere la velocidad lineal del mazo al disco (`MALLET_REST 0.85`). Es lo
  que hace que un golpe con empuje valga más que un toque.
- **No:** spin ni rozamiento tangencial. Añade física que el jugador no ve y complica ajustar la
  CPU sin mejorar la jugabilidad.
- **Sí:** amortiguación suave `0.25/s` en vez de rozamiento nulo. La mesa de aire casi no tiene
  fricción, pero sin ella un disco lento rebota eternamente; la amortiguación lo detiene y
  `stallTimer` cubre el caso residual.
- **Sí:** la CPU con retardo de percepción, velocidad limitada y error de puntería, en vez de
  «reacción perfecta con handicap». Los tres parámetros son legibles y ajustables y la CPU
  parece humana.
- **Sí:** diez niveles de CPU con tope, y el contador de partido (y los puntos) sigue creciendo
  después. Premia la racha sin que el juego se vuelva imposible.
- **Sí:** tres vidas = tres partidos perdidos. Un partido es un bloque de 3-4 minutos; perder uno
  duele pero no acaba la sesión, a diferencia de un fin de juego por un solo gol.
- **Sí:** saca quien encajó el gol. Compensa psicológicamente al que va perdiendo y evita que un
  gol seguido de otro saque fácil sea trivial.
- **Sí:** gol de oro tras el tiempo. Un partido no puede acabar en empate: la campaña necesita
  vencedor.
- **Sí:** marcador del partido dibujado en la mesa. Es el marcador físico de la mesa, no el HUD;
  sin él no sabrías a cuánto va el partido, que es información que el HUD (puntos, vidas,
  partido) no da.
- **No:** sonido. No hay assets de audio.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                         | Mitigación                                                                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| El disco atraviesa el mazo o el poste en golpes muy rápidos.                   | Paso fijo 1/120 s y velocidades máximas que dejan el desplazamiento por paso por debajo de la suma de radios.    |
| El disco queda atrapado entre el mazo y una pared o esquina.                   | Pinzamiento: el mazo cede a lo largo de `−n`; criterio de aceptación específico.                                 |
| Pestaña en segundo plano: el acumulador dispara cientos de pasos al volver.    | `dt` capado a 50 ms, `acc = 0` y `lastTime = null` al reanudar.                                                  |
| La CPU resulta imbatible (tiros rápidos a su portería) o trivial.              | Tres parámetros por nivel con fórmulas explícitas y criterio jugable en niveles 1, 5 y 10.                       |
| El cursor y el mazo se desalinean porque el canvas está estirado por CSS.      | Escala por `W / rect.width` y `H / rect.height`; criterio a varios tamaños.                                      |
| En móvil el arrastre desplaza la página o el sistema roba el gesto.            | `touch-action: none`, `setPointerCapture` y `pointercancel` que suelta el estado de puntero.                     |
| Teclas de iniciales llegan al motor mientras se escribe.                       | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                                      |
| El jugador abusa del teclado/ratón alternando para teletransportar el mazo.    | `target` siempre se persigue con `MALLET_MAX_SPEED`; cambiar de método no mueve el mazo de golpe.                |
| El disco queda parado en la boca de la portería y nunca cruza el umbral.       | `stallTimer` lo empuja tras 3 s; además el umbral de gol es `±PUCK_R` fuera de la mesa, alcanzable con el empuje.|
| Una racha larga infla la puntuación por `matchNo` sin tope.                    | Es intencional (premia la racha); el nivel de CPU sí topa en 10 y el coste de cada derrota es una vida.          |

---

## Lo que **no** entra en esta spec

- Bumpers, potenciadores, varios discos o cualquier modificador de mesa (variante 02).
- Dos jugadores local u online, y mover `duelo-pixel` de maqueta a real.
- Sonido.
- Skins.
- Spin y rozamiento mazo–disco.
- Dificultad elegible.
- Autenticación nueva, cambios en `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
