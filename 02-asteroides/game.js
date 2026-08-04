'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};        // teclas mantenidas (acciones continuas)
const justPressed = {}; // pulsaciones sin consumir (acciones de un disparo)

// Códigos que el juego consume: se bloquea su acción por defecto (scroll)
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

window.addEventListener('keydown', e => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  if (e.repeat) return;              // la repetición del SO no genera pulsaciones nuevas
  if (!keys[e.code]) justPressed[e.code] = true;
  keys[e.code] = true;
});

window.addEventListener('keyup', e => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  keys[e.code] = false;
});

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

// Power-up de disparo triple
const TRIPLE_DURACION = 6;     // s de efecto
const TRIPLE_SPREAD   = 0.22;  // rad de separación entre balas
const POWERUP_CHANCE  = 0.15;  // prob. de soltarlo al romper un asteroide

// Escudo temporal (activable con ↓)
const ESCUDO_DURACION = 5;    // s de escudo activo
const ESCUDO_GRACIA   = 1;    // s de invencibilidad tras absorber
const ESCUDO_MAX      = 3;    // tope de cargas acumuladas
const ESCUDO_RADIO    = 22;   // px, algo mayor que ship.radius

// Power-up de cámara lenta
const SLOW_DURACION = 6;     // s de efecto
const SLOW_FACTOR   = 0.5;   // multiplicador de dt aplicado a los asteroides

