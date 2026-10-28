# SPEC — RUN & GUN: rescate y granadas

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-28
> **Objetivo:** Diseñar una lectura de run-and-gun más cercana a los arcades de «rescata y revienta» — barra de tres golpes, cuatro arenas con la pantalla bloqueada hasta limpiar las oleadas, rehenes que liberar, granadas en parábola, armas con munición limitada y un multiplicador de combo — como la misma ficha `run-gun` en categoría SHOOTER, con motor real y leaderboard en Supabase.

---

## Por qué existe esta spec

La variante `01-asalto-selva.md` es el run-and-gun mínimo: un golpe mata, un nivel largo que
avanza sin parar y un arsenal de cápsulas. Esta variante comparte con ella **el mismo juego base**
— mismo viewport 800×600, misma física, mismos controles de movimiento, apuntado y salto, mismo
`game-id` — pero cambia **tres decisiones de diseño** que la hacen otro juego:

1. **Supervivencia por barra, no por golpe único:** cada vida tiene 3 puntos de escudo, con botiquines.
2. **Estructura por arenas:** el scroll se detiene en cuatro arenas y no avanza hasta limpiar las
   oleadas. Se juega más con la posición y el control de la zona que con la carrera.
3. **Recursos y riesgo/recompensa:** rehenes que hay que liberar a costa de exponerse, granadas
   con trayectoria parabólica (la única forma de golpear a quien está tras una cobertura) y armas
   que se agotan.

Como con Snake (SPEC 10) y con las propuestas `defensor` y `ciempies`, **no hay código de
referencia**: las constantes de este documento **son** el diseño. Todo se dibuja con primitivas
de canvas, sin spritesheet ni audio.

Las dos variantes son excluyentes: solo una se promueve a la numeración `specs/NN-*.md`, y
ambas se implementarían como el mismo `lib/games/run-gun/engine.ts`.

---

## Alcance

**Dentro:**

- `lib/games/run-gun/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createRunGunGame`, sin assets externos.
- Viewport de **800×600**. Mundo de **6400 px** con cuatro arenas bloqueadas y corredores de scroll
  entre ellas.
- Misma física y mismo control que la variante 01 (carrera, salto, tumbarse, apuntado en 8
  direcciones, plataformas de un solo sentido), más **granada** en `KeyC`.
- Escudo de 3 puntos por vida, 2 vidas, botiquines.
- Pistola infinita y dos armas con munición: ametralladora pesada (`H`) y escopeta (`E`).
- Cuatro enemigos de infantería/vehículo (soldado, mortero, jeep, helicóptero) y un tanque jefe.
- Rehenes atados: liberarlos da puntos, ítems y un multiplicador final.
- Combo de bajas encadenadas.
- Nueva ficha `run-gun` (`SHOOTER`), portada `cover-run-gun`, línea en `GAME_ENGINES` con el
  campo `touch`, y migración `insert into public.games (id, title) values ('run-gun', 'RUN & GUN')`.

**Fuera de alcance (para specs futuras):**

- Sonido y música.
- Botón táctil de granada (ver la decisión sobre `touch`).
- Vehículos conducibles, cuchillo cuerpo a cuerpo, niveles distintos, cooperativo.
- Sprites: el arte son rectángulos y polígonos de canvas.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas.

Tipos locales del motor, sin exportar:

```ts
type Aim = "r" | "ur" | "u" | "ul" | "l" | "dl" | "d" | "dr";
type Weapon = "pistol" | "heavy" | "shotgun";
type Foe = { kind: "soldier" | "mortar" | "jeep" | "heli" | "tank"; x; y; w; h; hp; t; vx; alive: boolean };
type Hostage = { x; y; state: "tied" | "freed" | "running" | "gone"; carries: "H" | "E" | "G" | "HP" | "SCORE" };
type Grenade = { x; y; vx; vy; fuse: number; alive: boolean };
type Arena = { lockX: number; waves: Wave[]; hostages: number[] }; // lockX = camX al bloquear
type Wave = { at: "start" | "clear"; spawns: Spawn[] }; // "clear": cuando la anterior está limpia
```

