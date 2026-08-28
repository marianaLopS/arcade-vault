'use strict';

// ---------------------------------------------------------------------------
// Constantes de mundo
// ---------------------------------------------------------------------------

// W/H deben coincidir con los atributos width/height del <canvas> de index.html
const W = 800, H = 600;

const PADDLE_H = 14, PADDLE_SPEED = 520;                  // px/s
const BALL_SIZE = 12, BALL_SPEED = 340;                   // px/s

// Zona que ocupa la rejilla. El tamaño de cada bloque NO es constante: se
// deriva del layout del nivel repartiendo esta zona entre sus filas y columnas,
// así un nivel con más columnas encaja sin recalcular márgenes.
const GRID_X = 80, GRID_Y = 70;                           // origen de la rejilla
const GRID_W = 640, GRID_H = 144;                         // tamaño de la zona

const ROW_COLORS = ['red', 'yellow', 'green', 'cyan', 'magenta', 'hotpink'];
const LIVES_START = 3, POINTS_PER_BLOCK = 10;

// Bloques resistentes (grises): aguantan dos golpes y valen el doble
const HITS_RESISTENTE = 2, POINTS_RESISTENTE = 20;

const DT_MAX = 0.05;                                      // clamp de dt en segundos

// Cada carácter de un layout es un bloque; '.' (y cualquier carácter no
// listado aquí) es un hueco. Los valores coinciden con las claves de
// SPRITES.blocks y de EXPLOSION_FRAMES: ese acoplamiento hay que mantenerlo.
const BLOCK_CHARS = {
  R: 'red', Y: 'yellow', G: 'green',
  C: 'cyan', M: 'magenta', P: 'hotpink',
  X: 'gray',                                              // resistente: 2 golpes
};

// Un array de strings por nivel. Máximo 6 filas, todas de la misma longitud.
const LEVELS = [
  // Nivel 1 — la rejilla llena del SPEC 01, sin grises: la entrada no cambia
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
  // Nivel 3 — 12 columnas (bloques más estrechos) y más grises
  [
    'X.RRRRRRRR.X',
    'X.YYYYYYYY.X',
    '..XXXXXXXX..',
    'M..GGGGGG..M',
    'MM..CCCC..MM',
    'XXX......XXX',
  ],
];

// Un ancho de pala por nivel: la dificultad sube sin tocar la física de la bola
const PADDLE_WIDTHS = [96, 84, 72];

// EXPLOSION_DURATION (150 ms, definido en assets/spritesheet.js) es la duración
// TOTAL de los 4 frames, no la de cada uno. En segundos, porque todo el juego
// trabaja con dt en segundos.
const EXPLOSION_TIME = EXPLOSION_DURATION / 1000;         // 0.15 s de animación

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

// keys[code]  -> acciones continuas (mantener pulsado)
// pressed(code) -> acciones de una sola pulsación; se consume al leerse
const keys = {};
const justPressed = {};

addEventListener('keydown', (e) => {
  if (!keys[e.code]) justPressed[e.code] = true;
  keys[e.code] = true;
  // Evita que la barra espaciadora haga scroll de la página
  if (e.code === 'Space') e.preventDefault();
});

addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

function pressed(code) {
  if (!justPressed[code]) return false;
  justPressed[code] = false;
  return true;
}

// Ratón: posición en coordenadas del canvas, o null si aún no se ha movido.
// El paddle lo consume y lo pone a null tras usarlo, para que la última fuente
// de entrada usada (teclado o ratón) sea la que manda.
let mouseX = null;

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  // El canvas puede estar escalado por CSS: normalizamos al espacio de mundo
  mouseX = (e.clientX - rect.left) * (W / rect.width);
});

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

const SOUND_POOL = 4;         // instancias por sonido: solo se cortan con >4 solapadas
const SOUND_VOLUME = 0.5;     // fijo en código, sin control de usuario

// Cada sonido precarga varias instancias y las usa en rotación: con una sola,
// romper varios bloques seguidos solo dejaría oír el último.
function crearSonido(ruta) {
  const pool = [];
  for (let i = 0; i < SOUND_POOL; i++) {
    const audio = new Audio(ruta);
    audio.volume = SOUND_VOLUME;
    pool.push(audio);
  }
  return { pool, i: 0 };
}

const sonidos = {
  bounce: crearSonido('assets/sounds/ball-bounce.mp3'),
  break: crearSonido('assets/sounds/break-sound.mp3'),
};

let muted = false;            // tecla M; no se persiste entre sesiones

