# SPEC 03 — Niveles y sonidos

> **Estado:** Aprobado
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-08-23
> **Objetivo:** Convertir la partida de un solo tablero en una progresión de tres niveles con layouts propios, pala decreciente y bloques resistentes, y dar respuesta sonora al rebote y a la rotura de bloques.

## Por qué existe este spec

El SPEC 01 dejó un único tablero fijo generado por código y aplazó explícitamente los niveles ("se hará cuando existan varios niveles") y los sonidos, pese a estar los dos `.mp3` en `assets/sounds/`. El SPEC 02 añadió la respuesta visual al romper un bloque, pero el juego sigue siendo mudo y se acaba en cuanto limpias los 60 bloques.

Este spec cierra las dos cosas a la vez: la progresión (tres layouts diseñados a mano, con dificultad creciente) y el audio (rebote y rotura). Además introduce el primer bloque con **estado interno** (`hits`), que hasta ahora no existía: todos los bloques morían de un golpe.

## Alcance

**Dentro:**

- **Niveles como layouts de texto.** Constante `LEVELS`: array de tres niveles, cada uno un array de strings donde cada carácter es un bloque o un hueco.
- **Rejilla variable por nivel.** `BLOCK_W` y `BLOCK_H` dejan de ser constantes y se derivan del layout: el ancho se reparte entre las columnas del nivel y el alto entre sus filas, dentro de una zona de rejilla fija.
- **Estado `level`** (0..2) y estado de pantalla nuevo `'nivel'`, con overlay «NIVEL N» y continuación con `Space`.
- **Pala decreciente por nivel:** 96 → 84 → 72 px. El ancho es un dato derivado del nivel, no un estado acumulable.
- **Bloques resistentes grises:** aguantan 2 golpes. Al primero cambian a un color aleatorio de `ROW_COLORS` y no dan puntos; al segundo se rompen y suman 20 puntos.
- **Puntuación acumulada** a lo largo de los tres niveles; **vidas repuestas a 3** al empezar cada nivel.
- **HUD con «NIVEL N/3»** junto a la puntuación.
- **Sonidos:** `ball-bounce.mp3` al rebotar en la pala, en los tres muros y al golpear un bloque resistente sin romperlo; `break-sound.mp3` al destruir un bloque.
- **Pool de instancias `Audio`** por sonido, para que dos disparos seguidos no se corten entre sí.
- **Tecla `M`** para silenciar/reactivar, con indicador en el HUD. No se persiste.
- La victoria pasa a exigir haber limpiado el **tercer** nivel.

**Fuera de alcance (para specs futuros):**

- Más de tres niveles, generación procedural o editor de niveles.
- Cambios en la física de la bola: la velocidad sigue siendo constante en todos los niveles (decisión del SPEC 01, no se revoca).
- Bloques indestructibles, bloques de 3+ golpes, bloques que se mueven.
- Sonidos de perder vida, de cambio de nivel, de victoria o de game over, y música de fondo: no hay assets para ello y se decidió usar solo los dos `.mp3` existentes.
- Control de volumen por el usuario (más allá de silenciar), mezclador o ajustes.
- Persistencia de nada: ni récords, ni nivel alcanzado, ni preferencia de silencio.
- Power-ups, rebote angular en la pala, pausa.

## Modelo de datos

Todo en el scope global de `game.js`, sin módulos.

### Layouts

```js
// Cada carácter es un bloque; '.' es un hueco.
// Los caracteres de color coinciden con las claves de SPRITES.blocks y de
// EXPLOSION_FRAMES: ese acoplamiento es el que ya documenta CLAUDE.md.
const BLOCK_CHARS = {
  R: 'red', Y: 'yellow', G: 'green',
  C: 'cyan', M: 'magenta', P: 'hotpink',
  X: 'gray',                       // resistente: 2 golpes
};

const LEVELS = [
  // Nivel 1 — la rejilla llena del SPEC 01, sin grises: la entrada al juego no cambia
  [
    'RRRRRRRRRR',
    'YYYYYYYYYY',
    'GGGGGGGGGG',
    'CCCCCCCCCC',
    'MMMMMMMMMM',
    'PPPPPPPPPP',
  ],
  // Nivel 2 — aparecen los grises y algún hueco
  [
    '..XXXXXX..',
    '.RRRRRRRR.',
    'YYYYYYYYYY',
    '.GGGGGGGG.',
    '..CCCCCC..',
    '...XXXX...',
  ],
  // Nivel 3 — más columnas (bloques más estrechos) y más grises
  [
    'X.RRRRRRRR.X',
    'X.YYYYYYYY.X',
    '..XXXXXXXX..',
    'M..GGGGGG..M',
    'MM..CCCC..MM',
    'XXX......XXX',
  ],
];

const PADDLE_WIDTHS = [96, 84, 72];   // un ancho de pala por nivel
```

