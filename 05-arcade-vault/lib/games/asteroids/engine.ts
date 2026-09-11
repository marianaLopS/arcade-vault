// Asteroids — port del `game.js` original de
// References/resources/resources/templates/started-games/02-asteroides/.
//
// Diferencias deliberadas con el original (ver SPEC 05 y SPEC 07):
//   · El estado de la partida vive en la clausura de createAsteroidsGame, no en
//     variables de módulo: dos montajes del componente no comparten nada.
//   · Las entidades no leen estado global: lo que el original consulta desde
//     `hiperActivo` o `tripleTimer` aquí entra por parámetro.
//   · El HUD del canvas sólo pinta el estado de los power-ups; puntuación,
//     vidas y nivel los pinta la plataforma (components/game-player.tsx).
//   · No hay overlay de GAME OVER ni reinicio con Espacio: eso es el modal.
// Todo lo demás —constantes, física, puntuación— es idéntico al original.
import type { GameCallbacks, GameEngine, GameFactory } from "@/lib/games/engine";
// ── Mundo ─────────────────────────────────────────────────────────────────────
const W = 800;
const H = 600;
// ── Utils ─────────────────────────────────────────────────────────────────────
type Point = { x: number; y: number };
const wrap = (v: number, max: number) => ((v % max) + max) % max;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
// ── Constantes ────────────────────────────────────────────────────────────────
// Power-up de disparo triple
const TRIPLE_DURACION = 6; // s de efecto
const TRIPLE_SPREAD = 0.22; // rad de separación entre balas
const POWERUP_CHANCE = 0.15; // prob. de soltarlo al romper un asteroide
const POWERUP_TTL = 12; // s antes de caducar sin recoger
// Escudo temporal (activable con ↓)
const ESCUDO_DURACION = 5; // s de escudo activo
const ESCUDO_GRACIA = 1; // s de invencibilidad tras absorber
const ESCUDO_MAX = 3; // tope de cargas acumuladas
const ESCUDO_RADIO = 22; // px, algo mayor que ship.radius
// Power-up de cámara lenta
const SLOW_DURACION = 6; // s de efecto
const SLOW_FACTOR = 0.5; // multiplicador de dt aplicado a los asteroides
// Bomba Nova (ítem escaso, activable con B)
const NOVA_CHANCE = 0.18; // prob. de que el power-up soltado sea una bomba
const NOVA_MAX = 1; // tope de bombas guardadas: un solo uso
const NOVA_FLASH = 0.6; // s que dura la onda expansiva en pantalla
const NOVA_RADIO = 620; // px que alcanza la onda al final del flash
// Hiperpropulsión (mantener Shift)
const HIPER_RESERVA = 8; // s de reserva a tope
const HIPER_RECARGA = 0.5; // s recuperados por segundo sin usar
const HIPER_FACTOR = 2.5; // multiplicador de aceleración (y de velocidad máxima, con el mismo DRAG)
const HIPER_MIN = 0.6; // s mínimos para (re)activarla: evita parpadeo con la reserva a cero
/** Teclas que el juego consume; con el canvas enfocado no hacen scroll. */
const GAME_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "KeyB",
]);
type Keys = Record<string, boolean>;
// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl = 1.1;
  radius = 2;
  dead = false;
  constructor(x: number, y: number, angle: number) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
  }
  update(dt: number) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII = [0, 16, 30, 50]; // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32]; // velocidad base por tamaño
const POINTS = [0, 100, 50, 20]; // puntos por tamaño
class Asteroid {
  x: number;
  y: number;
  size: number;
  radius: number;
  vx: number;
  vy: number;
  rot: number;
  rotSpeed: number;
  verts: [number, number][] = [];
  dead = false;
  constructor(x: number, y: number, size = 3) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.radius = RADII[size];
    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);
    // Polígono irregular
    const n = randInt(8, 13);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  update(dt: number) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }
  split(): Asteroid[] {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++) ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}
