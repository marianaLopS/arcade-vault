# SPEC — RUN & GUN: asalto a la selva

> **Estado:** Propuesta (game jam)
> **Depende de:** SPEC 05, SPEC 06
> **Fecha:** 2026-10-28
> **Objetivo:** Diseñar la lectura clásica y mínima de un run-and-gun de scroll lateral — comando a pie con disparo en 8 direcciones, salto, cápsulas de arma, enemigos a pie y torretas, y un jefe-muro al final de un único nivel largo que se repite más difícil — como ficha nueva `run-gun` en categoría SHOOTER, con motor real y leaderboard en Supabase desde el primer día.

---

## Por qué existe esta spec

El catálogo tiene un solo SHOOTER (`asteroids`, nave en gravedad cero) y cuatro ARCADE/PUZZLE
sin personaje con gravedad. Lo anotó `game-planner` en `game-suggestions-todo.md` al proponer
`contra-run-gun`: **no existe ningún juego en el que un personaje corra, salte y dispare
direccional**. Frogger salta por casillas, Snake y Arkanoid no tienen avatar con física. El
género aporta algo que ningún juego actual tiene: gravedad, plataformas, puntería en 8
direcciones y un scroll lateral que empuja al jugador hacia delante.

Como con Snake (SPEC 10) y con las propuestas `defensor` y `ciempies`, **no hay código de
referencia**: las constantes de este documento **son** el diseño y cambiarlas durante la
implementación es rediseñar, no implementar. Todo se dibuja con primitivas de canvas — sin
spritesheet ni audio, igual que `defensor`.

Esta variante es la lectura **mínima y fiel**: un nivel, una vida = un golpe, tres armas
(fusil, dispersión, ráfaga), cuatro enemigos y un jefe. La segunda variante
(`02-rescate-y-granadas.md`) cambia el modelo de supervivencia (barra de golpes), la
estructura (arenas con la pantalla bloqueada), y añade rehenes, granadas, munición limitada y
combo; esta se queda en el conjunto más pequeño que ya es reconociblemente un run-and-gun.

---

## Alcance

**Dentro:**

- `lib/games/run-gun/engine.ts`: motor nuevo, todo el estado en la clausura de
  `createRunGunGame`, sin assets externos.
- Viewport (canvas) de **800×600**. Nivel de **6400 px** de ancho con cámara que solo avanza a la
  derecha.
- Comando con carrera, salto con altura fija, agacharse (tumbado), apuntado en 8 direcciones y
  caída a través de plataformas de un solo sentido.
- Fusil base infinito y dos armas de cápsula: dispersión (`S`) y ráfaga (`R`).
- Cuatro enemigos: corredor, fusilero, torreta y cápsula voladora; un jefe-muro con dos torretas y
  un núcleo.
- Tres vidas, un golpe mata, reaparición con invulnerabilidad, vida extra cada 20 000 puntos.
- Al derrotar al jefe el nivel se repite con más cadencia enemiga (`level + 1`).
- Nueva ficha `run-gun` en `lib/games.ts` (`SHOOTER`) y clase de portada `cover-run-gun` en
  `app/globals.css`.
- Una línea `run-gun` en `GAME_ENGINES` (`lib/games/registry.ts`), con el campo `touch`.
- Migración `insert into public.games (id, title) values ('run-gun', 'RUN & GUN')` y su
  aplicación.

**Fuera de alcance (para specs futuras o para la variante `02-rescate-y-granadas.md`):**

- Rehenes, granadas, munición limitada, barra de vida, combo, arenas bloqueadas, vehículos.
- Sonido y música.
- Segundo jugador, selección de personaje, cooperativo.
- Niveles distintos entre sí (la repetición reutiliza el mismo mapa).
- Scroll vertical, escaleras, agua, enemigos voladores con trayectorias complejas.
- Sprites: el arte son rectángulos y polígonos de canvas.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

---

## Modelo de datos

