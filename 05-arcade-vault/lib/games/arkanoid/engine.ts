// Arkanoid — port del `game.js` original de ../04-arkanoid/ (ver SPEC 09).
//
// Diferencias deliberadas con el original:
//   · El estado de la partida vive en la clausura de createArkanoidGame, no en
//     variables de módulo: dos montajes del componente no comparten nada.
//   · Las entidades no leen estado global: el contexto, el spritesheet, el
//     teclado, el ratón y el sonido les llegan por parámetro.
//   · El canvas no pinta puntos, nivel ni vidas: eso es el HUD de la plataforma
//     (components/game-player.tsx). Sólo queda el rótulo SIN SONIDO.
//   · No hay overlays de inicio, nivel, victoria ni GAME OVER, ni reinicio con
//     Espacio: la bola pegada a la pala ya es la pantalla de espera y el fin de
//     partida lo lleva el modal.
//   · El spritesheet, los sonidos y los listeners se crean dentro de la
//     factoría y mueren con destroy(); los listeners van sobre el canvas.
// Todo lo demás —constantes, niveles, física, puntuación— es idéntico al original.
import type { GameCallbacks, GameEngine, GameFactory } from "@/lib/games/engine";
import type { BlockColor, SpriteFrame } from "@/lib/games/arkanoid/sprites";
import { EXPLOSION_DURATION, EXPLOSION_FRAMES, SPRITES } from "@/lib/games/arkanoid/sprites";
// ── Mundo ─────────────────────────────────────────────────────────────────────
const W = 800;
const H = 600;
// ── Constantes ────────────────────────────────────────────────────────────────
const PADDLE_H = 14;
const PADDLE_SPEED = 520; // px/s
const BALL_SIZE = 12;
const BALL_SPEED = 340; // px/s
// Zona que ocupa la rejilla. El tamaño de cada bloque NO es constante: se
// deriva del layout del nivel repartiendo esta zona entre sus filas y columnas.
const GRID_X = 80; // origen de la rejilla
const GRID_Y = 70;
const GRID_W = 640; // tamaño de la zona
const GRID_H = 144;
const ROW_COLORS: BlockColor[] = ["red", "yellow", "green", "cyan", "magenta", "hotpink"];
const LIVES_START = 3;
const POINTS_PER_BLOCK = 10;
// Bloques resistentes (grises): aguantan dos golpes y valen el doble
const HITS_RESISTENTE = 2;
const POINTS_RESISTENTE = 20;
const DT_MAX = 0.05; // clamp de dt en segundos
// Cada carácter de un layout es un bloque; '.' (y cualquier carácter no
// listado aquí) es un hueco. Los valores son claves de SPRITES.blocks y de
// EXPLOSION_FRAMES: ese acoplamiento hay que mantenerlo.
const BLOCK_CHARS: Record<string, BlockColor> = {
  R: "red",
  Y: "yellow",
  G: "green",
  C: "cyan",
  M: "magenta",
  P: "hotpink",
  X: "gray", // resistente: 2 golpes
};
// Un ancho de pala por nivel: la dificultad sube sin tocar la física de la bola
const PADDLE_WIDTHS = [96, 84, 72];
const PADDLE_Y = H - 40;
// Componente horizontal del lanzamiento, como fracción de BALL_SPEED. La
// vertical se deriva para que el módulo sea siempre exactamente BALL_SPEED.
const LAUNCH_VX_RATIO = 0.5;
// EXPLOSION_DURATION (150 ms) es la duración TOTAL de los 4 frames, no la de
// cada uno. En segundos, porque todo el juego trabaja con dt en segundos.
const EXPLOSION_TIME = EXPLOSION_DURATION / 1000; // 0.15 s de animación
const SOUND_POOL = 4; // instancias por sonido: solo se cortan con >4 solapadas
const SOUND_VOLUME = 0.5; // fijo en código, sin control de usuario
// ── Niveles ───────────────────────────────────────────────────────────────────
// Un array de strings por nivel. Máximo 6 filas, todas de la misma longitud.
const LEVELS: string[][] = [
  // Nivel 1 — la rejilla llena, sin grises
  ["RRRRRRRRRR", "YYYYYYYYYY", "GGGGGGGGGG", "CCCCCCCCCC", "MMMMMMMMMM", "PPPPPPPPPP"],
  // Nivel 2 — aparecen los grises y algún hueco
  ["..XXXXXX..", ".RRRRRRRR.", "YYYYYYYYYY", ".GGGGGGGG.", "..CCCCCC..", "...XXXX..."],
  // Nivel 3 — 12 columnas (bloques más estrechos) y más grises
  ["X.RRRRRRRR.X", "X.YYYYYYYY.X", "..XXXXXXXX..", "M..GGGGGG..M", "MM..CCCC..MM", "XXX......XXX"],
];
// ── Utils ─────────────────────────────────────────────────────────────────────
type Rect = { x: number; y: number; w: number; h: number };
type Sheet = CanvasImageSource | null;
type SoundName = "bounce" | "break";
function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}
// Colisión AABB entre dos entidades con x/y/w/h
function colisionan(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
// No-op mientras el spritesheet no ha cargado, como en el original.
function drawFrame(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  f: SpriteFrame,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (!sheet) return;
  ctx.drawImage(sheet, f.sx, f.sy, f.sw, f.sh, x, y, w, h);
}
// ── Pala ──────────────────────────────────────────────────────────────────────
class Paddle {
  x = (W - PADDLE_WIDTHS[0]) / 2;
  y = PADDLE_Y;
  w = PADDLE_WIDTHS[0]; // se reasigna en cada cargarNivel()
  h = PADDLE_H;
  dead = false;
  // La última fuente de entrada usada manda: si el ratón se ha movido desde el
  // frame anterior (`mouseX` no es null), manda el ratón; si no, las flechas.
  // Quien llama consume `mouseX` después.
  update(dt: number, keys: Record<string, boolean>, mouseX: number | null) {
    if (mouseX !== null) {
      this.x = mouseX - this.w / 2;
    } else {
      let dir = 0;
      if (keys["ArrowLeft"]) dir -= 1;
      if (keys["ArrowRight"]) dir += 1;
      this.x += dir * PADDLE_SPEED * dt;
    }
    this.x = clamp(this.x, 0, W - this.w);
  }
  draw(ctx: CanvasRenderingContext2D, sheet: Sheet) {
    drawFrame(ctx, sheet, SPRITES.paddle, this.x, this.y, this.w, this.h);
  }
}
// ── Bloque ────────────────────────────────────────────────────────────────────
class Block {
  x: number;
  y: number;
  w: number;
  h: number;
  color: BlockColor;
  hits: number; // golpes restantes: 1 en los normales, 2 en los grises
  points: number; // puntos al romperse
  dead = false;
  constructor(
    x: number,
    y: number,
    w: number,
    h: number,
    color: BlockColor,
    hits: number,
    points: number,
  ) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.color = color;
    this.hits = hits;
    this.points = points;
  }
  // Los bloques son estáticos: no se autoeliminan, solo marcan dead
  update() {}
  draw(ctx: CanvasRenderingContext2D, sheet: Sheet) {
    drawFrame(ctx, sheet, SPRITES.blocks[this.color], this.x, this.y, this.w, this.h);
  }
}
// Construye los bloques de un layout. El tamaño de bloque se deriva repartiendo
// la zona de rejilla entre las filas y columnas del layout.
function crearBloques(layout: string[]): Block[] {
  const filas = layout.length;
  const columnas = layout[0].length;
  const blockW = GRID_W / columnas;
  const blockH = GRID_H / filas;
  const nuevos: Block[] = [];
  for (let fila = 0; fila < filas; fila++) {
    for (let col = 0; col < columnas; col++) {
      const color = BLOCK_CHARS[layout[fila][col]];
      if (!color) continue; // '.' o carácter no reconocido: hueco
      const resistente = color === "gray";
      nuevos.push(
        new Block(
          GRID_X + col * blockW,
          GRID_Y + fila * blockH,
          blockW,
          blockH,
          color,
          resistente ? HITS_RESISTENTE : 1,
          resistente ? POINTS_RESISTENTE : POINTS_PER_BLOCK,
        ),
      );
    }
  }
  return nuevos;
}
// ── Explosión ─────────────────────────────────────────────────────────────────
// Entidad efímera: nace al romperse un bloque, vive EXPLOSION_TIME y se marca
// dead sola. No colisiona con nada: es puramente visual.
class Explosion {
  x: number;
  y: number;
  w: number;
  h: number;
  color: BlockColor;
  t = 0; // tiempo vivido en segundos
  dead = false;
  constructor(b: Block) {
    this.x = b.x;
    this.y = b.y;
    this.w = b.w;
    this.h = b.h;
    this.color = b.color;
  }
  update(dt: number) {
    this.t += dt;
    if (this.t >= EXPLOSION_TIME) this.dead = true;
  }
  draw(ctx: CanvasRenderingContext2D, sheet: Sheet) {
    // El frame se deriva de t en cada draw; el clamp evita un índice fuera del
    // array con un dt justo en el límite.
    const frames = EXPLOSION_FRAMES[this.color];
    const i = Math.min(Math.floor((this.t / EXPLOSION_TIME) * frames.length), frames.length - 1);
    drawFrame(ctx, sheet, frames[i], this.x, this.y, this.w, this.h);
  }
}
// ── Bola ──────────────────────────────────────────────────────────────────────
class Ball {
  x = 0;
  y = 0;
  w = BALL_SIZE;
  h = BALL_SIZE;
  vx = 0;
  vy = 0;
  stuck = true; // pegada a la pala
  dead = false;
  // Devuelve la bola al estado pegado, centrada sobre la pala
  reset(paddle: Paddle) {
    this.stuck = true;
    this.vx = 0;
    this.vy = 0;
    this.seguirPala(paddle);
  }
  seguirPala(paddle: Paddle) {
    this.x = paddle.x + (paddle.w - this.w) / 2;
    this.y = paddle.y - this.h;
  }
  lanzar() {
    this.stuck = false;
    this.vx = BALL_SPEED * LAUNCH_VX_RATIO;
    this.vy = -BALL_SPEED * Math.sqrt(1 - LAUNCH_VX_RATIO * LAUNCH_VX_RATIO);
  }
  /**
   * Avanza la bola. `launch` consume la pulsación de Espacio sólo si la bola
   * está pegada. Devuelve true si la bola se ha perdido por abajo: quien llama
   * resta la vida; la bola ya ha vuelto a la pala.
   */
  update(
    dt: number,
    paddle: Paddle,
    blocks: Block[],
    launch: () => boolean,
    play: (s: SoundName) => void,
    onBreak: (b: Block) => void,
  ): boolean {
    if (this.stuck) {
      this.seguirPala(paddle);
      if (launch()) this.lanzar();
      return false;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Rebote en los tres muros: solo se invierte el signo, el módulo de la
    // velocidad no cambia nunca. Se reposiciona sobre el muro.
    if (this.x < 0) {
      this.x = 0;
      this.vx = Math.abs(this.vx);
      play("bounce");
    } else if (this.x + this.w > W) {
      this.x = W - this.w;
      this.vx = -Math.abs(this.vx);
      play("bounce");
    }
    if (this.y < 0) {
      this.y = 0;
      this.vy = Math.abs(this.vy);
      play("bounce");
    }
    this.colisionarBloques(blocks, play, onBreak);
    // Colisión con la pala: reflexión simple (solo se invierte vy). Solo cuenta
    // si la bola va bajando, y se reposiciona justo encima de la pala.
    if (this.vy > 0 && colisionan(this, paddle)) {
      this.y = paddle.y - this.h;
      this.vy = -Math.abs(this.vy);
      play("bounce");
    }
    // Salir por abajo: la bola se pierde y vuelve a quedar pegada a la pala
    if (this.y > H) {
      this.reset(paddle);
      return true;
    }
    return false;
  }
  // Golpea como mucho un bloque por frame: invertir dos ejes en el mismo frame
  // dejaría la bola volviendo por donde vino.
  colisionarBloques(blocks: Block[], play: (s: SoundName) => void, onBreak: (b: Block) => void) {
    for (const b of blocks) {
      if (b.dead || !colisionan(this, b)) continue;
      b.hits--;
      if (b.hits > 0) {
        // Resistente que aguanta: no puntúa ni explota, cambia a un color
        // aleatorio de la paleta (y la explosión posterior sale de ese color).
        b.color = ROW_COLORS[Math.floor(Math.random() * ROW_COLORS.length)];
        play("bounce");
      } else {
        b.dead = true; // el loop filtra los dead
        onBreak(b);
        play("break");
      }
      // El rebote ocurre en los dos casos. Se invierte el eje de menor solape:
      // es por donde ha entrado la bola.
      const solapeX = Math.min(this.x + this.w, b.x + b.w) - Math.max(this.x, b.x);
      const solapeY = Math.min(this.y + this.h, b.y + b.h) - Math.max(this.y, b.y);
      if (solapeX < solapeY) {
        this.x += this.vx > 0 ? -solapeX : solapeX;
        this.vx = -this.vx;
      } else {
        this.y += this.vy > 0 ? -solapeY : solapeY;
        this.vy = -this.vy;
      }
      return;
    }
  }
  draw(ctx: CanvasRenderingContext2D, sheet: Sheet) {
    drawFrame(ctx, sheet, SPRITES.ball, this.x, this.y, this.w, this.h);
  }
}
// ── Motor ─────────────────────────────────────────────────────────────────────
const SPRITESHEET_SRC = "/juegos/arkanoid/spritesheet-breakout.png";
const SOUND_SRC: Record<SoundName, string> = {
  bounce: "/juegos/arkanoid/sounds/ball-bounce.mp3",
  break: "/juegos/arkanoid/sounds/break-sound.mp3",
};
/** Teclas que el juego consume; con el canvas enfocado no hacen scroll. */
const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "Space", "KeyM"]);
export const createArkanoidGame: GameFactory = (
  canvas: HTMLCanvasElement,
  callbacks: GameCallbacks,
): GameEngine => {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("El canvas de Arkanoid no expone un contexto 2D");
  // Anotado explícito: dentro de las clausuras de abajo se pierde el estrechamiento.
  const ctx: CanvasRenderingContext2D = ctx2d;
  canvas.width = W;
  canvas.height = H;
  // Estado de la partida — en la clausura, nunca en el módulo.
  const paddle = new Paddle();
  const ball = new Ball();
  let blocks: Block[] = []; // el loop filtra los dead
  let explosions: Explosion[] = []; // el loop filtra las dead, igual que blocks
  let score = 0; // acumula durante los tres niveles
  let lives = LIVES_START; // vuelve a LIVES_START al empezar cada nivel
  let level = 0; // índice en LEVELS
  let state: "playing" | "gameover" = "playing";
  // Bucle
  let rafId: number | null = null;
  let lastTime: number | null = null;
  let destroyed = false;
  // Entrada
  const keys: Record<string, boolean> = {};
  const justPressed: Record<string, boolean> = {};
  function pressed(code: string) {
    const val = justPressed[code];
    justPressed[code] = false;
    return !!val;
  }
  // Ratón en coordenadas de mundo, o null si no se ha movido desde el último frame.
  let mouseX: number | null = null;
  // ── Spritesheet ────────────────────────────────────────────────────────────
  // Carga asíncrona. Hasta que llega, draw() pinta negro y update() no avanza.
  // Como el original, se copia a un canvas fuera de pantalla.
  let sheet: HTMLCanvasElement | null = null;
  const rawImg = new Image();
  rawImg.onload = () => {
    if (destroyed) return;
    const oc = document.createElement("canvas");
    oc.width = rawImg.width;
    oc.height = rawImg.height;
    oc.getContext("2d")?.drawImage(rawImg, 0, 0);
    sheet = oc;
    if (rafId === null) draw(); // pausado: al menos se ve el tablero
  };
  rawImg.onerror = () => console.error("No se pudo cargar el spritesheet de Arkanoid");
  rawImg.src = SPRITESHEET_SRC;
  // ── Sonido ─────────────────────────────────────────────────────────────────
  // Cada sonido precarga varias instancias y las usa en rotación: con una sola,
  // romper varios bloques seguidos solo dejaría oír el último.
  function crearSonido(ruta: string) {
    const pool: HTMLAudioElement[] = [];
    for (let i = 0; i < SOUND_POOL; i++) {
      const audio = new Audio(ruta);
      audio.volume = SOUND_VOLUME;
      pool.push(audio);
    }
    return { pool, i: 0 };
  }
  const sonidos = {
    bounce: crearSonido(SOUND_SRC.bounce),
    break: crearSonido(SOUND_SRC.break),
  };
  let muted = false; // tecla M; no se persiste entre sesiones
  function play(nombre: SoundName) {
    if (muted || destroyed) return;
    const sonido = sonidos[nombre];
    const audio = sonido.pool[sonido.i];
    sonido.i = (sonido.i + 1) % sonido.pool.length;
    audio.currentTime = 0;
    // El navegador rechaza la reproducción hasta la primera interacción: se ignora.
    audio.play().catch(() => {});
  }
  function silenciarTodo() {
    for (const s of Object.values(sonidos)) s.pool.forEach((a) => a.pause());
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
    // El HUD cuenta los niveles desde 1; LEVELS se indexa desde 0.
    if (level !== lastLevel) {
      lastLevel = level;
      callbacks.onLevel(level + 1);
    }
  }
  // ── Partida ────────────────────────────────────────────────────────────────
  // Prepara un nivel: bloques, vidas y ancho de pala. La puntuación no se toca.
  function cargarNivel(i: number) {
    level = i;
    blocks = crearBloques(LEVELS[i]);
    explosions = [];
    lives = LIVES_START;
    paddle.w = PADDLE_WIDTHS[i];
    paddle.x = clamp(paddle.x, 0, W - paddle.w); // al estrecharse podría quedar fuera
    ball.reset(paddle);
  }
  // Deja la partida como recién empezada, desde el primer nivel
  function initGame() {
    score = 0;
    state = "playing";
    cargarNivel(0);
    emit();
  }
  function update(dt: number) {
    if (pressed("KeyM")) muted = !muted;
    if (!sheet || state !== "playing") return;
    paddle.update(dt, keys, mouseX);
    mouseX = null; // consumido: se rearma en el próximo mousemove
    const perdida = ball.update(
      dt,
      paddle,
      blocks,
      () => pressed("Space"),
      play,
      (b) => {
        score += b.points;
        explosions.push(new Explosion(b));
      },
    );
    if (perdida) {
      lives--;
      if (lives <= 0) {
        lives = 0;
        state = "gameover";
        return;
      }
    }
    explosions.forEach((e) => e.update(dt));
    // Ninguna entidad se autoelimina: el loop filtra las marcadas dead
    blocks = blocks.filter((b) => !b.dead);
    explosions = explosions.filter((e) => !e.dead);
    // El cambio de nivel (y la victoria) esperan a que se apague la explosión
    // del último bloque. La victoria acaba la partida igual que perder.
    if (blocks.length === 0 && explosions.length === 0) {
      if (level < LEVELS.length - 1) cargarNivel(level + 1);
      else state = "gameover";
    }
  }
  function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    blocks.forEach((b) => b.draw(ctx, sheet));
    paddle.draw(ctx, sheet);
    ball.draw(ctx, sheet);
    // Encima de pala y bola: el efecto se ve entero aunque la bola pase por ahí
    explosions.forEach((e) => e.draw(ctx, sheet));
    if (muted) {
      ctx.fillStyle = "#fff";
      ctx.font = "20px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SIN SONIDO", W / 2 + 60, 30);
    }
  }
  // ── Bucle principal ────────────────────────────────────────────────────────
  function loop(ts: number) {
    // dt capado a DT_MAX: volver de una pestaña en segundo plano no atraviesa la pala.
    const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, DT_MAX);
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
    // `state === "gameover"` frena un resume() posterior al fin de partida.
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
  /** Al perder el foco se sueltan todas las teclas: la pala no se queda corriendo. */
  function onBlur() {
    for (const code of Object.keys(keys)) keys[code] = false;
    for (const code of Object.keys(justPressed)) justPressed[code] = false;
    mouseX = null;
  }
  function onMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    // El canvas está estirado por CSS: se normaliza al espacio de mundo.
    mouseX = (e.clientX - rect.left) * (W / rect.width);
  }
  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("blur", onBlur);
  canvas.addEventListener("mousemove", onMouseMove);
  initGame();
  draw();
  return {
    start: startLoop,
    pause() {
      stopLoop();
      silenciarTodo();
    },
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
      rawImg.onload = null;
      rawImg.onerror = null;
      silenciarTodo();
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("blur", onBlur);
      canvas.removeEventListener("mousemove", onMouseMove);
    },
  };
};
