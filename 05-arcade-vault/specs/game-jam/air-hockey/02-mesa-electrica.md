# SPEC — AIR HOCKEY: mesa eléctrica

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-26
> **Objetivo:** Diseñar `air-hockey` como una partida continua de puntuación contra la CPU sobre una
> mesa con bumpers que se añaden por nivel, potenciadores que aparecen en el centro (multidisco,
> escudo, congelación, mazo grande) y una racha de goles que multiplica los puntos, como ficha
> nueva en categoría VERSUS con motor real y leaderboard en Supabase.

---

## Por qué existe esta spec

La variante `01-liga-clasica.md` es el hockey de aire puro: partidos cerrados a 7 goles, CPU que
sube de nivel y una vida por partido perdido. Esta variante comparte con ella el **mismo juego
base** — mesa vertical de 480×720, disco, mazos circulares, porterías de boca abierta, control
por puntero o teclado — pero cambia **el arco de la partida**: no hay partidos, hay una sola
partida arcade que dura mientras no encajes cinco goles, y la tensión viene de la mesa, no solo
de la CPU.

El hockey de aire de salón con «efectos» (mesas con bumpers, discos extra, ventiladores) es un
subgénero real. Aquí se traduce a tres capas: **obstáculos fijos** que cambian los ángulos,
**potenciadores** que el jugador y la CPU pueden recoger golpeando el disco contra ellos, y una
**racha** que premia encadenar goles. El resultado se parece más a un pinball enfrentado a una
CPU que a un deporte, y eso lo distingue de la variante clásica en el diseño y no solo en las
constantes.

Como en la variante 01, **no hay código de referencia**: las constantes de este documento **son**
el diseño. Todo se dibuja con primitivas de canvas. Los datos de mesa, física de disco, mazos,
CPU base e interfaz con la plataforma son los mismos que en `01-liga-clasica.md`, pero esta spec
es autosuficiente y los repite donde hace falta.

---

## Alcance

**Dentro:**

- `lib/games/air-hockey/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createAirHockeyGame`, sin assets externos.
- Mundo lógico de **480×720**, jugador abajo, CPU arriba; porterías de 170 px de boca.
- Física de paso fijo 1/120 s: disco, bordes, postes, mazos y bumpers.
- **Bumpers** circulares fijos de radio 22 que aparecen con el nivel: 0 en el nivel 1, 2 en el
  nivel 2, 3 desde el nivel 4. Rebotan con energía extra.
- **Potenciadores** (`MULTI`, `SHIELD`, `FREEZE`, `BIG`) que aparecen cada 12 s en la banda
  central de la mesa, se recogen tocándolos con un disco y benefician a quien tocó el disco por
  última vez, sea el jugador o la CPU.
- **Varios discos** a la vez (potenciador `MULTI`): cualquier disco que entre en una portería
  cuenta.
- **Racha** de goles: el multiplicador sube con cada gol seguido y se reinicia al encajar.
- 5 vidas = 5 goles encajados; cada 4 goles marcados sube el nivel.
- Control por puntero (ratón o dedo) o teclado, igual que en la variante 01.
- CPU con parámetros por nivel, más agresiva con los potenciadores que la de la variante 01.
- Nueva ficha `air-hockey` en `lib/games.ts` (categoría `VERSUS`) y clase de portada
  `cover-air-hockey` en `app/globals.css`.
- Una línea `air-hockey` en `GAME_ENGINES` (`lib/games/registry.ts`).
- Migración `insert into public.games (id, title) values ('air-hockey', 'AIR HOCKEY')` y su
  aplicación.

**Fuera de alcance (para specs futuras):**