Estado en la clausura de `createRunGunGame`:

- Jugador: `px, py, vx, vy, facing, grounded, prone, coyote, aim, weapon, ammo`, `grenades`,
  `shield` (0..3), `fireCd`, `grenadeCd`, `invuln`, `respawn`.
- `camX`, `phase: "corridor" | "arena" | "go"`, `arenaIdx`, `waveIdx`, `goBlink` (ms).
- Pools fijos: `pBullets[24]`, `eBullets[32]`, `foes[16]`, `grenadePool[4]`, `mortars[4]` (proyectiles
  de mortero), `hostages[12]`, `pickups[6]`, `sparks[48]`.
- `score`, `lives`, `level`, `combo` (`count`, `timer` ms), `rescued` (de la pasada actual), `nextExtra`.
- `waiting`, `state: "playing" | "clear" | "gameover"`, `clearT`.
- Bucle: `rafId`, `lastTime`, `destroyed`; entrada: `keys: Set<string>`.

---

## Plan de implementación

### 1. Constantes de diseño

`lib/games/run-gun/engine.ts`. Heredadas de la variante 01 sin cambios (no se redefinen, se
copian): `W 800 · H 600 · GROUND_Y 520 · KILL_Y 660 · GRAVITY 1800 · RUN_SPEED 180 · JUMP_V 640 ·
COYOTE_MS 80 · JUMP_BUFFER_MS 100 · FALL_MAX 900 · PLAYER 20×44 / tumbado 40×18 / salto 20×24 ·
BULLET_SPEED 620 · E_BULLET_SPEED 260 · DT_MAX 50 ms`.

Nuevas o distintas:

```
LEVEL_W 6400 · START_LIVES 2 · MAX_LIVES 5
SHIELD_MAX 3 · HIT_INVULN_MS 1000 (tras un golpe) · RESPAWN_MS 1200 · INVULN_MS 2500
EXTRA_LIFE_EVERY 30000
PISTOL  cd 260 ms · 1 bala · daño 1 · munición infinita
HEAVY   cd 90 ms · 1 bala con ±4° de dispersión determinista (ciclo de 5) · daño 1 · 120 balas
SHOTGUN cd 520 ms · 7 perdigones en abanico ±21° (cada 7°) · daño 1 · alcance 300 px · 24 cartuchos
  (al llegar a 0 la munición el arma vuelve a PISTOL)
GRENADE  vx = 330·facing px/s · vy0 = −420 · fuse 1500 ms (estalla al tocar suelo o enemigo)
         daño 3 en radio 56 px · cd 450 ms · GRENADES_START 5 · GRENADES_MAX 20
         (ArrowUp pulsada: vx = 200·facing, vy0 = −620, la granada sube casi vertical)
COMBO_WINDOW 2000 ms · COMBO_MAX 5 (multiplicador ×1..×5)
  el multiplicador es min(COMBO_MAX, 1 + floor((count−1)/3)) con count ≥ 1
HOSTAGE_TOUCH 28 px · rescate: +500 y suelta el ítem; al final de la pasada +1000 × rescatados
```

Daño del propio jugador: un golpe quita 1 de escudo; el contacto con un soldado o la explosión
cercana de un jeep quitan 2. Con `shield = 0` tras un golpe se pierde una vida, con `shield = 3`
al reaparecer. Un botiquín (`HP`) repone 2 de escudo. Las granadas del jugador **no** le hacen daño.

Enemigos:

| Enemigo     | Hitbox | HP  | Puntos | Comportamiento                                                                                                                                                       |
| ----------- | ------ | --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| soldado     | 20×44  | 1   | 100    | Entra por el borde de la arena, corre 120 px/s hacia el jugador; a menos de 220 px se para y dispara una bala cada 1500 ms (8 direcciones). Si el jugador salta, no salta tras él. |
| mortero     | 24×34  | 2   | 250    | Fijo sobre el suelo o una plataforma. Cada 2600 ms lanza un proyectil en parábola hacia donde está el jugador (`vy0 = −520`, `vx` calculado); estalla al tocar el suelo (daño 1 en radio 36 px). **Solo es visible a ras de pantalla tras una caja de 40×60 que lo cubre de frente**: las balas rectas impactan en la caja, las granadas pasan por encima. |
| jeep        | 120×50 | 8   | 800    | Cruza la arena de un borde a otro a 200 px/s y se detiene 1500 ms en el centro (la arena se ve de lado) para disparar tres balas bajas; luego sigue y sale. Al destruirlo estalla (daño 2 en radio 80 px al jugador). Se puede saltar encima: no hace daño de contacto sobre su techo. |
| helicóptero | 100×50 | 20  | 2000   | Mini-jefe de la arena 3. Va y viene a `y = 110` a 140 px/s; cada 2200 ms suelta 2 bombas verticales (caen a 300 px/s, estallan al tocar el suelo con radio 48 px) y cada 3400 ms dispara una ráfaga de 3 balas al jugador. Solo las balas y las granadas lo dañan; las granadas lo golpean si estallan a menos de 70 px. |
| tanque      | 160×90 | 40  | 8000   | Jefe de la arena 4 (ver abajo).                                                                                                                                     |

Nivel `L`: intervalos de disparo × `max(0.55, 1 − 0.09·(L−1))`, velocidad de bala enemiga ×
`min(1.45, 1 + 0.09·(L−1))`. La cantidad de enemigos y rehenes no cambia.

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

#### Estructura del nivel

Corredores (scroll libre hacia la derecha, plataformas y suelo continuo, sin fosos) de 800 px
entre arenas; en cada corredor aparecen 4 soldados escalonados cada 250 px y un mortero cada 600 px.

```
Corredor 1: camX 0–800        Arena 1: camX 800    (zona de juego x 800–1600)
Corredor 2: camX 1600–2400    Arena 2: camX 2400   (x 2400–3200)
Corredor 3: camX 3200–4000    Arena 3: camX 4000   (x 4000–4800, helicóptero)
Corredor 4: camX 4800–5600    Arena 4: camX 5600   (x 5600–6400, tanque jefe)
```

Cada arena tiene suelo en `GROUND_Y` y dos plataformas de un solo sentido a `y = 400` y `y = 330`
(la arena 3 además tiene una a `y = 270`, para alcanzar al helicóptero). Hay una caja de mortero a
la derecha de cada arena 1 y 2 en `x = camX + 700`.

Oleadas (`start` = al bloquearse la cámara; `clear` = cuando se limpió la anterior):

```
Arena 1: start  → 4 soldados (2 izq., 2 der., separados 500 ms) + 1 mortero tras la caja
         clear  → 1 jeep desde la derecha
         rehenes: 2  (x = camX + 220 y camX + 560, suelo / plataforma y400)
Arena 2: start  → 5 soldados + 2 morteros
         clear  → 1 jeep desde la izquierda y 4 soldados
         clear  → 1 jeep desde la derecha
         rehenes: 3
Arena 3: start  → helicóptero + 3 soldados
         clear  → 6 soldados (3 por lado) + 1 mortero
         rehenes: 2
Arena 4: tanque jefe + refuerzos (2 soldados cada 7000 ms, máx. 4 vivos)
         rehenes: 1  (aparece al caer el tanque a la mitad de la vida)
```

Tanque jefe (arena 4, `x ≈ camX + 560`, 160×90, 40 HP, 8000 puntos):