function play(nombre) {
  if (muted) return;

  const sonido = sonidos[nombre];
  const audio = sonido.pool[sonido.i];
  sonido.i = (sonido.i + 1) % sonido.pool.length;

  audio.currentTime = 0;
  // El navegador rechaza la reproducción hasta la primera interacción del
  // usuario: se ignora el rechazo para no ensuciar la consola.
  const promesa = audio.play();
  if (promesa) promesa.catch(() => {});
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function clamp(v, min, max) {
  return v < min ? min : (v > max ? max : v);
}

// Colisión AABB entre dos entidades con x/y/w/h
function colisionan(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

const PADDLE_Y = H - 40;

const paddle = {
  x: (W - PADDLE_WIDTHS[0]) / 2,
  y: PADDLE_Y,
  w: PADDLE_WIDTHS[0],          // se reasigna en cada cargarNivel()
  h: PADDLE_H,
  dead: false,

  update(dt) {
    // La última fuente de entrada usada manda: si el ratón se ha movido desde
    // el frame anterior, manda el ratón; si no, mandan las flechas. Ambas
    // quedan siempre activas.
    if (mouseX !== null) {
      this.x = mouseX - this.w / 2;
      mouseX = null;                    // consumido: se rearma en el próximo mousemove
    } else {
      let dir = 0;
      if (keys['ArrowLeft']) dir -= 1;
      if (keys['ArrowRight']) dir += 1;
      this.x += dir * PADDLE_SPEED * dt;
    }

    this.x = clamp(this.x, 0, W - this.w);
  },

  draw() {
    drawSprite(ctx, 'paddle', this.x, this.y, this.w, this.h);
  },
};

// Componente horizontal del lanzamiento, como fracción de BALL_SPEED. La
// vertical se deriva para que el módulo sea siempre exactamente BALL_SPEED.
const LAUNCH_VX_RATIO = 0.5;

const ball = {
  x: 0,
  y: 0,
  w: BALL_SIZE,
  h: BALL_SIZE,
  vx: 0,
  vy: 0,
  stuck: true,          // pegada a la pala
  dead: false,

  // Devuelve la bola al estado pegado, centrada sobre la pala
  reset() {
    this.stuck = true;
    this.vx = 0;
    this.vy = 0;
    this.seguirPala();
  },

  seguirPala() {
    this.x = paddle.x + (paddle.w - this.w) / 2;
    this.y = paddle.y - this.h;
  },

  lanzar() {
    this.stuck = false;
    this.vx = BALL_SPEED * LAUNCH_VX_RATIO;
    this.vy = -BALL_SPEED * Math.sqrt(1 - LAUNCH_VX_RATIO * LAUNCH_VX_RATIO);
  },

  update(dt) {
    if (this.stuck) {
      this.seguirPala();
      if (pressed('Space')) this.lanzar();
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Rebote en los tres muros: solo se invierte el signo, el módulo de la
    // velocidad no cambia nunca. Se reposiciona sobre el muro para que no
    // pueda quedarse rebotando dentro de él.
    if (this.x < 0) {
      this.x = 0;
      this.vx = Math.abs(this.vx);
      play('bounce');
    } else if (this.x + this.w > W) {
      this.x = W - this.w;
      this.vx = -Math.abs(this.vx);
      play('bounce');
    }

    if (this.y < 0) {
      this.y = 0;
      this.vy = Math.abs(this.vy);
      play('bounce');
    }

    this.colisionarBloques();

    // Colisión con la pala: reflexión simple (solo se invierte vy). Se exige
    // vy > 0 para que solo cuente si la bola va bajando, y se reposiciona
    // justo encima de la pala para evitar reenganches en frames sucesivos.
    if (this.vy > 0 && colisionan(this, paddle)) {
      this.y = paddle.y - this.h;
      this.vy = -Math.abs(this.vy);
      play('bounce');
    }

    // Salir por abajo: la bola se pierde y vuelve a quedar pegada a la pala
    if (this.y > H) {
      this.perder();
    }
  },

  // Golpea como mucho un bloque por frame: invertir dos ejes en el mismo frame
  // dejaría la bola volviendo por donde vino.
  colisionarBloques() {
    for (const b of blocks) {
      if (b.dead || !colisionan(this, b)) continue;

      b.hits--;

      if (b.hits > 0) {
        // Bloque resistente que aguanta: no puntúa ni explota, solo cambia a un
        // color aleatorio de la paleta. Como el color es la clave compartida
        // con EXPLOSION_FRAMES, la explosión posterior sale coherente sola.
        b.color = ROW_COLORS[Math.floor(Math.random() * ROW_COLORS.length)];
        play('bounce');
      } else {
        b.dead = true;                     // el loop filtra los dead
        score += b.points;
        explosions.push(crearExplosion(b.x, b.y, b.w, b.h, b.color));
        play('break');
      }

      // El rebote ocurre en los dos casos.
      // Se invierte el eje de menor solape: es por donde ha entrado la bola
      const solapeX = Math.min(this.x + this.w, b.x + b.w) - Math.max(this.x, b.x);
      const solapeY = Math.min(this.y + this.h, b.y + b.h) - Math.max(this.y, b.y);

      if (solapeX < solapeY) {
        // Impacto lateral: se expulsa la bola por el lado y se invierte vx
        this.x += this.vx > 0 ? -solapeX : solapeX;
        this.vx = -this.vx;
      } else {
        // Impacto por arriba o por abajo: se expulsa en vertical y se invierte vy
        this.y += this.vy > 0 ? -solapeY : solapeY;
        this.vy = -this.vy;
      }

      return;
    }
  },

  // Bola perdida por abajo: cuesta una vida y vuelve pegada a la pala
  perder() {
    lives--;
    this.reset();
    if (lives <= 0) {
      lives = 0;
      screen = 'gameover';
    }
  },

  draw() {
    drawSprite(ctx, 'ball', this.x, this.y, this.w, this.h);
  },
};

function crearBloque(x, y, w, h, color, hits, points) {
  return {
    x, y, w, h,
    color,
    hits,               // golpes restantes: 1 en los normales, 2 en los grises
    points,             // puntos al romperse
    dead: false,

    update(dt) {
      // Los bloques son estáticos: no se autoeliminan, solo marcan dead
    },

    draw() {
      drawSprite(ctx, 'block_' + this.color, this.x, this.y, this.w, this.h);
    },
  };
}

// Construye los bloques de un layout. El tamaño de bloque se deriva repartiendo
// la zona de rejilla entre las filas y columnas del layout, así cualquier
// número de columnas encaja siempre dentro de la misma zona.
function crearBloques(layout) {
  const filas = layout.length;
  const columnas = layout[0].length;
  const blockW = GRID_W / columnas;
  const blockH = GRID_H / filas;

  const nuevos = [];
  for (let fila = 0; fila < filas; fila++) {
    for (let col = 0; col < columnas; col++) {
      const color = BLOCK_CHARS[layout[fila][col]];
      if (!color) continue;                       // '.' o carácter no reconocido: hueco

      const resistente = color === 'gray';
      nuevos.push(crearBloque(
        GRID_X + col * blockW,
        GRID_Y + fila * blockH,
        blockW,
        blockH,
        color,
        resistente ? HITS_RESISTENTE : 1,
        resistente ? POINTS_RESISTENTE : POINTS_PER_BLOCK
      ));
    }
  }
  return nuevos;
}

// Entidad efímera: nace al romperse un bloque, vive EXPLOSION_TIME y se marca
// dead sola. No colisiona con nada: es puramente visual.
function crearExplosion(x, y, w, h, color) {
  return {
    x, y, w, h,
    color,
    t: 0,                     // tiempo vivido en segundos
    dead: false,

    update(dt) {
      this.t += dt;
      if (this.t >= EXPLOSION_TIME) this.dead = true;
    },

    draw() {
      // El frame se deriva de t en cada draw, no se guarda: así no puede
      // desincronizarse del tiempo vivido. El clamp evita pedir un índice
      // fuera del array con un dt justo en el límite.
      const frames = EXPLOSION_FRAMES[this.color];
      const i = Math.min(
        Math.floor(this.t / EXPLOSION_TIME * frames.length),
        frames.length - 1
      );
      drawFrame(ctx, frames[i], this.x, this.y, this.w, this.h);
    },
  };
}

// ---------------------------------------------------------------------------
// Estado global
// ---------------------------------------------------------------------------

let blocks = [];              // el loop filtra los dead
let explosions = [];          // el loop filtra las dead, igual que blocks
let score = 0;                // acumula durante los tres niveles
let lives = LIVES_START;      // vuelve a LIVES_START al empezar cada nivel
let level = 0;                // índice en LEVELS
let screen = 'inicio';        // 'inicio' | 'jugando' | 'nivel' | 'victoria' | 'gameover'

// ---------------------------------------------------------------------------
// Bucle principal
// ---------------------------------------------------------------------------

function update(dt) {
  // Fuera del bloque de partida: silenciar funciona también con overlay
  if (pressed('KeyM')) muted = !muted;

  // Con un overlay en pantalla el juego no avanza: Space lo cierra. Desde
  // victoria o game over además reinicia; desde 'nivel' no, porque el nivel
  // siguiente ya está cargado.
  if (screen !== 'jugando') {
    if (pressed('Space')) {
      if (screen === 'victoria' || screen === 'gameover') reiniciar();
      screen = 'jugando';
    }
    return;
  }

  paddle.update(dt);
  ball.update(dt);
  blocks.forEach((b) => b.update(dt));
  explosions.forEach((e) => e.update(dt));

  // Ninguna entidad se autoelimina: el loop filtra las marcadas dead
  blocks = blocks.filter((b) => !b.dead);
  explosions = explosions.filter((e) => !e.dead);

  // El cambio de nivel (y la victoria) esperan a que se apague la explosión
  // del último bloque
  if (blocks.length === 0 && explosions.length === 0) {
    if (level < LEVELS.length - 1) {
      cargarNivel(level + 1);
      screen = 'nivel';
    } else {
      screen = 'victoria';
    }
  }
}

// Prepara un nivel: bloques, vidas y ancho de pala. La puntuación no se toca,
// porque acumula durante toda la partida.
function cargarNivel(i) {
  level = i;
  blocks = crearBloques(LEVELS[i]);
  explosions = [];
  lives = LIVES_START;
  paddle.w = PADDLE_WIDTHS[i];
  paddle.x = clamp(paddle.x, 0, W - paddle.w);   // al estrecharse podría quedar fuera
  ball.reset();
}

// Deja la partida como recién empezada, desde el primer nivel
function reiniciar() {
  score = 0;
  cargarNivel(0);
}

// Textos de cada overlay: título, subtítulo y pie. Son funciones porque el
// cartel de nivel depende del nivel en curso.
const OVERLAYS = {
  inicio:   () => ['ARKANOID', '', 'Pulsa ESPACIO para jugar'],
  nivel:    () => ['NIVEL ' + (level + 1), 'Puntuación: ', 'Pulsa ESPACIO para continuar'],
  victoria: () => ['¡VICTORIA!', 'Puntuación: ', 'Pulsa ESPACIO para volver a jugar'],
  gameover: () => ['GAME OVER', 'Puntuación: ', 'Pulsa ESPACIO para volver a jugar'],
};

function drawOverlay() {
  const textos = OVERLAYS[screen];
  if (!textos) return;                   // 'jugando': sin overlay

  const [titulo, subtitulo, pie] = textos();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = 'bold 56px monospace';
  ctx.fillText(titulo, W / 2, H / 2 - 60);

  if (subtitulo) {
    ctx.font = '24px monospace';
    ctx.fillText(subtitulo + score, W / 2, H / 2);
  }

  ctx.font = '20px monospace';
  ctx.fillText(pie, W / 2, H / 2 + 60);
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '20px monospace';
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.fillText('PUNTOS ' + score, 20, 30);
  ctx.fillText('NIVEL ' + (level + 1) + '/' + LEVELS.length, 200, 30);

  if (muted) {
    ctx.textAlign = 'center';
    ctx.fillText('SIN SONIDO', W / 2 + 60, 30);
  }

  drawLives();
}

// Vidas como sprites de bola alineados a la derecha; si hay muchas, una bola y "xN"
function drawLives() {
  const size = 18, gap = 6, maxIconos = 6;

  if (lives > maxIconos) {
    ctx.textAlign = 'right';
    ctx.fillText('x' + lives, W - 20, 30);
    const anchoTexto = ctx.measureText('x' + lives).width;
    drawSprite(ctx, 'ball', W - 20 - anchoTexto - gap - size, 30 - size / 2, size, size);
    return;
  }

  for (let i = 0; i < lives; i++) {
    const x = W - 20 - size - i * (size + gap);
    drawSprite(ctx, 'ball', x, 30 - size / 2, size, size);
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  blocks.forEach((b) => b.draw());
  paddle.draw();
  ball.draw();
  // Encima de pala y bola: el efecto se ve entero aunque la bola pase por ahí
  explosions.forEach((e) => e.draw());
  drawHUD();
  drawOverlay();
}

let lastTs = 0;

function loop(ts) {
  const dt = Math.min((ts - lastTs) / 1000, DT_MAX);
  lastTs = ts;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

// El spritesheet se carga de forma asíncrona: drawSprite/drawFrame son no-op
// hasta que la imagen está lista, así que el juego arranca dentro del callback.
loadSpritesheet(() => {
  cargarNivel(0);
  lastTs = performance.now();
  requestAnimationFrame(loop);
});