**No se crea ninguna tabla, ni columna, ni tipo de plataforma nuevo.** `scores` y `game_stats`
sirven a este juego sin tocarlas, y el leaderboard se enciende con una fila en `games`.

Tipos locales del motor, sin exportar:

```ts
type Aim = "r" | "ur" | "u" | "ul" | "l" | "dl" | "d" | "dr"; // 8 direcciones
type Weapon = "rifle" | "spread" | "rapid";
type Platform = { x1: number; x2: number; y: number }; // y = superficie; un solo sentido
type Enemy = { kind: "runner" | "rifleman" | "turret" | "flyer"; x; y; w; h; hp; t; cap?: "S" | "R" | "1UP" };
type Bullet = { x; y; vx; vy; alive: boolean }; // de jugador o de enemigo, pools aparte
type Pickup = { x; y; vy; kind: "S" | "R" | "1UP"; alive: boolean };
```

Estado en la clausura de `createRunGunGame`:

- `px, py, vx, vy` del jugador (`py` = pies), `facing: 1 | -1`, `grounded`, `prone`, `coyote` (ms),
  `aim: Aim`, `weapon: Weapon`, `fireCd` (ms), `invuln` (ms), `respawn` (ms, > 0 = muerto).
- `camX`, `lockX | null` (cámara bloqueada por el jefe).
- Pools de tamaño fijo: `pBullets[24]`, `eBullets[32]`, `enemies[24]`, `pickups[4]`, `sparks[48]`.
- `spawnIdx` (siguiente entrada de `SPAWNS`), `boss` (`{ hpL, hpR, hpCore, phase, t }`).
- `score`, `lives`, `level`, `nextExtra` (siguiente umbral de vida extra).
- `waiting` (true hasta la primera tecla de juego), `state: "playing" | "clear" | "gameover"`,
  `clearT` (ms de la pausa de nivel superado).
- Bucle: `rafId`, `lastTime`, `destroyed`. Teclas: `keys: Set<string>` y `jumpHeld`.

---

## Plan de implementación

### 1. Constantes de diseño

`lib/games/run-gun/engine.ts`. Las magnitudes están en px, px/s y ms.

```
W 800 · H 600 · LEVEL_W 6400 · GROUND_Y 520 · KILL_Y 660
GRAVITY 1800 · RUN_SPEED 180 · JUMP_V 640  (apogeo ≈ 114 px, aire ≈ 710 ms)
COYOTE_MS 80 · JUMP_BUFFER_MS 100 · FALL_MAX 900
PLAYER_W 20 · PLAYER_H 44 · PRONE_W 40 · PRONE_H 18 · AIRBORNE_H 24
CAM_FOLLOW_X 400 (la cámara avanza cuando el jugador pasa de camX + 400) · CAM_MARGIN 8
BULLET_SPEED 620 · BULLET_LIFE_PX 560 · MAX_P_BULLETS 24
RIFLE   cd 200 ms · 1 bala · daño 1
SPREAD  cd 260 ms · 5 balas a 0°, ±12°, ±24° · daño 1 · alcance 420 px
RAPID   cd 110 ms · 1 bala con ±3° de dispersión determinista (ciclo de 3) · daño 1
E_BULLET_SPEED 260 · E_BULLET_R 4 · MAX_E_BULLETS 32
RESPAWN_MS 1200 · INVULN_MS 2000 · START_LIVES 3 · MAX_LIVES 9
EXTRA_LIFE_EVERY 20000 · DT_MAX 50 ms (en segundos: 0.05)
```

Plataformas de un solo sentido (`{x1, x2, y}`), más el suelo en `GROUND_Y`:

```
P1 600–800 y400 · P2 1700–1900 y400 · P3 2200–2400 y360 · P4 2450–2650 y440
P5 3300–3500 y400 · P6 3600–3800 y330 · P7 4400–4600 y400 · P8 4700–4900 y340
P9 5200–5400 y400
Segmentos de suelo: [0,1400] [1490,2800] [2900,4200] [4300,6400]
Fosos: [1400,1490] [2800,2900] [4200,4300]  (≤ 100 px; el salto máximo cubre ≈ 128 px)
```