// ── PowerUp (disparo triple / cámara lenta / bomba nova) ──────────────────────
type PowerUpType = "triple" | "slow" | "nova";
class PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  vx: number;
  vy: number;
  rot = 0;
  rotSpeed = 1.1;
  radius = 13;
  ttl = POWERUP_TTL;
  dead = false;
  constructor(x: number, y: number, type: PowerUpType) {
    this.x = x;
    this.y = y;
    this.type = type;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(15, 30);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
  }
  update(dt: number) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }
  draw(ctx: CanvasRenderingContext2D) {
    // Parpadeo en los últimos 3 s antes de caducar
    if (this.ttl < 3 && Math.floor(this.ttl * 8) % 2 === 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    // Contorno hexagonal
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * this.radius;
      const py = Math.sin(a) * this.radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    if (this.type === "slow") {
      // Reloj (símbolo de la cámara lenta)
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -5);
      ctx.moveTo(0, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
    } else if (this.type === "nova") {
      // Estrella de ocho rayos (símbolo de la bomba nova)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 2.5, Math.sin(a) * 2.5);
        ctx.lineTo(Math.cos(a) * 8.5, Math.sin(a) * 8.5);
        ctx.stroke();
      }
    } else {
      // Tres trazos en abanico (símbolo del disparo triple)
      for (const a of [-TRIPLE_SPREAD * 2, 0, TRIPLE_SPREAD * 2]) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 2);
        ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  x!: number;
  y!: number;
  angle!: number;
  vx!: number;
  vy!: number;
  radius!: number;
  thrusting!: boolean;
  invincible!: number;
  shootCooldown!: number;
  dead!: boolean;
  constructor() {
    this.reset();
  }
  reset() {
    this.x = W / 2;
    this.y = H / 2;
    this.angle = -Math.PI / 2;
    this.vx = 0;
    this.vy = 0;
    this.radius = 12;
    this.thrusting = false;
    this.invincible = 3;
    this.shootCooldown = 0;
    this.dead = false;
  }
  // `hiper` llega por parámetro: en el original es la global `hiperActivo`.
  update(dt: number, keys: Keys, hiper: boolean) {
    if (this.dead) return;
    if (this.invincible > 0) this.invincible -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    const ROT = 3.5; // rad/s
    const THRUST = 260; // px/s²
    const DRAG = 0.987;
    if (keys["ArrowLeft"]) this.angle -= ROT * dt;
    if (keys["ArrowRight"]) this.angle += ROT * dt;
    this.thrusting = !!keys["ArrowUp"];
    if (this.thrusting) {
      const thrust = hiper ? THRUST * HIPER_FACTOR : THRUST;
      this.vx += Math.cos(this.angle) * thrust * dt;
      this.vy += Math.sin(this.angle) * thrust * dt;
    }
    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }
  tryShoot(triple: boolean): Bullet[] {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    if (triple) {
      return [
        new Bullet(ox, oy, this.angle - TRIPLE_SPREAD),
        new Bullet(ox, oy, this.angle),
        new Bullet(ox, oy, this.angle + TRIPLE_SPREAD),
      ];
    }
    return [new Bullet(ox, oy, this.angle)];
  }
  draw(ctx: CanvasRenderingContext2D, hiper: boolean) {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo(20, 0); // nariz
    ctx.lineTo(-12, -9); // ala izquierda
    ctx.lineTo(-7, 0); // muesca trasera
    ctx.lineTo(-12, 9); // ala derecha
    ctx.closePath();
    ctx.stroke();
    // Llama del propulsor: más larga y azulada con hiperpropulsión
    if (this.thrusting && (hiper || Math.random() > 0.35)) {
      const largo = hiper ? rand(16, 30) : rand(6, 14);
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - largo, 0);
      ctx.lineTo(-8, 4);
      ctx.strokeStyle = hiper ? "rgba(120, 200, 255, 0.9)" : "rgba(255, 130, 0, 0.85)";
      ctx.stroke();
    }
    ctx.restore();
  }
}
// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  dead = false;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl = this.life;
  }
  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }
  draw(ctx: CanvasRenderingContext2D) {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}