```
Fase 1 (40..21 HP): patrulla a 60 px/s entre camX+420 y camX+640. Cañón cada 2800 ms: bala
  gruesa (r 8, 300 px/s, daño 2) apuntada al jugador. Torreta de ametralladora cada 1200 ms:
  ráfaga de 2 balas.
Fase 2 (20..1 HP): fase 1 más una salva de 3 proyectiles de mortero cada 4500 ms, y avanza hasta
  camX+300 a 90 px/s. Se pasa por encima saltando (no hace daño de contacto en el techo).
La granada hace +1 de daño al tanque (daño 4 en total) porque entra por la parte superior.
```

Ítems de rehén (`carries`), en orden de reparto determinista por arena: arena 1 `H`, `G`; arena 2
`HP`, `E`, `G`; arena 3 `HP`, `H`; arena 4 `SCORE` (1000). `G` = +5 granadas. `H` = ametralladora
con 120 balas (si ya la llevas, rellena a 120). `E` = escopeta con 24 cartuchos. `HP` = botiquín.
`SCORE` = +1000. Un rehén liberado suelta el ítem en su posición, corre hacia la izquierda y sale
del viewport. El ítem no caduca mientras la arena no se desbloquee.

Comprobación: `npm run build` limpio.

### 2. Motor: lógica por frame

Orden: entrada → jugador → fase del nivel → cámara → enemigos → proyectiles → colisiones →
combo → pickups → efectos → `emit()`. `dt` en segundos, capado a `DT_MAX`.

- **Movimiento, salto, apuntado y plataformas:** igual que la variante 01, incluido el agachado y la
  caída con `↓ + X`.
- **Disparo y granada:** `Space` dispara con el arma activa (mantener = automático). `KeyC`
  lanza una granada si `grenades > 0` y `grenadeCd ≤ 0`; sale de `(px + 14·facing, py − 28)`. La
  granada rebota una vez en el suelo con `vy = −vy·0.4` y `vx·0.5` antes de estallar al terminar
  `fuse`; estalla de inmediato si toca un enemigo. Daño de explosión a todos los enemigos en el radio,
  incluidos los cubiertos tras la caja.
- **Fases del nivel.**
  - `corridor`: scroll libre como en la variante 01 (`camX = max(camX, px − 400)`), con las
    apariciones del corredor. Al llegar `camX` al `lockX` de la siguiente arena pasa a `arena`.
  - `arena`: `camX` queda fijo en `lockX`; el jugador no puede salir del viewport en ningún lado. Se
    ejecutan las oleadas por orden. Al limpiar la última oleada y no quedar enemigos ni proyectiles
    de mortero, pasa a `go`.
  - `go`: aparece el rótulo `¡ADELANTE!` con una flecha parpadeante (cada 400 ms) en el borde
    derecho; la cámara vuelve a poder avanzar y la fase vuelve a `corridor`. Los rehenes que no se
    liberaron se pierden al desbloquear (`gone`).
- **Escudo y muerte.** Un golpe con `invuln = 0`: `shield −= daño`, `invuln = HIT_INVULN_MS`,
  retroceso de 30 px, el personaje parpadea. Con `shield ≤ 0`: `lives −1`, `onLives`, explosión,
  `respawn`. Al reaparecer: `shield = SHIELD_MAX`, el arma vuelve a `PISTOL`, las granadas bajan
  a `min(grenades, 5)`, `invuln = INVULN_MS`. Con `lives = 0`: `state = "gameover"`. Esta variante
  no tiene fosos (suelo continuo), así que `KILL_Y` no se usa.
- **Combo.** Cada baja suma 1 a `combo.count` y reinicia `combo.timer = COMBO_WINDOW`; el
  multiplicador de ese momento multiplica los puntos de la baja. Recibir un golpe pone `count = 0`.
  Si el temporizador llega a 0, `count = 0`. Los puntos de rescate no multiplican.
- **Rehenes.** Un rehén `tied` se libera al tocarlo (`HOSTAGE_TOUCH` 28 px) o por una explosión de
  granada en su radio. Una bala **no** lo libera pero sí lo mata si le da (`gone`, sin ítem):
  el jugador tiene que cuidar la puntería. Al matar a un rehén, el combo se reinicia.