**Cualquier cambio de estos números es un cambio de diseño y no entra en esta spec.**

Enemigos (hitbox `w×h`, `hp`, puntos):

| Enemigo   | Hitbox | HP | Puntos | Comportamiento                                                                                                                                  |
| --------- | ------ | -- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| corredor  | 20×44  | 1  | 100    | Nace en el borde derecho de la pantalla y corre hacia el jugador a 110 px/s. Cae a los fosos (muere sin puntos). Su contacto mata al jugador.   |
| fusilero  | 20×44  | 1  | 200    | Quieto sobre su plataforma o suelo. Cada 1800 ms dispara una bala hacia el jugador, ajustada al `Aim` de 8 direcciones más cercano. No dispara si el jugador está a más de 560 px. |
| torreta   | 40×40  | 4  | 300    | Fija sobre el suelo. Ráfaga de 3 balas separadas 140 ms cada 2400 ms, apuntadas al jugador con la misma regla de 8 direcciones.                  |
| voladora  | 36×20  | 1  | 150    | Cruza de derecha a izquierda a 150 px/s con `y = 160 + 40·sin(t·2.4)`. Al morir suelta su cápsula (`S`, `R` o `1UP`) que cae con la gravedad.   |

Nivel `L` (1 = primera pasada): intervalos de disparo de enemigos × `max(0.5, 1 − 0.1·(L−1))` y
velocidad de bala enemiga × `min(1.5, 1 + 0.1·(L−1))`. La cantidad y posición de enemigos no
cambia.

Tabla de aparición. Una entrada nace cuando `camX + 800 + 40 ≥ x`. Las entradas con varias
unidades las separan 50 px (corredores) hacia la derecha.

```
x     tipo        notas
700   fusilero    sobre P1
900   corredor
1000  corredor
1100  voladora    cápsula S
1250  corredor ×2
1600  fusilero    suelo
1800  fusilero    sobre P2
2000  torreta
2100  voladora    cápsula R
2300  corredor ×3
2500  fusilero    sobre P4
2600  fusilero    suelo
3000  torreta
3100  corredor ×2
3300  fusilero    sobre P5
3450  voladora    cápsula S
3700  fusilero    sobre P6
3800  corredor ×3
3900  torreta
4400  fusilero    sobre P7
4600  corredor ×3
4750  fusilero    sobre P8
4800  voladora    cápsula 1UP
5000  torreta ×2  en x 5000 y 5100
5300  corredor ×4
5400  fusilero    sobre P9
```

Jefe-muro (cámara bloqueada con `camX = 5600` cuando el jugador cruza `x = 5900`):

```
Muro x 6200–6320, y 220–520
Torreta alta (6240, 300) HP 6 · torreta baja (6240, 440) HP 6 · puntos 500 cada una
Núcleo (6260, 380) 36×36 HP 30 · inmune hasta destruir las dos torretas · puntos 5000
Torretas: abanico de 3 balas (−20°, 0°, +20° hacia la izquierda) cada 1600 ms
Núcleo: abanico de 5 balas (0°, ±15°, ±30°) cada 2000 ms
Refuerzos: un corredor desde el borde izquierdo cada 6000 ms, máx. 3 vivos
```

Comprobación: `npm run build` limpio.

### 2. Motor: lógica por frame

Con `dt` en segundos, capado a `DT_MAX`. Orden por frame: entrada → jugador → cámara →
apariciones → enemigos → balas → colisiones → pickups → efectos → `emit()`.

- **Entrada.** `ArrowLeft/KeyA` y `ArrowRight/KeyD` mueven; `ArrowUp/KeyW` apunta arriba;
  `ArrowDown/KeyS` agacha (en suelo) o apunta abajo (en aire); `Space` dispara (mantener =
  automático); `KeyX` salta. Mientras `waiting`, el primer evento de teclas de juego lo pone en marcha.