Reglas del formato: máximo 6 filas por nivel; todas las filas de un mismo nivel deben tener la misma longitud. Un nivel debe contener al menos un bloque.

### Zona de rejilla y tamaño de bloque

`BLOCK_W`, `BLOCK_H`, `COLS` y `ROWS` desaparecen como constantes de mundo y pasan a derivarse del layout:

```js
// Zona que ocupa la rejilla, la misma que ocupaba en el SPEC 01
const GRID_X = 80, GRID_Y = 70;
const GRID_W = 640, GRID_H = 144;

// Por nivel:
const blockW = GRID_W / columnasDelLayout;
const blockH = GRID_H / filasDelLayout;
```

Con el nivel 1 (10×6) esto da exactamente 64×24: la rejilla se ve idéntica a la de hoy. El nivel 3 (12 columnas) da bloques de 53,33 px de ancho. La rejilla siempre encaja en la misma zona, sin recalcular márgenes.

### Entidades

```js
// El bloque gana estado interno: es la primera entidad del juego con vida > 1
block = { x, y, w, h, color, hits, points, dead:false }
//   hits   -> golpes restantes. 1 en los normales, 2 en los grises
//   points -> puntos al romperse. POINTS_PER_BLOCK (10) o POINTS_RESISTENTE (20)
//   color  -> muta al recibir el primer golpe si era 'gray'
```

`paddle.w` deja de ser constante: se asigna al cargar cada nivel desde `PADDLE_WIDTHS[level]`.

### Audio

```js
const SOUND_POOL = 4;             // instancias por sonido: cortes solo con >4 solapadas
const SOUND_VOLUME = 0.5;         // fijo en código, sin control de usuario

// sonidos.bounce / sonidos.break -> { pool:[Audio,…], i:0 }
let muted = false;                // tecla M; no se persiste
```

### Estado global

```js
let level = 0;                    // índice en LEVELS, 0..LEVELS.length-1
let screen = 'inicio';            // 'inicio' | 'jugando' | 'nivel' | 'victoria' | 'gameover'
```

`score` sigue acumulando entre niveles; `lives` vuelve a `LIVES_START` al cargar cada nivel.

## Plan de implementación

Cada paso deja el juego jugable.

1. **Zona de rejilla.** Sustituir `BLOCK_W`/`BLOCK_H`/`COLS`/`ROWS` por `GRID_W`/`GRID_H`, y hacer que `crearBloque(x, y, w, h, color, hits, points)` reciba tamaño y estado. `crearBloques(layout)` recorre el layout, calcula `blockW`/`blockH` y crea un bloque por carácter distinto de `'.'`. Añadir `LEVELS` con **solo el nivel 1** por ahora. *Prueba manual:* el juego se ve y se juega exactamente igual que antes; la rejilla sigue siendo 10×6 de 64×24.
2. **Bloques resistentes.** En `colisionarBloques()`, sustituir `b.dead = true` por: `b.hits--`; si queda vida, `b.color = ROW_COLORS[aleatorio]` y no se suma puntuación ni se crea explosión; si llega a 0, `b.dead = true`, `score += b.points` y explosión como hoy. El rebote (inversión del eje de menor solape) ocurre en los dos casos. *Prueba manual:* añadiendo temporalmente una `X` al layout del nivel 1, ese bloque cambia de color al primer impacto y revienta al segundo, sumando 20.
3. **Estado `level` y carga de nivel.** Añadir `let level = 0` y `cargarNivel(i)`: fija `level = i`, `blocks = crearBloques(LEVELS[i])`, `explosions = []`, `lives = LIVES_START`, `paddle.w = PADDLE_WIDTHS[i]` (reclampando `paddle.x`) y `ball.reset()`. `reiniciar()` pasa a ser `score = 0; cargarNivel(0)`. Arrancar el juego con `cargarNivel(0)` dentro del callback de `loadSpritesheet`. *Prueba manual:* el juego arranca y reinicia igual que antes.
4. **Niveles 2 y 3.** Añadir sus layouts a `LEVELS`. *Prueba manual:* forzando `cargarNivel(1)` y `cargarNivel(2)` desde la consola se ven las dos rejillas completas, centradas en la misma zona y sin deformar los sprites; la pala se estrecha.
5. **Transición entre niveles.** En `update()`, al vaciarse `blocks` y `explosions`: si `level < LEVELS.length - 1`, `cargarNivel(level + 1)` y `screen = 'nivel'`; si no, `screen = 'victoria'`. En la rama de overlay, `Space` desde `'nivel'` solo pone `screen = 'jugando'` (**no** llama a `reiniciar()`). Añadir la entrada `nivel` a `OVERLAYS` con el número de nivel. *Prueba manual:* limpiar el nivel 1 muestra «NIVEL 2», `Space` lo empieza con la puntuación conservada y 3 vidas; limpiar el 3 lleva a victoria.
6. **HUD.** Añadir «NIVEL N/3» en `drawHUD()` junto a la puntuación. *Prueba manual:* el indicador coincide con el nivel que se está jugando y no se solapa con las vidas.
7. **Sistema de audio.** Bloque nuevo tras Input: `crearSonido(ruta)` construye el pool de `SOUND_POOL` instancias con `volume = SOUND_VOLUME`, y `play(nombre)` rota el índice, hace `currentTime = 0` y llama a `.play()` ignorando el rechazo de la promesa. Si `muted`, `play()` no hace nada. *Prueba manual:* llamando a `play('bounce')` desde la consola se oye el sonido y varias llamadas seguidas no se cortan.
8. **Enganchar los sonidos.** `play('bounce')` en los tres rebotes de muro, en el rebote de pala y en el golpe a un bloque resistente que no se rompe; `play('break')` al marcar un bloque como `dead`. *Prueba manual:* cada evento suena una sola vez y el sonido correcto.
9. **Silencio con `M`.** `if (pressed('KeyM')) muted = !muted;` al principio de `update()`, fuera del bloque de `'jugando'` para que funcione también con overlay. Indicador en el HUD (p. ej. «🔇» o «SIN SONIDO»). *Prueba manual:* `M` calla el juego al instante, vuelve a activarlo, y el indicador refleja el estado.