- Partidos con marcador a N goles y campaña de CPU por partido (variante 01).
- Dos jugadores local u online.
- Sonido.
- Skins (`clasico`/`neon`/`retro`).
- Potenciadores adicionales, bumpers móviles o ventiladores.
- Spin o rozamiento mazo–disco.
- Autenticación nueva, cambios en `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma.** `GameEngineEntry` existe desde la
SPEC 08, y `scores` y `game_stats` sirven a este juego sin tocarlas: el leaderboard se enciende
con una fila en `games`. El guardado pasa por `guardarScore` tal como está tras la SPEC 15; el
motor no sabe nada de `user_id`.

Tipos locales del motor, sin exportar:

```ts
type Vec = { x: number; y: number };
type Body = { x: number; y: number; vx: number; vy: number }; // px y px/s, centro
type Side = "player" | "cpu";
type PowerKind = "MULTI" | "SHIELD" | "FREEZE" | "BIG";
type Pickup = { kind: PowerKind; x: number; y: number; life: number }; // life en s
type Phase = "serve" | "play" | "goal" | "gameover";
```

Estado en la clausura de `createAirHockeyGame`:

- `pucks: Body[]` — de 0 a 3 discos vivos a la vez; vacío solo durante `goal`/`serve`.
- `player: Body`, `cpu: Body`, `target: Vec`, `inputMode: "pointer" | "keys"`.
- `bumpers: Vec[]` — se recalcula al cambiar de nivel.
- `pickup: Pickup | null` y `pickupAccum` (s hasta el siguiente).
- Efectos activos: `shield: { player: number; cpu: number }` (s restantes),
  `frozen: { player: number; cpu: number }`, `big: { player: number; cpu: number }` y
  `extraPucksLeft` (s hasta que desaparecen los discos extra).
- `score`, `lives`, `level`, `scored` (goles del jugador en total), `streak`.
- `phase: Phase`, `phaseTimer` (s), `serveSide: Side`, `lastTouch: Side | null`, `stallTimer`.
- `history` (muestras del disco principal para el retardo de la CPU).
- Entrada: `keys: Set<string>`. Bucle: `rafId`, `lastTime`, `acc`, `destroyed`.

---

## Plan de implementación

### 1. Constantes de mesa y física

`lib/games/air-hockey/engine.ts`. Constantes de diseño:

```
W 480 · H 720 · CENTER_Y 360
GOAL_W 170 · GOAL_X0 155 · GOAL_X1 325 · POST_R 5
PUCK_R 15 · MALLET_R 30 · MALLET_R_BIG 42
PLAYER_HOME (240, 620) · CPU_HOME (240, 100)
bounds del mazo: x r..480-r · jugador y 360+r+4..720-r · CPU y r..360-r-4   (r = radio actual)
SERVE_PLAYER (240, 540) · SERVE_CPU (240, 180)
FIXED_DT 1/120 s · DT_MAX 50 ms
PUCK_DAMP 0.25 por s · PUCK_MAX 1000 px/s
WALL_REST 0.95 · POST_REST 0.9 · MALLET_REST 0.85
MALLET_MAX_SPEED 1400 px/s · KEY_SPEED 520 px/s
BUMPER_R 22 · BUMPER_KICK 1.1 · BUMPER_MIN_OUT 300 px/s
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Física en cada paso: mover mazos, integrar discos, amortiguar y limitar a `PUCK_MAX`, rebotar en
bordes laterales y en el borde corto fuera de la boca, rebotar en los cuatro postes, resolver la
colisión con cada mazo (normal desde el mazo, reponer a `dist = r_mazo + PUCK_R`, transferir
velocidad relativa con `MALLET_REST`) y con cada bumper:

- **Bumper**: círculo fijo; al tocarlo, reponer el disco fuera del solape, reflejar la velocidad
  y fijar el módulo a `max(|v| · BUMPER_KICK, BUMPER_MIN_OUT)` (hasta `PUCK_MAX`). Es lo que
  distingue un bumper de un muro: **añade energía**.
- **Escudo**: mientras `shield[side] > 0`, la boca de esa portería se trata como pared (el disco
  rebota con `WALL_REST` en `y = PUCK_R` o `y = H - PUCK_R`).