- **Apuntado.** Se recalcula cada frame desde las teclas: horizontal + arriba = `ur/ul`;
  arriba solo = `u`; en aire, abajo + horizontal = `dr/dl`; abajo solo en aire = `d`; en suelo,
  abajo = tumbado y `aim = facing`; sin teclas = `facing`. Arriba solo inmoviliza al jugador en suelo.
- **Movimiento.** `vx = ±RUN_SPEED` o 0 (sin aceleración). Tumbado no se mueve. En aire hay control
  horizontal completo. `vy += GRAVITY·dt`, capado a `FALL_MAX`. Un salto exige `grounded` o
  `coyote > 0`, y consume `jump buffer` si se pulsó hasta 100 ms antes de aterrizar. El salto es de
  altura fija: soltar `KeyX` no lo recorta.
- **Suelo y plataformas.** Se aterriza en una plataforma o suelo si `vy ≥ 0` y los pies pasaban por
  encima de la superficie en el frame anterior. `KeyX` con `ArrowDown` pulsado estando tumbado sobre una plataforma
  la atraviesa: se ignora esa plataforma hasta que los pies estén 4 px por debajo de ella.
- **Hitbox.** De pie `20×44`; tumbado `40×18`; en el aire por salto `20×24` centrada (voltereta).
- **Fosos.** `py > KILL_Y` es una muerte.
- **Cámara.** `camX` solo aumenta: `camX = max(camX, px − CAM_FOLLOW_X)`, tope `LEVEL_W − W` y
  `lockX` si el jefe está activo. El jugador no puede pasar de `camX + CAM_MARGIN` hacia atrás.
- **Disparo.** Con `fireCd ≤ 0` y `Space` pulsado, se crean las balas del arma en el pool de jugador
  (si el pool está lleno, el disparo se descarta). Salen de la boca del arma: `(px ± 14, py − 30)`
  de pie, `(px ± 22, py − 9)` tumbado. Las balas mueren al salir del viewport o al recorrer
  `BULLET_LIFE_PX` (`420` en dispersión).
- **Colisión de balas.** Barrido de segmento del último paso contra el AABB del enemigo; con
  `DT_MAX` una bala recorre ≤ 31 px por frame, menos que el enemigo más estrecho (20 px), pero se
  barre igualmente para que no haya túnel al bajar el framerate.
- **Muerte.** Una bala enemiga, contacto con corredor/torreta/jefe, o caída en foso con `invuln = 0`:
  `lives −1`, `onLives`, `weapon = "rifle"`, partículas, `respawn = RESPAWN_MS`. Si `lives = 0`:
  `state = "gameover"`. Mientras `invuln > 0` el jugador parpadea y es inmune a balas y contacto
  pero **no** a los fosos (la caída resta vida igual).
- **Reaparición.** Al terminar `respawn`, el jugador cae desde `y = −40` en la primera columna de suelo
  de `x ≥ camX + 80` que tenga suelo, con `invuln = INVULN_MS`.
- **Cápsulas.** Al caer la voladora suelta un pickup con gravedad que se queda en el suelo. Se recoge
  al tocarlo: `S`/`R` cambia el arma, `1UP` suma una vida (máx. `MAX_LIVES`). Se pierde si sale de
  la pantalla por la izquierda.
- **Puntos y vidas extra.** Suma al matar y `nextExtra` sube de `20000` en `20000`; cada umbral da
  una vida (una sola por cruce).
- **Jefe.** Al activarse el bloqueo se detienen las apariciones normales y arranca el combate. Al
  destruir el núcleo: 3000 + 1000 por vida restante, `state = "clear"` durante `clearT = 2500` ms
  (balas enemigas eliminadas, jugador invulnerable), luego `level++`, `onLevel`, y se
  reinicia el mapa: `camX = 0`, `spawnIdx = 0`, `boss` recreado, el jugador conserva puntos, vidas y arma.

### 3. Motor: bucle, entrada y avisos