## Criterios de aceptación

- [ ] El nivel 1 es idéntico al tablero del SPEC 01: 60 bloques de 64×24 en la misma posición.
- [ ] Limpiar un nivel muestra el overlay «NIVEL N» y el juego no avanza hasta pulsar `Space`.
- [ ] Al empezar el nivel 2 y el 3, la puntuación acumulada se conserva y las vidas vuelven a 3.
- [ ] La pala mide 96 px en el nivel 1, 84 en el 2 y 72 en el 3, y perder una vida no cambia su ancho.
- [ ] Al limpiar el nivel 3 aparece el overlay de victoria, no otro cartel de nivel.
- [ ] `Space` desde victoria o game over reinicia en el nivel 1 con 0 puntos, 3 vidas y pala de 96.
- [ ] Un bloque gris no se rompe al primer impacto: cambia a un color de `ROW_COLORS`, la bola rebota y no se suma puntuación.
- [ ] Ese mismo bloque se rompe al segundo impacto, suma 20 puntos y explota con los frames del color que tuviera en ese momento.
- [ ] Un bloque normal sigue rompiéndose de un golpe y sumando 10 puntos.
- [ ] El nivel 3 tiene 12 columnas y sus bloques encajan dentro de la misma zona de rejilla que el resto, sin salirse ni dejar la fila descentrada.
- [ ] El HUD muestra «NIVEL N/3» y coincide con el nivel en curso.
- [ ] Rebotar en la pala o en cualquiera de los tres muros reproduce `ball-bounce.mp3`.
- [ ] Romper un bloque reproduce `break-sound.mp3`.
- [ ] Golpear un bloque resistente sin romperlo reproduce `ball-bounce.mp3`, no `break-sound.mp3`.
- [ ] Romper cuatro bloques en rápida sucesión suena cuatro veces, sin que el sonido se corte a sí mismo.
- [ ] `M` silencia y reactiva el audio, y funciona también con un overlay en pantalla.
- [ ] El HUD indica cuándo el juego está silenciado.
- [ ] Recargar la página arranca con el sonido activo.
- [ ] No hay errores en consola en ningún punto, incluida la primera reproducción antes de cualquier interacción.

## Decisiones