- **Gol**: un disco marca cuando su centro cruza `y < -PUCK_R` (gol del jugador) o
  `y > H + PUCK_R` (gol de la CPU) dentro de la boca. El disco se elimina de `pucks`.
- **Disco parado**: igual que la variante 01, con `stallTimer` por disco.

No-túnel: a `PUCK_MAX` el desplazamiento por paso es `≈ 8.3 px`, menor que
`PUCK_R + BUMPER_R = 37`, `PUCK_R + MALLET_R = 45` y `PUCK_R + POST_R = 20`.

Comprobación: `npm run build` limpio.

### 2. Niveles y bumpers

```
level = 1 + floor(scored / GOALS_PER_LEVEL)     GOALS_PER_LEVEL 4
bumpers(level):
  1     → []
  2, 3  → [(120, 360), (360, 360)]
  ≥ 4   → [(120, 360), (360, 360), (240, 360)]
LIVES_START 5
```

Los bumpers se colocan sobre `CENTER_Y` para que no favorezcan a ningún lado. Ningún punto de
saque (`y = 540` y `y = 180`) está a menos de 100 px de un bumper. Al subir de nivel, los bumpers
nuevos aparecen en el siguiente saque, nunca con el disco en juego.

Comprobación: `npm run build` limpio.

### 3. CPU

```
CPU_SPEED(L)   = min(1000, 360 + 55 * (L - 1))  px/s
CPU_REACT(L)   = max(0.05, 0.28 - 0.025 * (L - 1)) s
CPU_AIM_ERR(L) = max(3, 15 - 1.2 * (L - 1))  grados
L = level   (sin tope: la fórmula satura sola)
```

Mismos comportamientos que en la variante 01: **defender** (sigue la `x` retardada del disco
más peligroso, es decir, el que más rápido se acerca a su portería) y **atacar** (golpear hacia la
portería rival cuando el disco está en su mitad y va lento). Con varios discos persigue el que
tiene menor `t = (distancia a su portería) / (velocidad hacia ella)`. Cuando hay un `pickup` en
su mitad y no hay disco amenazante (`t > 1.5 s`), la CPU intenta empujar un disco hacia él con
probabilidad 0.5 por saque. **La CPU no hace trampa**: mismos límites, misma colisión, mismo
retardo de percepción.

Comprobación: `npm run build` limpio.

### 4. Potenciadores

- Cada `POWERUP_EVERY = 12 s` de juego (`phase == "play"`) aparece un `pickup` si no hay otro:
  tipo uniforme entre los cuatro, posición aleatoria en `x 60..420`, `y 300..420`, a más de 60 px
  de cualquier bumper. Vive `POWERUP_LIFE = 8 s` y parpadea los últimos 2.
- Se recoge cuando un disco entra a menos de `PUCK_R + 18` px. Beneficia a `lastTouch`; si es
  `null` (nadie ha tocado el disco desde el saque), no se recoge y sigue disponible.
- Efectos (la **propietaria** es la que lo recoge, la **rival** la otra):

```
MULTI   +2 discos nacen del disco recogido con ±25° de desvío y el mismo módulo;
        duran POWER_MULTI 10 s (después los extra desaparecen) o hasta marcar. Máximo 3 discos.
SHIELD  la portería de la propietaria queda tapada POWER_SHIELD 6 s.
FREEZE  el mazo de la rival no se mueve POWER_FREEZE 2 s.
BIG     el mazo de la propietaria pasa a MALLET_R_BIG POWER_BIG 8 s (se reclampa a sus bounds).
```

- Recoger suma `PICKUP_POINTS 25` si la propietaria es el jugador.
- Un segundo `MULTI` con discos extra vivos no añade más discos pero reinicia el temporizador.
- `FREEZE` sobre un mazo que ya está congelado reinicia el temporizador; no se acumula.
- Al marcar el último disco, todos los efectos de mesa (escudos, congelación, mazo grande) se
  cancelan en el siguiente saque.

Comprobación: `npm run build` limpio.

### 5. Saque, goles y racha

