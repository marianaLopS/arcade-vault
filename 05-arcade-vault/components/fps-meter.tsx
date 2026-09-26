"use client";
// Medidor de rendimiento para desarrollo (SPEC 13). Sólo se activa con `?fps=1`
// en la URL: sin el parámetro no pinta nada ni arranca ningún bucle.
//
// Mide los frames de la página con un requestAnimationFrame propio, no los del
// motor: así cuenta todo lo que ve el jugador (motor, React y CSS). Los datos
// se escriben en el DOM y en `window.__avFps`, nunca en estado de React: el
// medidor no debe provocar los renders que cuenta.
import { useEffect, useRef, useSyncExternalStore } from "react";
declare global {
  interface Window {
    __avFps?: {
      fps: number;
      p95: number;
      long50: number;
      /** Renders de GamePlayer desde el montaje. */
      renders: number;
      /** Heap JS usado, en MB; null fuera de Chromium. */
      heapMB: number | null;
      reset: () => void;
    };
  }
}
/** `performance.memory` sólo existe en Chromium y no está en los tipos del DOM. */
type PerformanceWithMemory = Performance & { memory?: { usedJSHeapSize: number } };
/** Frames guardados para el p95. */
const WINDOW = 120;
/** Cada cuánto se recalcula fps y se repinta el overlay, en ms. */
const REFRESH_MS = 500;
const noop = () => () => {};
function isEnabled() {
  return new URLSearchParams(window.location.search).get("fps") === "1";
}
export function FpsMeter({ renders }: { renders: React.RefObject<number> }) {
  // Lectura de la URL sin estado: el servidor dice "apagado" y el cliente
  // relee tras hidratar, como lib/session.tsx.
  const enabled = useSyncExternalStore(noop, isEnabled, () => false);
  const outRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (!enabled) return;
    const frames = new Float64Array(WINDOW);
    const sorted = new Float64Array(WINDOW);
    let count = 0;
    let long50 = 0;
    let windowFrames = 0;
    let windowStart = performance.now();
    let last = windowStart;
    let rafId = 0;
    const stats = {
      fps: 0,
      p95: 0,
      long50: 0,
      renders: renders.current,
      heapMB: null as number | null,
      reset: () => {
        count = 0;
        long50 = 0;
        windowFrames = 0;
        windowStart = last = performance.now();
      },
    };
    window.__avFps = stats;
    function refresh(now: number) {
      stats.fps = Math.round((windowFrames * 1000) / (now - windowStart));
      const n = Math.min(count, WINDOW);
      sorted.set(frames);
      const s = sorted.subarray(0, n).sort();
      stats.p95 = n ? Math.round(s[Math.floor(n * 0.95)] * 10) / 10 : 0;
      stats.long50 = long50;
      stats.renders = renders.current;
      const mem = (performance as PerformanceWithMemory).memory;
      stats.heapMB = mem ? Math.round(mem.usedJSHeapSize / 1e5) / 10 : null;
      windowFrames = 0;
      windowStart = now;
      const out = outRef.current;
      if (out)
        out.textContent =
          `FPS ${stats.fps}  P95 ${stats.p95}ms  >50ms ${stats.long50}\n` +
          `RENDERS ${stats.renders}  HEAP ${stats.heapMB ?? "—"}MB`;
    }
    function tick(now: number) {
      const dt = now - last;
      last = now;
      frames[count % WINDOW] = dt;
      count++;
      windowFrames++;
      if (dt > 50) long50++;
      if (now - windowStart >= REFRESH_MS) refresh(now);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      delete window.__avFps;
    };
  }, [enabled, renders]);
  if (!enabled) return null;
  return <pre ref={outRef} className="fps-meter" aria-hidden="true" />;
}