- **Sí:** niveles y sonidos en un mismo spec. Decisión del usuario tras proponerle separarlos; se implementan en pasos independientes (1–6 niveles, 7–9 sonidos) para que cada mitad se pueda verificar por su cuenta.
- **Sí:** layouts como arrays de strings. Es lo que ya anticipaba el SPEC 01. Se lee de un vistazo, permite huecos y formas, y añadir un nivel es añadir un array.
- **No:** niveles generados por parámetros o cargados desde un JSON externo. Lo primero solo produce rectángulos; lo segundo mete una segunda carga asíncrona además de `loadSpritesheet`.
- **Sí:** tres niveles con victoria final. Alcance cerrado y verificable de punta a punta.
- **No:** bucle infinito de niveles. Dejaría el juego sin pantalla de victoria.
- **Sí:** tamaño de bloque derivado del layout dentro de una zona fija. Un nivel con más columnas siempre encaja sin tocar márgenes ni constantes.
- **No:** tamaño de bloque fijo con límite de 10 columnas. Habría bloqueado el nivel 3.
- **Sí:** overlay «NIVEL N» con `Space` para continuar. Reutiliza el patrón de overlays del SPEC 01 y evita perder la bola nada más cargar el nivel.
- **No:** transición automática por temporizador. Añade un estado temporizado nuevo y quita control al jugador.
- **Sí:** vidas repuestas a 3 en cada nivel y puntuación acumulada. Decisión del usuario.
- **Sí:** pala decreciente 96 → 84 → 72. Sube la dificultad sin tocar la física de la bola, que sigue siendo la decisión cerrada del SPEC 01.
- **No:** velocidad de bola creciente. Contradice la física predecible del SPEC 01 y no se revoca aquí.
- **Sí:** bloques grises de 2 golpes y 20 puntos. Recompensa proporcional al esfuerzo.
- **Sí:** el gris dañado pasa a un color **aleatorio** de `ROW_COLORS`. Como el color es la clave compartida con `EXPLOSION_FRAMES`, la explosión sale coherente sin acoplamiento nuevo, y cada partida se ve distinta.
- **No:** color de daño fijo definido en el layout. Duplicaría caracteres en el formato por una ganancia estética menor.
- **Sí:** `hits` y `points` como campos del bloque. El bucle de colisión decide con datos del bloque, no con condicionales por color.
- **Sí:** pool de instancias `Audio` por sonido. Con una sola instancia, romper varios bloques seguidos solo dejaría oír el último.
- **Sí:** tecla `M` para silenciar, sin persistencia. El proyecto no tiene aún ninguna persistencia; meter `localStorage` por un booleano abriría versionado de esquema.
- **No:** sonidos de muerte, de nivel o de victoria. Decisión del usuario: solo los dos `.mp3` de `assets/sounds/`.
- **Sí:** volumen fijo en código a 0.5. Un control de volumen es UI que no pide este spec.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El navegador bloquea la reproducción hasta la primera interacción del usuario | El juego solo empieza al pulsar `Space` sobre el overlay de inicio, que ya es un gesto de usuario: cuando puede sonar el primer rebote, el audio está desbloqueado. Aun así, el rechazo de la promesa de `.play()` se ignora para no ensuciar la consola. |
| Bloques deformados en niveles con pocas filas o muchas columnas | Los sprites de bloque son 32×16 (2:1). El nivel 1 (10×6) da 64×24 y el 3 (12×6) da 53×24, ambos cerca de esa proporción. El formato limita a 6 filas justamente para acotar la deformación vertical. |
| Bloques más estrechos ⇒ la bola podría atravesarlos | El alto de bloque nunca baja de 24 px (máx. 6 filas en 144 px) y `dt` está clampeado a 0,05 s ⇒ máx. 17 px de avance por frame. El margen se mantiene. |
| Un layout mal escrito (filas de distinta longitud, nivel sin bloques) rompe el juego o lo deja invicto | El formato exige filas de igual longitud y al menos un bloque; los tres layouts van escritos en el propio spec. Si el nivel quedara vacío, la condición de victoria dispararía la transición en el primer frame, lo cual es visible de inmediato. |
| Reducir `paddle.w` con la pala pegada al borde derecho podría dejarla fuera del canvas | `cargarNivel` reclampa `paddle.x` tras cambiar el ancho, y `paddle.update()` vuelve a clampear cada frame. |
| Muchas instancias de `Audio` degradan el rendimiento | Son 8 en total (4 por sonido), creadas una sola vez al arrancar y reutilizadas en rotación. No se crean instancias durante la partida. |
| La condición de victoria podría dispararse en el frame en que se carga el nivel siguiente | `cargarNivel` rellena `blocks` antes de que `update` vuelva a evaluar la condición, y mientras `screen === 'nivel'` el bloque de juego no se ejecuta. |

## Lo que **no** entra en este spec

- Más de tres niveles, generación procedural, editor de niveles.
- Cambios en la velocidad o la física de la bola.
- Bloques indestructibles o de más de dos golpes.
- Sonidos de muerte, nivel, victoria o game over, y música de fondo.
- Control de volumen, ajustes, mezclador.
- Persistencia de récords, de nivel alcanzado o de la preferencia de silencio.
- Power-ups, rebote angular en la pala, pausa.

Cada uno, si llega, en su propio spec.
