# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

Responder siempre en español, en todas las interacciones de este proyecto (explicaciones, resúmenes, preguntas, mensajes de commit). El código y los identificadores siguen en inglés; la UI y los textos visibles al usuario, en español.

## Estado del proyecto

Arkanoid en HTML/CSS/JS vanilla. Cero dependencias: sin `package.json`, sin build, sin bundler, sin linter, sin tests.

Estructura actual:

```
index.html        canvas único de 800×600, carga assets/spritesheet.js y luego game.js
style.css         fondo oscuro, canvas centrado, sin scroll
game.js           todo el juego, ~590 líneas
assets/           spritesheet.js + spritesheet-breakout.png + sounds/
specs/            01, 02, 03 + .spec-config.yml
.agents/skills/   skills spec y spec-impl (con symlinks desde .claude/skills/)
```

Los tres specs están **aprobados e implementados**: el juego tiene tres niveles con layouts propios, pala decreciente, bloques grises resistentes, animación de explosión al romper, sonidos de rebote y rotura, HUD con puntuación/nivel/vidas y overlays de inicio, nivel, victoria y game over.

El siguiente spec sería el `04-`.

## Flujo de trabajo (spec-driven)

Este proyecto se construye **spec a spec**. Nada de código sin un spec aprobado detrás.

### Ciclo

1. `/spec <descripción>` — hace preguntas hasta cerrar las ambigüedades y escribe `specs/NN-slug.md` en estado `Borrador`. **Nunca escribe código.**
2. **El usuario** cambia el estado a `Aprobado` a mano. Ese paso es humano, el agente no lo hace nunca.
3. `/spec-impl NN-slug` — valida que el estado signifique «aprobado», crea y cambia a la rama `spec-NN-slug`, muestra objetivo/alcance/plan/criterios y luego implementa **paso a paso**, parando tras cada paso para que el usuario revise el diff.
4. Al terminar el último paso: verificar los criterios de aceptación uno a uno y pasar el estado a `Implementado`.

### Estados

`Borrador` → `En revisión` → `Aprobado` → `Implementado` (o `Obsoleto`). Los tres specs existentes usan `Aprobado`.

### Reglas duras

- `/spec` no escribe código y no propone implementar al acabar.
- `/spec-impl` **no commitea nunca solo**, ni por paso ni al final.
- Lo que salga del alcance durante la implementación **no se cuela «ya que estamos»**: va a un spec nuevo.
- Si una ambigüedad aparece implementando, se para y se pregunta; no se improvisa.

### Numeración, ramas y config

- Fichero: `specs/NN-slug.md`, numeración secuencial de dos dígitos.
- Rama: `spec-` + nombre del fichero sin extensión (`03-niveles-y-sonidos.md` → `spec-03-niveles-y-sonidos`).
- `specs/.spec-config.yml` → `AutoCreateBranch: true` hace que `/spec-impl` cree la rama sin preguntar. Con `false` pide confirmación `[y/N]`.

### Dónde viven las skills

En `.agents/skills/spec/` y `.agents/skills/spec-impl/`; `.claude/skills/spec` y `.claude/skills/spec-impl` son symlinks a esas carpetas. `.agents/skills/spec/template.md` es la plantilla de referencia de un spec.

`skills-lock.json` las fija (fuente `Klerith/fernando-skills`, con hash). **No editarlas a mano.**

## Anatomía de un spec

Los tres specs comparten exactamente este orden; el siguiente debe salir igual.

1. **Cabecera** en blockquote: `**Estado:**`, `**Depende de:**`, `**Fecha:**`, `**Objetivo:**`. El objetivo cabe en **una sola frase**; si no cabe, la funcionalidad es demasiado grande y se parte en dos specs.
2. `## Por qué existe este spec` — el motivo, no el qué.
3. `## Alcance` — con **«Dentro:»** y **«Fuera de alcance (para specs futuros):»**. Los dos bloques son obligatorios.
4. `## Modelo de datos` — estructuras concretas con nombres reales, snippets cortos.
5. `## Plan de implementación` — pasos numerados, cada uno deja el juego ejecutable y es commiteable por sí solo.
6. `## Criterios de aceptación` — checklist booleana, verificable jugando.
7. `## Decisiones` — formato `**Sí:** … / **No:** …`, cada una con su motivo. Es la sección con más valor a futuro.
8. `## Riesgos` — tabla riesgo/mitigación.
9. `## Lo que **no** entra en este spec` — repetición deliberada del «fuera de alcance».

Dos reglas que ya sigue el proyecto:

- Cada spec declara en `Depende de:` los anteriores de los que parte.
- Un spec **no revoca decisiones cerradas** de specs previos. Ejemplo: el SPEC 03 sube la dificultad estrechando la pala precisamente para no tocar la velocidad constante de la bola que fijó el SPEC 01.

## Arquitectura de `game.js`

Un solo fichero, scope global, en este orden:

**Constantes de mundo → Canvas → Input → Audio → Utils → Entidades → Estado global → Bucle principal.**