- `emit()` con `lastScore` / `lastLives` / `lastLevel`, solo cuando el valor cambia. `onLives(3)`
  una vez al crear.
- Game over: `stopLoop()` y `onGameOver(score)` una sola vez, **tras** mostrar 1200 ms de la
  muerte final. `resume()` es no-op después.
- `restart()`: detiene el bucle, vacía los pools, `initGame()`, `emit()`, arranca.
- `dt` capado a `DT_MAX`; `lastTime = null` al reanudar.
- `GAME_KEYS`: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `KeyW`, `KeyA`, `KeyS`, `KeyD`,
  `Space`, `KeyX`. `preventDefault()` solo para esas. `P` y `Escape` no llegan.
- Listeners `keydown` / `keyup` / `blur` sobre el canvas, nunca sobre `window`. `blur` vacía `keys`
  (si no, un personaje que corre solo al perder el foco).
- `destroy()` cancela el frame, quita los listeners y es idempotente. No hay assets que cargar.
- `initGame(); draw();` antes de devolver.
- Rendimiento (SPEC 13): pools de tamaño fijo reutilizados, ninguna asignación de arrays, objetos
  ni clausuras dentro de `draw()` ni de `update()`; los textos del canvas son literales.

### 4. Motor: dibujo

`draw()`: cielo de dos tonos; tres capas de parallax (montañas a 0.2×, árboles lejanos a 0.5×,
troncos cercanos a 0.8× el desplazamiento de `camX`) hechas con rectángulos y triángulos fijos;
suelo y plataformas con rectángulos; personaje con rectángulos (cuerpo, cabeza, brazo-arma con la
orientación del `Aim`); enemigos con silueta distinta por tipo; balas del jugador amarillas, las
enemigas rojas, cada una con un cuadrado de 6×6; cápsulas con la letra dentro; el jefe-muro con el
núcleo que pulsa al quedar expuesto. El jugador parpadea (alterna cada 80 ms) mientras `invuln > 0`.
Sin puntuación, nivel, vidas ni overlays en el canvas. Se permiten los rótulos de estado propio del
juego: `PULSA UNA FLECHA` mientras `waiting` y `ZONA DESPEJADA` durante `clear`.

Comprobación: `npm run build` limpio.

### 5. Registrar la ficha y el mando táctil

`lib/games/registry.ts`:

```ts
"run-gun": {
  create: createRunGunGame, width: 800, height: 600,
  controls: "flechas o WASD para moverte y apuntar, X para saltar, espacio para disparar",
  touch: { a: { code: "Space", label: "DISPARO" }, b: { code: "KeyX", label: "SALTO" }, repeat: true },
}
```

La cruceta del `TouchPad` ya emite las cuatro flechas, así que el apuntado en 8 direcciones sale de
combinar dos direcciones a la vez; el `TouchPad` ya admite pulsar dos botones. `repeat` mantiene
`Space` pulsada para el disparo automático.

`lib/games.ts`: ficha `{ id: "run-gun", title: "RUN & GUN", cat: "SHOOTER", cover: "cover-run-gun", color: "red" }`
con `short`, `long`, `best` y `plays` escritos al implementar. `app/globals.css`: clase
`cover-run-gun` con la misma técnica que las portadas existentes (gradientes CSS, sin imagen).

Comprobación: `/jugar/run-gun` pinta el canvas real; el mando táctil aparece en un viewport táctil vertical.

### 6. Leaderboard

`supabase/migrations/<timestamp>_juego_run_gun.sql`, con timestamp posterior a la última
migración existente:

```sql
insert into public.games (id, title) values ('run-gun', 'RUN & GUN');
```

Se aplica con `apply_migration` del MCP y se comprueba con `execute_sql`. **Los tipos no se
regeneran**: insertar una fila no cambia el esquema.

Comprobación: `select * from public.games` devuelve seis filas.

### 7. Repaso final

