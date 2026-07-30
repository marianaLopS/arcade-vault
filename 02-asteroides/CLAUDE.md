# CLAUDE.md

Clon de **Asteroids** en Canvas 2D. Tres archivos: `index.html`, `game.js`, `favicon.svg`. Sin dependencias, bundler, build, linter ni tests.

## Ejecutar

`npx serve .` (→ `localhost:3000`) o abrir `index.html`. Verificar jugando.

## Reglas

- **Un solo archivo** (`game.js`), `'use strict'`, scope global, sin módulos. Orden: Input → Utils → Entidades (`Bullet`, `Asteroid`, `Ship`, `Particle`) → Estado global → `update`/`draw`/`loop`.
- **Toda entidad implementa** `update(dt)`, `draw()` y bandera `dead`. Nunca se auto-elimina: marca `dead`, el loop la filtra.
- **Todo se escala por `dt` en segundos** (px/s, rad/s). Nunca sumar por frame. Única excepción: `DRAG = 0.987`.
- **Todo lo que se mueve usa `wrap()`** en su `update` (espacio toroidal).
- **`keys[code]`** para acciones continuas; **`pressed(code)`** para disparo único — se consume al leerse, una lectura por frame y tecla.
- **Cada rama de `state`** (`'playing' | 'dead' | 'gameover'`) actualiza distintas entidades: en `'dead'` solo asteroides y partículas, en `'gameover'` solo partículas. Al añadir entidad, actualizarla en cada rama donde deba moverse.
- **Tablas por tamaño de asteroide** (`RADII`, `SPEEDS`, `POINTS`): índice 0 es relleno, tamaños válidos 1–3. Seguir el patrón al añadir propiedades.
- **Dibujo en espacio local**: `save()` / `translate` / `rotate`, centrado en el origen, `restore()`. Wireframe `#fff` sobre negro, `lineWidth` ~1.5.
- **Colisiones** círculo-círculo con `dist()`. La nave usa `a.radius * 0.82` (margen a favor del jugador).
- **Canvas fijo 800×600**: `W`/`H` en `game.js` deben coincidir con `<canvas>` en `index.html`. CSS inline en el HTML.
- **Comentarios y UI en español.**

## Ciclo de partida

`initGame()` (4 asteroides) → `'playing'` → `killShip()` → `'dead'` (2 s) → `ship.reset()` (3 s invencible, parpadeo) → `'playing'`. Sin vidas → `'gameover'`, `Espacio` reinicia. Asteroides vacíos → `nextLevel()`: `3 + level` asteroides fuera de radio 130 px del centro, más `ship.reset()`.

Temporizadores: disparo 0.2 s, bala 1.1 s, invencible 3 s, muerte 2 s, `dt` clampeado a 0.05.

## README

Describe power-ups y "estrella fugaz" **inexistentes** en `game.js`. Documentación aspiracional, no el código actual.