- Saque: `phase = "serve"` 0.9 s con el rótulo `LISTO`; un solo disco quieto en la mitad de quien
  encajó (o en la del jugador al empezar).
- Gol: si quedan otros discos, la partida sigue sin pausa y el contador de racha se actualiza;
  si era el último, `phase = "goal"` 1.2 s y después `serve`.
- Racha: `streak` suma 1 con cada gol del jugador y vuelve a 0 al encajar. Multiplicador
  `mult = min(4, max(1, streak))`.

```
GOAL_POINTS 100 · PICKUP_POINTS 25 · STREAK_MAX 4
gol del jugador:   +GOAL_POINTS * level * mult
gol de la CPU:     lives--, streak = 0, no resta puntos
```

- Con `lives == 0`: `phase = "gameover"`.
- Subida de nivel: al marcar el gol número 4, 8, 12… se anuncia con un rótulo `NIVEL N` dentro
  del canvas durante el siguiente saque.

Comprobación: `npm run build` limpio.

### 6. Bucle, entrada, dibujo y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`: `onScore`, `onLives`, `onLevel` solo
  cuando el valor cambia.
- Entrada: `keydown` / `keyup` / `blur` / `pointermove` / `pointerdown` / `pointerup` /
  `pointercancel` sobre el canvas, nunca sobre `window`; escalado `W / rect.width` y
  `H / rect.height`; `setPointerCapture` en `pointerdown`; `canvas.style.touchAction = "none"`
  restaurado en `destroy()`. `GAME_KEYS`: flechas y WASD; `preventDefault()` solo para esas;
  `P` y `Escape` no llegan al motor.
- `draw()`: mesa, línea y círculo central, bumpers como círculos con anillo cian pulsante,
  `pickup` como cápsula con inicial del efecto (`M`, `S`, `F`, `B`) y parpadeo al final,
  mazos (el del jugador magenta, el de la CPU cian; hielo si `FREEZE`, halo si `BIG`), barrera
  luminosa sobre la boca si hay `SHIELD`, discos con estela de las últimas 6 posiciones. Rótulos
  `LISTO`, `NIVEL N` y `RACHA ×N` dentro del canvas; sin puntos, vidas ni nivel y sin overlay de
  game over.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez. `resume()` es no-op después.
- `restart()`: detiene el bucle, suelta teclas y puntero, reinicia todo el estado (incluidos
  efectos y `pickup`), `emit()`, arranca.
- `dt` capado a `DT_MAX`; `lastTime = null` y `acc = 0` al reanudar. Todos los temporizadores
  de efectos y de `pickup` avanzan solo con el reloj del juego, no con el de pared.
- `destroy()` cancela el frame, quita listeners, restaura `touchAction` y es idempotente.
- `initGame(); draw();` antes de devolver.

Comprobación: `npm run build` limpio.

### 7. Catálogo: nueva ficha `air-hockey`

`lib/games.ts`, nueva entrada en `GAMES`:

```ts
{
  id: "air-hockey",
  title: "AIR HOCKEY",
  short: "Una mesa con bumpers, discos extra y una CPU sin piedad.",
  long: "Un disco, dos mazos y una mesa que se electrifica a medida que marcas: bumpers que devuelven el disco más rápido, potenciadores que triplican los discos, congelan al rival o te dan un mazo gigante. Encadena goles para multiplicar tu puntuación y aguanta cinco goles en contra.",
  cat: "VERSUS",
  cover: "cover-air-hockey",
  color: "magenta",
  best: 0,
  plays: "0",
}
```

`app/globals.css`: clase `.cover-air-hockey` nueva, en el mismo patrón que las portadas
generadas existentes, sin imagen externa.

Comprobación: `/juegos/air-hockey` muestra la ficha con su portada antes de registrar el motor.

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
regeneran.

Comprobación: `select * from public.games` incluye la fila `air-hockey`.