- **Vidas extra.** Cada 30 000 puntos, una vida (máx. `MAX_LIVES`).
- **Fin de la pasada.** Al caer el tanque: 5000 + 1000 por vida restante + 1000 × `rescued`
  (de esa pasada) , `state = "clear"` durante 3000 ms con rótulo `¡MISIÓN CUMPLIDA!`, luego
  `level++`, `onLevel`, arenas y rehenes se reinician (`rescued = 0`), conserva puntos, vidas,
  arma, munición y granadas (granadas mín. 5).

### 3. Motor: bucle, entrada y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`. `onLives(2)` una vez al crear; `onLevel`
  al pasar de nivel.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez, tras 1200 ms de la muerte final.
- `restart()`: detiene el bucle, vacía los pools, `initGame()`, `emit()`, arranca.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `Space`, `KeyX`, `KeyC`. `preventDefault()` solo para esas. `P` y `Escape` no llegan.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window`; `blur` vacía `keys`.
- `destroy()` cancela el frame, quita los listeners y es idempotente. No hay assets que cargar.
- `dt` capado; `lastTime = null` al reanudar. `initGame(); draw();` antes de devolver.
- Rendimiento (SPEC 13): pools fijos y cero asignaciones en `draw()`/`update()`.

### 4. Motor: dibujo

`draw()`: fondo de ciudad en ruinas de dos capas de parallax (0.25× y 0.6×); suelo, plataformas y
cajas con rectángulos; personaje con rectángulos y brazo orientado al `Aim`; soldados con casco
rojo; jeep, helicóptero y tanque con polígonos; granadas como círculos de 5 px con un destello al
estallar (círculo creciente 120 ms); rehenes atados con una cuerda (dos líneas) y un parpadeo
verde; los ítems con su letra; el combo se muestra **cerca de la baja**, no en un HUD: un texto
`×3` que sube 24 px y se desvanece en 600 ms.

Excepción documentada al «sin HUD en el canvas»: el contrato `GameCallbacks` solo conoce puntos,
vidas y nivel, así que el **escudo** (3 pastillas sobre la cabeza del personaje), la **munición del
arma** y las **granadas** (dos contadores pequeños en la esquina inferior izquierda) se dibujan en
el canvas porque son estado de juego que el jugador necesita ver mientras apunta, igual que el
radar de `defensor`. Puntos, nivel y vidas siguen sin dibujarse.

Rótulos permitidos: `PULSA UNA FLECHA` (`waiting`), `¡ADELANTE!` (fase `go`), `¡MISIÓN CUMPLIDA!`
(`clear`).

Comprobación: `npm run build` limpio.

### 5. Registrar la ficha y el mando táctil

`lib/games/registry.ts`:

```ts
"run-gun": {
  create: createRunGunGame, width: 800, height: 600,
  controls: "flechas o WASD para moverte y apuntar, X para saltar, espacio para disparar, C para granada",
  touch: { a: { code: "Space", label: "DISPARO" }, b: { code: "KeyX", label: "SALTO" }, repeat: true },
}
```

`touch` solo admite los botones `a` y `b`, así que **la granada no tiene botón táctil** en esta
spec: en móvil se juega con pistola, ametralladora y escopeta. Para que no sea una pérdida
crítica, los rehenes dan `G` con poca frecuencia y las arenas se pueden completar sin granadas
(excepto la caja de mortero, que se puede rodear saltando y disparando a quemarropa). Ampliar el mando es
una spec aparte para `mobile-porter`.

`lib/games.ts`: ficha `run-gun`, `cat: "SHOOTER"`, `cover: "cover-run-gun"`. `app/globals.css`:
`cover-run-gun` con gradientes CSS.

Comprobación: `/jugar/run-gun` pinta el canvas real; el mando aparece en táctil vertical.

### 6. Leaderboard

`supabase/migrations/<timestamp>_juego_run_gun.sql`, con timestamp posterior a la última migración:

```sql
insert into public.games (id, title) values ('run-gun', 'RUN & GUN');
```

Se aplica con `apply_migration` y se comprueba con `execute_sql`. Los tipos no se regeneran.

Comprobación: `select * from public.games` devuelve seis filas.

### 7. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, medición `?fps=1` en la
arena 3 (helicóptero + soldados + bombas), y el recorrido manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/run-gun` muestra un canvas de 800×600 con personaje, ciudad y plataformas, no la `.game-arena`.
- [ ] Nada se mueve hasta pulsar una tecla de juego.
- [ ] Movimiento, salto (≈114 px), agacharse y apuntado en 8 direcciones se comportan como en el criterio equivalente de la variante 01.
- [ ] El HUD muestra 2 vidas; sobre la cabeza del personaje hay 3 pastillas de escudo, y un disparo enemigo quita una.
- [ ] Tras recibir un golpe, el personaje parpadea 1 s y no recibe daño durante ese tiempo.
- [ ] Con 0 de escudo se pierde una vida, el HUD baja a 1 y el personaje reaparece con 3 de escudo, pistola y ≤ 5 granadas.
- [ ] `C` lanza una granada en parábola que rebota una vez y estalla a los 1500 ms o al tocar un enemigo; no daña al jugador.
- [ ] Con `ArrowUp` pulsada, la granada sale casi vertical y cae sobre el mortero cubierto por la caja.
- [ ] Las balas rectas no dañan al mortero cubierto; la granada sí.
- [ ] La cámara se bloquea al entrar en cada arena y no se puede salir del viewport por ningún lado.
- [ ] Hasta limpiar todas las oleadas de una arena no aparece `¡ADELANTE!`; al limpiar, la cámara vuelve a avanzar.
- [ ] Un rehén se libera al tocarlo (+500), suelta su ítem y corre fuera de la pantalla; una bala lo mata sin dar ítem.
- [ ] El ítem `H` da ametralladora con 120 balas y, al agotarse, el arma vuelve a pistola.
- [ ] Una baja suma `puntos × multiplicador`; tres bajas seguidas dentro de 2 s suben el multiplicador y un golpe recibido lo reinicia.
- [ ] El jeep se detiene en el centro 1500 ms y se puede pasar saltando por encima de su techo sin daño.
- [ ] El helicóptero de la arena 3 solo cae con balas desde la plataforma alta o con granadas; sus bombas estallan en el suelo.
- [ ] El tanque cambia a su segunda fase a 20 HP y las granadas le hacen 4 de daño.
- [ ] Derrotar al tanque muestra `¡MISIÓN CUMPLIDA!`, suma la bonificación (incluye +1000 por rehén liberado), el HUD pasa a nivel 02 y se conservan puntos, vidas y arma.
- [ ] En el nivel 02 los enemigos disparan visiblemente más a menudo.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real, una sola vez.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni ningún overlay de game over; sí dibuja escudo, munición y granadas.
- [ ] `PAUSA` congela todo y `REANUDAR` no desfasa el combo ni los temporizadores; `P` y `Escape` hacen lo mismo.
- [ ] Escribir `W`, `A`, `S`, `D`, `X`, `C` o espacio en el campo de iniciales no mueve ni dispara.
- [ ] Las flechas y el espacio no hacen scroll con el canvas enfocado.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, 2 vidas, pistola y 5 granadas sin recargar.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'run-gun'`, una sola vez por pulsación doble.
- [ ] Esa puntuación aparece en `/salon?juego=run-gun` y en `/juegos/run-gun`; con `scores` vacía se ve el estado vacío.
- [ ] En un viewport táctil vertical se juega entera con cruceta, `DISPARO` y `SALTO` (sin granada).
- [ ] Navegar a `/biblioteca` y volver no duplica el bucle.
- [ ] Con `?fps=1`, la arena 3 no produce frames > 50 ms de forma sostenida.
- [ ] Los otros cinco juegos se juegan igual que antes y `select * from public.games` devuelve seis filas.
- [ ] La consola no muestra errores ni avisos de hidratación en `/jugar/run-gun`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** la misma ficha y el mismo `game-id` `run-gun` que la variante 01; son dos diseños del
  mismo juego y solo uno se promueve.
- **Sí:** barra de 3 de escudo. Perdona el error y hace que una arena larga sea jugable en táctil,
  donde la precisión de la esquiva es peor.
- **Sí:** 2 vidas en vez de 3. La barra ya multiplica la resistencia; con 3 vidas la partida sería demasiado larga.
- **Sí:** arenas bloqueadas. Convierte el juego en control de la zona, cambia el ritmo respecto a
  la carrera de la variante 01 y limita el número de enemigos vivos (clave para el rendimiento).
- **Sí:** granada en parábola con una cobertura que solo ella supera. Da razón de ser a una acción
  que no existe en la variante 01.
- **No:** botón táctil de granada. El contrato `touch` solo tiene `a`/`b` y ampliarlo es otra spec.
- **Sí:** las balas matan a los rehenes. Obliga a apuntar cuando hay rehenes en pantalla, que es el
  riesgo que paga la recompensa.
- **Sí:** el combo se reinicia al recibir un golpe, no solo con el tiempo. Premia la limpieza, no solo la cadencia.
- **Sí:** escudo, munición y granadas dibujados en el canvas como excepción documentada.
- **No:** sonido ni sprites. Los skins los aplica `skin-designer` tras implementarlo.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                     | Mitigación                                                                                                          |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Sin original, las constantes se ajustan «a ojo» durante la implementación.                 | El paso 1 las fija y las declara fuera de alcance.                                                                  |
| Una arena queda sin poder completarse (un enemigo atascado bloquea el avance).             | Cada oleada tiene tope de 30 s; pasado ese tiempo los soldados restantes cargan hacia el jugador. Un enemigo fuera del viewport por más de 5 s se reubica en el borde. |
| El mortero tras la caja es inalcanzable en táctil sin granada.                             | Se puede rodear la caja saltando y disparando de cerca; el mortero tiene 2 HP y su proyectil es lento (esquivable). |
| Demasiados proyectiles en pantalla (bombas, morteros, ametralladora).                      | Pools fijos con topes y arena con cantidad acotada de enemigos vivos; medición con `?fps=1`.                       |
| El jugador mata a un rehén sin querer con la ametralladora o la escopeta de abanico.       | Los rehenes parpadean en verde y nacen siempre en el suelo o en una plataforma, fuera de la línea de aparición de los enemigos; la hitbox del rehén (20×40) es más pequeña que la del soldado, para que un disparo a un enemigo cercano rara vez lo alcance. Se comprueba en la prueba manual. |
| El multiplicador de combo se vuelve exagerado y rompe el ranking.                           | Tope ×5 y reinicio por golpe; el máximo teórico de la pasada se estima en < 150 000 puntos, muy por debajo del tope de 1.000.000 de `scores.score`. |
| La explosión de jeep daña al jugador por sorpresa.                                         | Destello de 300 ms antes de estallar y radio de 80 px, mostrado por un círculo previo.                              |
| Reaparecer en una arena en medio de una oleada y morir en bucle.                           | Reaparición con 2,5 s de invulnerabilidad y 3 de escudo.                                                            |
| `keyup` perdido tras perder el foco: el personaje corre solo.                              | `blur` vacía `keys`; listeners sobre el canvas.                                                                      |
| El tanque es un muro de HP sin variedad.                                                   | Dos fases con ataques distintos y daño extra de granada.                                                            |

---

## Lo que **no** entra en esta spec

- Sonido y música.
- Botón táctil de granada y cualquier ampliación del contrato `touch`.
- Vehículos conducibles, cuchillo, cooperativo y más niveles.
- Sprites y skins.
- La versión mínima de un golpe (variante `01-asalto-selva.md`).
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