// ── Motor ─────────────────────────────────────────────────────────────────────
export const createAsteroidsGame: GameFactory = (
  canvas: HTMLCanvasElement,
  callbacks: GameCallbacks,
): GameEngine => {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("El canvas de Asteroids no expone un contexto 2D");
  // Anotado explícito: dentro de las clausuras de abajo se pierde el estrechamiento.
  const ctx: CanvasRenderingContext2D = ctx2d;
  canvas.width = W;
  canvas.height = H;
  // Estado de la partida — en la clausura, nunca en el módulo.
  let ship: Ship;
  let bullets: Bullet[];
  let asteroids: Asteroid[];
  let particles: Particle[];
  let powerUps: PowerUp[];
  let score: number;
  let lives: number;
  let level: number;
  let tripleTimer: number; // s restantes de disparo triple
  let slowTimer: number; // s restantes de cámara lenta
  let escudoTimer: number; // s restantes de escudo activo
  let escudoCargas: number; // cargas de escudo disponibles (0..ESCUDO_MAX)
  let novaCargas: number; // bombas nova guardadas (0..NOVA_MAX)
  let novaTimer: number; // s restantes de la onda expansiva (sólo efecto visual)
  let hiperReserva: number; // s de hiperpropulsión disponibles (0..HIPER_RESERVA)
  let hiperActivo: boolean; // true mientras Shift la mantiene encendida
  let powerUpSpawned: boolean; // un power-up por nivel
  let state: "playing" | "dead" | "gameover";
  let deadTimer = 0;
  // Bucle
  let rafId: number | null = null;
  let lastTime: number | null = null;
  let destroyed = false;
  // Entrada
  const keys: Keys = {};
  const justPressed: Keys = {};
  function pressed(code: string) {
    const val = justPressed[code];
    justPressed[code] = false;
    return val;
  }
  // ── Avisos al HUD: sólo cuando el valor cambia ──────────────────────────────
  let lastScore = -1;
  let lastLives = -1;
  let lastLevel = -1;
  function emit() {
    if (score !== lastScore) {
      lastScore = score;
      callbacks.onScore(score);
    }
    if (lives !== lastLives) {
      lastLives = lives;
      callbacks.onLives(lives);
    }
    if (level !== lastLevel) {
      lastLevel = level;
      callbacks.onLevel(level);
    }
  }
  // ── Partida ────────────────────────────────────────────────────────────────
  function spawnAsteroids(count: number) {
    const SAFE_DIST = 130;
    for (let i = 0; i < count; i++) {
      let x: number, y: number;
      do {
        x = rand(0, W);
        y = rand(0, H);
      } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
      asteroids.push(new Asteroid(x, y, 3));
    }
  }
  function initGame() {
    ship = new Ship();
    bullets = [];
    asteroids = [];
    particles = [];
    powerUps = [];
    score = 0;
    lives = 3;
    level = 1;
    tripleTimer = 0;
    slowTimer = 0;
    escudoTimer = 0;
    escudoCargas = 0;
    novaCargas = 0;
    novaTimer = 0;
    hiperReserva = HIPER_RESERVA;
    hiperActivo = false;
    powerUpSpawned = false;
    state = "playing";
    spawnAsteroids(4);
    emit();
  }
  function nextLevel() {
    level++;
    bullets = [];
    particles = [];
    powerUpSpawned = false; // cada nivel vuelve a soltar su power-up
    escudoCargas = Math.min(escudoCargas + 1, ESCUDO_MAX); // +1 carga de escudo por nivel
    ship.reset(); // los ítems sin recoger cruzan de nivel (caducan por ttl)
    spawnAsteroids(3 + level);
  }
  function explode(x: number, y: number, count = 8) {
    for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
  }
  // Gasta una bomba nova: pulveriza todos los asteroides presentes en ese
  // instante (sin fragmentos, pero sí puntos) y lanza la onda expansiva.
  function detonarNova() {
    novaCargas--;
    novaTimer = NOVA_FLASH;
    for (const a of asteroids) {
      score += POINTS[a.size];
      explode(a.x, a.y, a.size * 5);
      a.dead = true;
    }
    asteroids = asteroids.filter((a) => !a.dead);
  }
  function killShip() {
    explode(ship.x, ship.y, 14);
    ship.dead = true;
    tripleTimer = 0; // el disparo triple se pierde al morir
    slowTimer = 0; // la cámara lenta también
    escudoTimer = 0; // el escudo activo también (las cargas se conservan)
    hiperActivo = false;
    hiperReserva = HIPER_RESERVA; // se reaparece con la reserva llena
    lives--;
    if (lives <= 0) {
      state = "gameover";
    } else {
      state = "dead";
      deadTimer = 2;
    }
  }
  // ── Update ─────────────────────────────────────────────────────────────────
  function update(dt: number) {
    if (novaTimer > 0) novaTimer -= dt; // la onda se apaga en cualquier estado
    if (state === "dead") {
      deadTimer -= dt;
      particles.forEach((p) => p.update(dt));
      particles = particles.filter((p) => !p.dead);
      asteroids.forEach((a) => a.update(dt));
      powerUps.forEach((p) => p.update(dt));
      powerUps = powerUps.filter((p) => !p.dead);
      if (deadTimer <= 0) {
        state = "playing";
        ship.reset();
      }
      return;
    }
    // Disparar
    if (pressed("Space")) bullets.push(...ship.tryShoot(tripleTimer > 0));
    // Activar escudo (gasta una carga; no se acumula sobre uno ya activo)
    if (pressed("ArrowDown") && escudoCargas > 0 && escudoTimer <= 0 && !ship.dead) {
      escudoCargas--;
      escudoTimer = ESCUDO_DURACION;
    }
    // Detonar la bomba nova (un solo uso)
    if (pressed("KeyB") && novaCargas > 0 && !ship.dead) detonarNova();
    if (tripleTimer > 0) tripleTimer -= dt;
    if (escudoTimer > 0) escudoTimer -= dt;
    if (slowTimer > 0) slowTimer -= dt;
    // Hiperpropulsión: se drena mientras Shift esté pulsado, se recarga al soltar
    const quiereHiper = !!(keys["ShiftLeft"] || keys["ShiftRight"]);
    if (ship.dead || !quiereHiper || hiperReserva <= 0) hiperActivo = false;
    else if (hiperActivo || hiperReserva >= HIPER_MIN) hiperActivo = true;
    if (hiperActivo) hiperReserva = Math.max(0, hiperReserva - dt);
    else hiperReserva = Math.min(HIPER_RESERVA, hiperReserva + HIPER_RECARGA * dt);
    ship.update(dt, keys, hiperActivo);
    bullets.forEach((b) => b.update(dt));
    // Cámara lenta: sólo los asteroides avanzan con dt escalado
    const dtAst = slowTimer > 0 ? dt * SLOW_FACTOR : dt;
    asteroids.forEach((a) => a.update(dtAst));
    particles.forEach((p) => p.update(dt));
    powerUps.forEach((p) => p.update(dt));
    bullets = bullets.filter((b) => !b.dead);
    particles = particles.filter((p) => !p.dead);
    powerUps = powerUps.filter((p) => !p.dead);
    // Bala vs asteroide
    const newAsteroids: Asteroid[] = [];
    let lastKill: Point | null = null; // posición del último roto (para soltar el power-up)
    for (const b of bullets) {
      for (const a of asteroids) {
        if (!a.dead && !b.dead && dist(b, a) < a.radius) {
          b.dead = true;
          a.dead = true;
          score += POINTS[a.size];
          explode(a.x, a.y, a.size * 5);
          newAsteroids.push(...a.split());
          lastKill = { x: a.x, y: a.y };
        }
      }
    }
    asteroids = asteroids.filter((a) => !a.dead).concat(newAsteroids);
    bullets = bullets.filter((b) => !b.dead);
    // Soltar el power-up: aleatorio, y forzado con pocos asteroides restantes
    // para garantizar al menos una aparición por nivel.
    if (!powerUpSpawned && lastKill) {
      if (Math.random() < POWERUP_CHANCE || asteroids.length <= 2) {
        powerUpSpawned = true;
        // La bomba es escasa: sólo sale si no llevas ya una guardada
        const r = Math.random();
        let tipo: PowerUpType;
        if (r < NOVA_CHANCE && novaCargas < NOVA_MAX) tipo = "nova";
        else tipo = r < (1 + NOVA_CHANCE) / 2 ? "triple" : "slow";
        powerUps.push(new PowerUp(lastKill.x, lastKill.y, tipo));
      }
    }
    // Nave vs power-up
    if (!ship.dead) {
      for (const p of powerUps) {
        if (dist(ship, p) < ship.radius + p.radius) {
          p.dead = true;
          if (p.type === "slow") slowTimer = SLOW_DURACION;
          else if (p.type === "nova") novaCargas = Math.min(novaCargas + 1, NOVA_MAX);
          else tripleTimer = TRIPLE_DURACION;
        }
      }
      powerUps = powerUps.filter((p) => !p.dead);
    }
    // Nave vs asteroide
    if (ship.invincible <= 0) {
      for (const a of asteroids) {
        if (dist(ship, a) < ship.radius + a.radius * 0.82) {
          if (escudoTimer > 0) {
            // El escudo vaporiza el asteroide: sin fragmentos ni puntos
            a.dead = true;
            explode(a.x, a.y, a.size * 5);
            escudoTimer = 0;
            ship.invincible = ESCUDO_GRACIA;
          } else {
            killShip();
          }
          break;
        }
      }
      asteroids = asteroids.filter((a) => !a.dead);
    }
    // Nivel completado
    if (asteroids.length === 0) nextLevel();
  }
  // ── Draw ───────────────────────────────────────────────────────────────────
  // Círculo de energía alrededor de la nave. Se dibuja fuera de Ship.draw()
  // para que siga viéndose durante el parpadeo de invencibilidad.
  function drawEscudo() {
    if (escudoTimer <= 0 || ship.dead) return;
    // Parpadeo en el último segundo antes de agotarse
    if (escudoTimer < 1 && Math.floor(escudoTimer * 10) % 2 === 0) return;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.strokeStyle = "rgba(120, 200, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, ESCUDO_RADIO, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // Onda expansiva de la bomba nova: anillo que crece y se desvanece.
  function drawNova() {
    if (novaTimer <= 0) return;
    const t = 1 - novaTimer / NOVA_FLASH; // 0 → 1 a lo largo del flash
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - t) * 0.9})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ship.x, ship.y, t * NOVA_RADIO, 0, Math.PI * 2);
    ctx.stroke();
    // Destello blanco sobre toda la pantalla al inicio
    ctx.fillStyle = `rgba(255, 255, 255, ${(1 - t) * 0.18})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  /**
   * HUD recortado: sólo el estado de los power-ups. Puntuación, vidas y nivel
   * los pinta el HUD de React, así que aquí no se duplican.
   */
  function drawPowerUpHUD() {
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "13px monospace";
    let y = 26;
    const linea = (texto: string) => {
      ctx.fillText(texto, 14, y);
      y += 20;
    };
    if (escudoTimer > 0) linea(`ESCUDO ${escudoTimer.toFixed(1)}`);
    else linea(`ESCUDO x${escudoCargas} [↓]`);
    if (novaCargas > 0) linea(`NOVA x${novaCargas} [B]`);
    if (tripleTimer > 0) linea(`TRIPLE ${tripleTimer.toFixed(1)}`);
    if (slowTimer > 0) linea(`LENTO ${slowTimer.toFixed(1)}`);
    // Barra de reserva de hiperpropulsión (abajo a la izquierda)
    const bx = 14,
      by = H - 22,
      bw = 110,
      bh = 8;
    ctx.font = "12px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText("HIPER [SHIFT]", bx, by - 6);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = hiperActivo ? "rgba(120, 200, 255, 0.9)" : "rgba(255,255,255,0.75)";
    ctx.fillRect(bx, by, bw * (hiperReserva / HIPER_RESERVA), bh);
    ctx.restore();
  }
  function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    particles.forEach((p) => p.draw(ctx));
    asteroids.forEach((a) => a.draw(ctx));
    powerUps.forEach((p) => p.draw(ctx));
    bullets.forEach((b) => b.draw(ctx));
    ship.draw(ctx, hiperActivo);
    drawEscudo();
    drawNova();
    drawPowerUpHUD();
  }
  // ── Bucle principal ────────────────────────────────────────────────────────
  function loop(ts: number) {
    // dt capado a 50 ms: volver de una pestaña en segundo plano no teletransporta.
    const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    draw();
    emit();
    if (state === "gameover") {
      stopLoop();
      callbacks.onGameOver(score);
      return;
    }
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }
  function startLoop() {
    // `state === "gameover"` frena un resume() posterior al fin de partida:
    // sin esta guarda el bucle se reanudaría con la nave ya muerta.
    if (destroyed || rafId !== null || state === "gameover") return;
    // Sin esto, el primer dt tras una pausa vale lo que haya durado la pausa.
    lastTime = null;
    rafId = requestAnimationFrame(loop);
  }
  // ── Entrada: listeners en el canvas, nunca en window ────────────────────────
  function onKeyDown(e: KeyboardEvent) {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    if (!keys[e.code]) justPressed[e.code] = true;
    keys[e.code] = true;
  }
  function onKeyUp(e: KeyboardEvent) {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    keys[e.code] = false;
  }
  /** Al perder el foco se sueltan todas las teclas: la nave no se queda girando. */
  function onBlur() {
    for (const code of Object.keys(keys)) keys[code] = false;
    for (const code of Object.keys(justPressed)) justPressed[code] = false;
  }
  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("blur", onBlur);
  initGame();
  draw();
  return {
    start: startLoop,
    pause: stopLoop,
    resume: startLoop,
    restart() {
      if (destroyed) return;
      stopLoop();
      onBlur();
      initGame();
      startLoop();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("blur", onBlur);
    },
  };
};