### 10. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, y el recorrido
manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/air-hockey` muestra un canvas de 480×720, no la `.game-arena`.
- [ ] El nivel 1 no tiene bumpers; el nivel 2 tiene dos; desde el nivel 4 hay tres.
- [ ] El HUD pasa a nivel 02 al marcar el gol número 4 y a 03 al octavo.
- [ ] Un disco que toca un bumper sale con al menos 300 px/s y con un 10 % más de velocidad que
      la de entrada, sin superar 1000 px/s.
- [ ] El mazo del jugador sigue al puntero o al teclado sin cruzar la línea central ni salir de la
      mesa, también con `BIG` activo.
- [ ] Arrastrar con el dedo en móvil mueve el mazo sin desplazar la página.
- [ ] Cada 12 s de juego aparece un potenciador en la banda central, y desaparece solo a los 8 s
      si nadie lo recoge.
- [ ] Un potenciador solo se recoge si algún mazo ha tocado el disco desde el saque.
- [ ] `MULTI` crea hasta 3 discos en total; un gol de cualquiera de ellos suma puntos y el resto
      sigue en juego sin pausa.
- [ ] `SHIELD` tapa la boca de la propietaria 6 s: el disco rebota en lugar de marcar.
- [ ] `FREEZE` inmoviliza al mazo rival 2 s y el mazo se ve helado.
- [ ] `BIG` agranda el mazo de la propietaria durante 8 s y vuelve al tamaño normal sin que el
      mazo se quede fuera de límites.
- [ ] Si la CPU recoge un potenciador, el efecto se aplica a ella, no al jugador.
- [ ] Un gol del jugador suma `100 × nivel × racha` (racha máxima 4); un gol de la CPU resta una
      vida y reinicia la racha sin restar puntos.
- [ ] Recoger un potenciador siendo el jugador suma 25 puntos.
- [ ] El HUD empieza con 5 vidas y pierde una por cada gol encajado.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real.
- [ ] El canvas no dibuja puntos, vidas ni nivel, ni overlay de game over; solo los rótulos
      `LISTO`, `NIVEL N` y `RACHA ×N`.
- [ ] La CPU nunca sale de su mitad ni de la mesa, y a nivel 6 sigue siendo derrotable.
- [ ] Pausa y reanudación congelan discos, mazos, potenciadores y efectos sin saltos.
- [ ] `P` y `Escape` hacen lo mismo que el botón de pausa; el motor no los interpreta.
- [ ] Escribir `W`, `A`, `S`, `D` en el campo de iniciales no mueve el mazo.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, 5 vidas, sin bumpers ni efectos activos.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'air-hockey'`.
- [ ] Esa puntuación aparece en `/salon?juego=air-hockey` y en `/juegos/air-hockey` sin
      recargar a mano.
- [ ] Pulsar `GUARDAR PUNTUACIÓN` dos veces seguidas no inserta dos filas.
- [ ] Con `scores` vacía para este juego, `/salon?juego=air-hockey` muestra el estado vacío.
- [ ] Navegar de `/jugar/air-hockey` a `/biblioteca` y volver no duplica el bucle.
- [ ] Dejar la pestaña en segundo plano y volver no agota los temporizadores de golpe.
- [ ] Los demás juegos con motor se juegan igual que antes; `/jugar/duelo-pixel` sigue en
      maqueta.
- [ ] `select * from public.games` incluye una fila `air-hockey` además de las existentes.
- [ ] `lib/games.ts` mantiene sin tocar las fichas de los demás juegos.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** misma mesa 480×720 y misma física base que la variante 01. Las dos variantes son el
  mismo juego con arcos distintos, no dos juegos; así el motor de una puede servir de base a la
  otra si se decide.
- **Sí:** partida continua con 5 vidas en lugar de partidos. El twist es la mesa, y la partida
  con un único marcador acumulado deja que los bumpers y los potenciadores sean el centro.
- **Sí:** bumpers que **añaden** energía (`BUMPER_KICK 1.1`, mínimo 300 px/s). Con rebote
  elástico serían un muro redondo; con energía cambian el ritmo de la partida.