`npm run lint` y `npm run build` limpios, `get_advisors` sin avisos nuevos, medición `?fps=1`
con la escena más cargada (jefe con 3 corredores y todas las balas vivas) sin frames > 50 ms, y el
recorrido manual de los criterios de aceptación.

---

## Criterios de aceptación

- [ ] `npm run build` termina sin errores y `npm run lint` no reporta nada.
- [ ] `/jugar/run-gun` muestra un canvas de 800×600 con el personaje, suelo y fondo, no la `.game-arena`.
- [ ] El personaje no se mueve ni avanzan los enemigos hasta pulsar una tecla de juego.
- [ ] Flechas y WASD mueven a 180 px/s; `X` salta unos 114 px de altura y el salto no se recorta al soltar.
- [ ] Un salto pulsado 100 ms antes de aterrizar se ejecuta y se puede saltar hasta 80 ms después de dejar el borde.
- [ ] Los tres fosos se cruzan saltando desde el borde; caer en uno quita una vida.
- [ ] Arriba apunta recto, arriba + lado apunta en diagonal y, en el aire, abajo + lado apunta en diagonal hacia abajo.
- [ ] Abajo en suelo tumba al personaje (hitbox de 18 px de alto) y las balas enemigas altas pasan por encima.
- [ ] Abajo + `X` sobre una plataforma de un solo sentido la atraviesa; saltar desde debajo no la bloquea.
- [ ] Mantener `Space` dispara en automático con la cadencia del arma (≈5/s fusil, ≈9/s ráfaga).
- [ ] La cápsula `S` dispara 5 balas en abanico y `R` sube la cadencia; morir devuelve el fusil.
- [ ] El corredor muere de un tiro (+100), la torreta de cuatro (+300), el fusilero (+200).
- [ ] El HUD muestra 3 vidas, pierde una al morir y el personaje reaparece a los 1200 ms parpadeando durante 2 s.
- [ ] Durante la invulnerabilidad una bala o un corredor no matan, pero un foso sí.
- [ ] La cámara solo avanza a la derecha y el personaje no puede retroceder fuera de la pantalla.
- [ ] Una cápsula `1UP` suma una vida y cruzar 20 000 puntos suma otra, una sola vez por umbral.
- [ ] El núcleo del jefe no recibe daño hasta destruir las dos torretas.
- [ ] Derrotar al jefe da la bonificación, muestra `ZONA DESPEJADA` y el HUD pasa a nivel 02 con puntos, vidas y arma conservados.
- [ ] En el nivel 02 los enemigos disparan visiblemente más a menudo.
- [ ] Perder la última vida abre el modal `FIN DEL JUEGO` con la puntuación real, una sola vez.
- [ ] El canvas no dibuja puntos, nivel ni vidas, ni ningún overlay de game over.
- [ ] `PAUSA` congela todo (también las partículas) y `REANUDAR` no hace saltar al personaje; `P` y `Escape` hacen lo mismo.
- [ ] Soltar el foco con una flecha pulsada no deja al personaje corriendo solo.
- [ ] Con el canvas enfocado, las flechas y el espacio no hacen scroll de la página.
- [ ] Escribir `W`, `A`, `S`, `D`, `X` o espacio en el campo de iniciales no mueve ni dispara.
- [ ] `JUGAR DE NUEVO` reinicia a nivel 1, 0 puntos, 3 vidas y fusil sin recargar la página.
- [ ] `GUARDAR PUNTUACIÓN` inserta una fila en `scores` con `game_id = 'run-gun'`, y dos pulsaciones seguidas no insertan dos.
- [ ] Esa puntuación aparece en `/salon?juego=run-gun` y en `/juegos/run-gun`; con `scores` vacía se ve el estado vacío.
- [ ] En un viewport táctil vertical aparecen cruceta, `DISPARO` y `SALTO`, y se puede jugar sin teclado.
- [ ] Navegar a `/biblioteca` y volver no duplica el bucle; dejar la pestaña en segundo plano no teletransporta al personaje.
- [ ] Con `?fps=1`, la escena del jefe no produce frames > 50 ms de forma sostenida.
- [ ] Los otros cinco juegos se juegan igual que antes.
- [ ] `select * from public.games` devuelve exactamente seis filas.
- [ ] La consola del navegador no muestra errores ni avisos de hidratación en `/jugar/run-gun`.
- [ ] `get_advisors` no reporta avisos de seguridad nuevos.