- **Entidades:** `paddle` y `ball` son objetos únicos; los bloques y las explosiones se crean con fábricas (`crearBloque`, `crearBloques`, `crearExplosion`). Los arrays globales `blocks` y `explosions` se filtran por `dead` dentro de `update`.
- **Niveles como texto:** `LEVELS` es un array de niveles, cada uno un array de strings; `BLOCK_CHARS` mapea carácter → color y `'.'` es hueco. El tamaño de bloque **se deriva** repartiendo la zona `GRID_X`/`GRID_Y`/`GRID_W`/`GRID_H` entre las filas y columnas del layout: no es constante, así un nivel con 12 columnas encaja sin tocar márgenes.
- **Pantallas:** `screen` ∈ `'inicio' | 'jugando' | 'nivel' | 'victoria' | 'gameover'`. No hay pantallas separadas: todas se dibujan como overlay encima del juego, y `OVERLAYS` mapea estado → `[título, subtítulo, pie]`. Con cualquier estado distinto de `'jugando'` el juego no avanza y `Space` cierra el overlay.
- **Progresión:** `cargarNivel(i)` prepara bloques, vidas y ancho de pala; `reiniciar()` vuelve al nivel 0 con la puntuación a cero. La puntuación acumula entre niveles, las vidas se reponen en cada uno.
- **Audio:** `crearSonido(ruta)` precarga un pool de 4 instancias `Audio` por sonido y `play(nombre)` las usa en rotación, para que dos roturas seguidas no se corten. `muted` se alterna con `M` (sin persistencia) y el rechazo de la promesa de `.play()` se ignora a propósito.
- **Acoplamiento a mantener:** el **color** del bloque es la clave compartida entre `SPRITES.blocks`, `EXPLOSION_FRAMES` y `BLOCK_CHARS`. Al añadir un tipo de bloque, respetar esa clave.
- **Arranque:** el bucle se lanza dentro del callback de `loadSpritesheet`, nunca antes.

## Assets disponibles

`assets/spritesheet.js` define globals (sin módulos); se carga con `<script>` **antes** de `game.js`.

- `loadSpritesheet(cb)` — carga `assets/spritesheet-breakout.png` en un canvas offscreen y encola callbacks. `drawSprite`/`drawFrame` son no-op hasta que la imagen está lista. La ruta es relativa a la raíz del proyecto ⇒ servir desde `04-arkanoid/`.
- `drawSprite(ctx, name, x, y, w, h)` — nombres: `paddle` (162×14), `ball` (16×16), `block_<color>` (32×16) con colores `gray|red|yellow|cyan|magenta|hotpink|green`.
- `drawFrame(ctx, frame, x, y, w, h)` junto con `EXPLOSION_FRAMES[color]` (4 frames por color; `gray` reusa los de `red`) y `EXPLOSION_DURATION = 150` ms, que es la duración **total** de los 4 frames.
- Sonidos: `assets/sounds/ball-bounce.mp3` (rebotes y golpe a bloque resistente) y `assets/sounds/break-sound.mp3` (rotura), ya en uso a través del pool de audio.

## Ejecutar

```bash
python3 -m http.server 8000   # desde 04-arkanoid/ → http://localhost:8000
```

(o `npx serve .`). Abrir `index.html` con `file://` rompe la carga del spritesheet. La verificación es jugar; no hay tests.

## Convenciones de código

Las que `game.js` **ya** cumple; todo lo nuevo se escribe igual.

- **Un solo `game.js`**, `'use strict'`, scope global, sin módulos. El `<script>` va al final del `<body>`.
- **Toda entidad** expone `update(dt)`, `draw()` y bandera `dead`. Nunca se autoelimina: marca `dead` y el loop la filtra.
- **Todo se escala por `dt` en segundos** (px/s), nunca por frame. `dt` clampeado a `DT_MAX` (0.05) para evitar saltos tras un pausado.
- **`keys[code]`** para acciones continuas; **`pressed(code)`** (se consume al leerse) para acciones de una sola pulsación.
- **Dimensiones del canvas duplicadas**: las constantes `W`/`H` de `game.js` deben coincidir con el `<canvas>` de `index.html`.
- **Nombres:** funciones de lógica de juego en español (`cargarNivel`, `crearBloques`, `colisionarBloques`, `reiniciar`, `play`), campos de entidad y constantes en inglés (`x`, `vx`, `stuck`, `BALL_SPEED`).
- Comentarios y UI en español. Los comentarios explican el **porqué** de una decisión, no lo que ya dice el código.

## Git

El repo git está en `Escritorio/claudeCode/` (raíz); `04-arkanoid/` sigue **sin trackear**: existen las ramas `spec-01-mvp-jugable`, `spec-02-animacion-destruccion-bloques` y `spec-03-niveles-y-sonidos`, pero el código del juego nunca se ha commiteado.

Rama principal `main`. Mensajes de commit en español e imperativo («Añadir …»). **No commitear salvo que lo pidan.**