// Bomba Nova (ítem escaso, activable con B)
const NOVA_CHANCE = 0.18;  // prob. de que el power-up soltado sea una bomba
const NOVA_MAX    = 1;     // tope de bombas guardadas: un solo uso
const NOVA_FLASH  = 0.6;   // s que dura la onda expansiva en pantalla
const NOVA_RADIO  = 620;   // px que alcanza la onda al final del flash

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Polígono irregular
    const n = randInt(8, 13);
    this.verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() { this.reset(); }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.dead          = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;

    const ROT   = 3.5;   // rad/s
    const THRUST = 260;  // px/s²
    const DRAG   = 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    if (tripleTimer > 0) return [
      new Bullet(ox, oy, this.angle - TRIPLE_SPREAD),
      new Bullet(ox, oy, this.angle),
      new Bullet(ox, oy, this.angle + TRIPLE_SPREAD),
    ];
    return [new Bullet(ox, oy, this.angle)];
  }

  draw() {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo( 20,  0);   // nariz
    ctx.lineTo(-12, -9);   // ala izquierda
    ctx.lineTo( -7,  0);   // muesca trasera
    ctx.lineTo(-12,  9);   // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, 14), 0);
      ctx.lineTo(-8,  4);
      ctx.strokeStyle = 'rgba(255, 130, 0, 0.85)';
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── PowerUp (disparo triple / cámara lenta / bomba nova) ──────────────────────
class PowerUp {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;   // 'triple' | 'slow' | 'nova'
    const angle = rand(0, Math.PI * 2);
    const speed = rand(15, 30);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rot = 0;
    this.rotSpeed = 1.1;
    this.radius = 13;
    this.ttl  = 12;   // caduca si no se recoge
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    // Parpadeo en los últimos 3 s antes de caducar
    if (this.ttl < 3 && Math.floor(this.ttl * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Contorno hexagonal
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * this.radius;
      const py = Math.sin(a) * this.radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    if (this.type === 'slow') {
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
    } else if (this.type === 'nova') {
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

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, powerups;
let score, lives, level;
let tripleTimer;     // s restantes de disparo triple
let slowTimer;       // s restantes de cámara lenta
let escudoTimer;     // s restantes de escudo activo
let escudoCargas;    // cargas de escudo disponibles (0..ESCUDO_MAX)
let novaCargas;      // bombas nova guardadas (0..NOVA_MAX)
let novaTimer;       // s restantes de la onda expansiva (solo efecto visual)
let powerupSpawned;  // el power-up solo aparece una vez por partida
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function initGame() {
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  powerups  = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  tripleTimer    = 0;
  slowTimer      = 0;
  escudoTimer    = 0;
  escudoCargas   = 0;
  novaCargas     = 0;
  novaTimer      = 0;
  powerupSpawned = false;
  state  = 'playing';
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  powerupSpawned = false;   // cada nivel vuelve a soltar su power-up
  escudoCargas = Math.min(escudoCargas + 1, ESCUDO_MAX);  // +1 carga de escudo por nivel
  ship.reset();             // los ítems sin recoger cruzan de nivel (caducan por ttl)
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
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
  asteroids = asteroids.filter(a => !a.dead);
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  tripleTimer = 0;   // el disparo triple se pierde al morir
  slowTimer   = 0;   // la cámara lenta también
  escudoTimer = 0;   // el escudo activo también (las cargas se conservan)
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (novaTimer > 0) novaTimer -= dt;   // la onda se apaga en cualquier estado

  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(dt));
    powerups.forEach(p => p.update(dt));
    powerups = powerups.filter(p => !p.dead);
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  // Activar escudo (gasta una carga; no se acumula sobre uno ya activo)
  if (pressed('ArrowDown') && escudoCargas > 0 && escudoTimer <= 0 && !ship.dead) {
    escudoCargas--;
    escudoTimer = ESCUDO_DURACION;
  }

  // Detonar la bomba nova (un solo uso)
  if (pressed('KeyB') && novaCargas > 0 && !ship.dead) detonarNova();

  if (tripleTimer > 0) tripleTimer -= dt;
  if (escudoTimer > 0) escudoTimer -= dt;
  if (slowTimer   > 0) slowTimer   -= dt;

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  // Cámara lenta: solo los asteroides avanzan con dt escalado
  const dtAst = slowTimer > 0 ? dt * SLOW_FACTOR : dt;
  asteroids.forEach(a => a.update(dtAst));
  particles.forEach(p => p.update(dt));
  powerups.forEach(p => p.update(dt));

  bullets   = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);
  powerups  = powerups.filter(p => !p.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  let lastKill = null;   // posición del último asteroide roto (para soltar el power-up)
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
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Soltar el power-up: aleatorio, y forzado con pocos asteroides restantes
  // para garantizar al menos una aparición por nivel.
  if (!powerupSpawned && lastKill) {
    if (Math.random() < POWERUP_CHANCE || asteroids.length <= 2) {
      powerupSpawned = true;
      // La bomba es escasa: solo sale si no llevas ya una guardada
      const r = Math.random();
      let tipo;
      if (r < NOVA_CHANCE && novaCargas < NOVA_MAX) tipo = 'nova';
      else tipo = r < (1 + NOVA_CHANCE) / 2 ? 'triple' : 'slow';
      powerups.push(new PowerUp(lastKill.x, lastKill.y, tipo));
    }
  }

  // Nave vs power-up
  if (!ship.dead) {
    for (const p of powerups) {
      if (dist(ship, p) < ship.radius + p.radius) {
        p.dead = true;
        if      (p.type === 'slow') slowTimer   = SLOW_DURACION;
        else if (p.type === 'nova') novaCargas  = Math.min(novaCargas + 1, NOVA_MAX);
        else                        tripleTimer = TRIPLE_DURACION;
      }
    }
    powerups = powerups.filter(p => !p.dead);
  }

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        if (escudoTimer > 0) {
          // El escudo vaporiza el asteroide: sin fragmentos ni puntos
          a.dead = true;
          explode(a.x, a.y, a.size * 5);
          escudoTimer     = 0;
          ship.invincible = ESCUDO_GRACIA;
        } else {
          killShip();
        }
        break;
      }
    }
    asteroids = asteroids.filter(a => !a.dead);
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// Círculo de energía alrededor de la nave. Se dibuja fuera de Ship.draw()
// para que siga viéndose durante el parpadeo de invencibilidad.
function drawEscudo() {
  if (escudoTimer <= 0 || ship.dead) return;
  // Parpadeo en el último segundo antes de agotarse
  if (escudoTimer < 1 && Math.floor(escudoTimer * 10) % 2 === 0) return;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.8)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, ESCUDO_RADIO, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Onda expansiva de la bomba nova: anillo que crece y se desvanece.
function drawNova() {
  if (novaTimer <= 0) return;
  const t = 1 - novaTimer / NOVA_FLASH;   // 0 → 1 a lo largo del flash

  ctx.save();
  ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - t) * 0.9})`;
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.arc(ship.x, ship.y, t * NOVA_RADIO, 0, Math.PI * 2);
  ctx.stroke();
  // Destello blanco sobre toda la pantalla al inicio
  ctx.fillStyle = `rgba(255, 255, 255, ${(1 - t) * 0.18})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.font = '13px monospace';
  if (escudoTimer > 0) ctx.fillText(`ESCUDO ${escudoTimer.toFixed(1)}`, 14, 46);
  else                 ctx.fillText(`ESCUDO x${escudoCargas}`, 14, 46);
  if (novaCargas > 0)  ctx.fillText(`NOVA x${novaCargas}  [B]`, 14, 64);
  ctx.font = '15px monospace';

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  if (tripleTimer > 0) {
    ctx.font = '13px monospace';
    ctx.fillText(`TRIPLE ${tripleTimer.toFixed(1)}`, W / 2, 46);
    ctx.font = '15px monospace';
  }

  if (slowTimer > 0) {
    ctx.font = '13px monospace';
    ctx.fillText(`LENTO ${slowTimer.toFixed(1)}`, W / 2, 66);
    ctx.font = '15px monospace';
  }

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  powerups.forEach(p => p.draw());
  bullets.forEach(b => b.draw());
  ship.draw();
  drawEscudo();
  drawNova();

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