- **Sí:** bumpers en el eje central. No favorecen a ningún lado y no tapan los puntos de saque.
- **Sí:** potenciadores para quien tocó el disco por última vez, también para la CPU. Un
  potenciador solo del jugador es una mesa de bonus; con ambos lados es una disputa.
- **Sí:** el potenciador no se recoge si `lastTouch == null`. Evita que un disco parado en el
  saque recoja un efecto sin que nadie lo haya jugado.
- **No:** más de cuatro potenciadores. Cuatro (multiplicar, proteger, castigar, agrandar) cubren
  los cuatro verbos de la mesa; más diluyen el diseño y la lectura del jugador.
- **Sí:** tope de 3 discos. Más discos son ilegibles a 480×720 y dispararían la carga de colisión.
- **Sí:** racha con multiplicador máximo ×4. Premia encadenar goles sin que un golpe de suerte
  rompa el leaderboard.
- **Sí:** 5 vidas. Los goles encajados llegan más rápido que en un partido de 7 (discos extra,
  rebotes de bumper), así que 3 serían demasiado castigo.
- **Sí:** CPU con tabla propia, algo más lenta que la de la variante 01 en el mismo nivel. Los
  obstáculos ya le dan ventaja de ruido; compensarla mantiene la curva justa.
- **No:** `touch` con botones. El arrastre del dedo es el control; no hay botones de acción.
- **No:** sonido. No hay assets de audio.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                          | Mitigación                                                                                                       |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| El disco atraviesa un bumper, un mazo o un poste a velocidad máxima.            | Paso fijo 1/120 s; el desplazamiento por paso (`≈ 8.3 px`) es menor que cualquier suma de radios.                |
| Un bumper acelera el disco en bucle y lo deja atrapado rebotando entre dos.     | `BUMPER_KICK` solo hasta `PUCK_MAX`, y la amortiguación `0.25/s` lo frena; `stallTimer` cubre el residual.       |
| `SHIELD` de la CPU hace imposible marcar y la partida se estanca.               | Dura 6 s y solo la CPU puede tenerlo si recoge el potenciador; el disco sigue en juego y el jugador puede esperar.|
| `FREEZE` encadenado deja al jugador sin control varios segundos.                | No se acumula (reinicia), dura 2 s y el siguiente `pickup` tarda 12 s.                                           |
| `BIG` hace que el mazo salga de sus límites al agrandarse junto a la pared.     | Se reclampa a los bounds con el radio nuevo en el mismo paso; criterio de aceptación específico.                 |
| Con 3 discos la CPU «se bloquea» eligiendo cuál defender.                       | Selección por el menor `t` de llegada, recalculada cada paso con histéresis de 0.15 s.                           |
| Pestaña en segundo plano: los temporizadores de efectos caducan de golpe.       | Los temporizadores avanzan con el `dt` capado y `lastTime = null` al reanudar.                                   |
| El `pickup` aparece sobre un bumper o en el camino del saque.                   | Posición aleatoria con descarte a menos de 60 px de un bumper y banda `y 300..420`, lejos de los saques.        |
| La racha ×4 con nivel alto genera puntuaciones desproporcionadas.               | Es intencional y está acotado: el multiplicador topa en 4, la CPU escala con el nivel y las vidas son 5.        |
| Control táctil: el arrastre desplaza la página.                                 | `touch-action: none`, `setPointerCapture` y `pointercancel`.                                                    |
| Teclas de iniciales llegan al motor mientras se escribe.                        | Bucle parado con el modal abierto y listeners en el canvas, no en `window`.                                      |

---

## Lo que **no** entra en esta spec

- Partidos a N goles y campaña de CPU por partido (variante 01).
- Dos jugadores local u online, y mover `duelo-pixel` de maqueta a real.
- Sonido.
- Skins.
- Más potenciadores, bumpers móviles o ventiladores.
- Spin y rozamiento mazo–disco.
- Autenticación nueva, cambios en `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