---

## Decisiones

- **Sí:** id `run-gun`, título `RUN & GUN`. Es la entrada `contra-run-gun` de `game-planner`
  sin la marca; el id es corto y el título descriptivo del género.
- **Sí:** un golpe mata. Es lo que hace que cada bala enemiga importe y que el apuntado y el
  agachado sean decisiones reales.
- **No:** barra de vida en esta variante; vive en la variante 02.
- **Sí:** salto de altura fija. Hace el recorrido de fosos y plataformas determinista y evita
  una lectura de «mantén para saltar más» que complica el mando táctil.
- **Sí:** coyote time y buffer de salto. En táctil la imprecisión de los toques lo exige.
- **Sí:** cámara que solo avanza. Define el ritmo del nivel y evita tener que reaparecer a un
  enemigo que ya se dejó atrás.
- **Sí:** el arma se pierde al morir. Es la penalización que da valor a las cápsulas.
- **Sí:** el nivel se repite con enemigos más rápidos en vez de añadir un segundo mapa. Da sentido
  al HUD de nivel sin multiplicar el diseño.
- **Sí:** el apuntado a 8 direcciones sale solo de las flechas, sin botón de bloqueo de dirección,
  para que la cruceta táctil baste.
- **No:** sonido ni sprites. Es una propuesta de diseño; los skins los aplica `skin-designer` tras
  implementarla.
- **No:** sembrar puntuaciones en `scores`.

---

## Riesgos

| Riesgo                                                                                       | Mitigación                                                                                                |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Sin original, las constantes se ajustan «a ojo» durante la implementación.                   | El paso 1 las fija y las declara fuera de alcance.                                                        |
| En táctil, apuntar diagonal + saltar + disparar exige tres pulsaciones a la vez.             | Disparo automático con `repeat`; el apuntado no necesita botón extra; salto de altura fija.               |
| Tunneling de balas con un framerate bajo.                                                    | `dt` capado y barrido de segmento contra el AABB; la bala no recorre más de 31 px por frame.              |
| Reaparecer sobre un foso o un enemigo y morir en bucle.                                      | Reaparición en la primera columna con suelo ≥ `camX + 80`, con 2 s de invulnerabilidad.                    |
| Las plataformas de un solo sentido «atrapan» al saltar desde debajo o al caer por ellas.     | Solo se aterriza si los pies estaban por encima en el frame anterior; caída con `↓ + X` ignora la plataforma. |
| Un personaje corriendo solo tras perder el foco (`keyup` perdido).                           | `blur` vacía el conjunto de teclas; `keyup` y `blur` sobre el canvas.                                      |
| Muchas balas y partículas generan basura y tirones en el jefe.                               | Pools de tamaño fijo y ninguna asignación en `draw()`/`update()`; se mide con `?fps=1`.                    |
| La repetición del mapa se vuelve monótona.                                                   | Es una propuesta mínima; la variedad real es la variante 02 o una spec posterior de niveles.              |
| El jefe-muro se puede «cheesear» agachado en una esquina.                                    | Las balas de las torretas bajas y el abanico del núcleo cubren el suelo; los refuerzos obligan a moverse. |

---

## Lo que **no** entra en esta spec

- Rehenes, granadas, munición, barra de vida y combo (variante `02-rescate-y-granadas.md`).
- Sonido y música.
- Segundo jugador o modo cooperativo.
- Más niveles, escaleras, agua, scroll vertical o vehículos.
- Sprites y skins.
- Autenticación, `scores.user_id` y la fila `▸ TU MEJOR MARCA` real.

Cada una de ellas, si entra, va en su propia spec.
