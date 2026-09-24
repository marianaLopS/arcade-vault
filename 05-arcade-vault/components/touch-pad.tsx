"use client";
import { useEffect, useRef } from "react";
import type { TouchControls } from "@/lib/games/registry";
/** Espera antes de empezar a repetir una flecha mantenida (sólo con `repeat`). */
const REPEAT_DELAY = 200; // ms
/** Cadencia de la repetición una vez arrancada. */
const REPEAT_INTERVAL = 70; // ms
/** Pulso de vibración al pulsar, donde el navegador lo soporte. */
const VIBRATE_MS = 10;
type OnKey = (code: string, down: boolean) => void;
/**
 * Estado de un botón pulsado. Mutable y estable: vive en una ref. `el` lleva el
 * atributo `data-on` mientras está pulsado: con el `preventDefault` del toque,
 * `:active` no es fiable en móvil y el CSS se engancha a ese atributo.
 */
type Held = {
  on: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  el: HTMLButtonElement | null;
};
/** Suelta el botón si estaba pulsado: corta la repetición y manda un único keyup. */
function releaseHeld(h: Held, code: string, onKey: OnKey) {
  h.el?.removeAttribute("data-on");
  if (h.timer !== null) {
    clearTimeout(h.timer);
    h.timer = null;
  }
  if (!h.on) return;
  h.on = false;
  onKey(code, false);
}
const DPAD = [
  { code: "ArrowUp", dir: "up", glyph: "▲", label: "Arriba" },
  { code: "ArrowLeft", dir: "left", glyph: "◀", label: "Izquierda" },
  { code: "ArrowRight", dir: "right", glyph: "▶", label: "Derecha" },
  { code: "ArrowDown", dir: "down", glyph: "▼", label: "Abajo" },
] as const;
function PadButton({
  code,
  repeat,
  disabled,
  onKey,
  className,
  label,
  children,
}: {
  code: string;
  repeat: boolean;
  disabled: boolean;
  onKey: OnKey;
  className: string;
  label: string;
  children: React.ReactNode;
}) {
  const held = useRef<Held>({ on: false, timer: null, el: null });
  // `onKey` cambia en cada render del padre; los temporizadores leen la última.
  const onKeyRef = useRef(onKey);
  useEffect(() => {
    onKeyRef.current = onKey;
  });
  // En pausa o fin de partida no se emite nada y se suelta lo que hubiera.
  useEffect(() => {
    if (disabled) releaseHeld(held.current, code, onKeyRef.current);
  }, [disabled, code]);
  // Desmontar con el dedo encima no puede dejar una tecla pulsada en el motor.
  useEffect(() => {
    const h = held.current;
    const keyRef = onKeyRef;
    return () => releaseHeld(h, code, keyRef.current);
  }, [code]);
  const scheduleRepeat = (delay: number) => {
    held.current.timer = setTimeout(() => {
      onKeyRef.current(code, true);
      scheduleRepeat(REPEAT_INTERVAL);
    }, delay);
  };
  const release = () => releaseHeld(held.current, code, onKeyRef.current);
  return (
    <button
      type="button"
      tabIndex={-1}
      className={className}
      aria-label={label}
      aria-disabled={disabled || undefined}
      // preventDefault: el botón no se lleva el foco. Si el canvas lo perdiera,
      // su `blur` soltaría en el motor todas las teclas mantenidas.
      onPointerDown={(e) => {
        e.preventDefault();
        if (disabled || held.current.on) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        held.current.on = true;
        held.current.el = e.currentTarget;
        e.currentTarget.setAttribute("data-on", "");
        onKeyRef.current(code, true);
        navigator.vibrate?.(VIBRATE_MS);
        if (repeat) scheduleRepeat(REPEAT_DELAY);
      }}
      onMouseDown={(e) => e.preventDefault()}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      {children}
    </button>
  );
}
/**
 * Mando virtual común a todos los juegos: cruceta a la izquierda y hasta dos
 * botones de acción a la derecha. No sabe de motores: traduce toques en
 * `onKey(code, down)` y GamePlayer los reenvía al canvas como teclas.
 * Siempre está en el DOM; el CSS lo muestra sólo con `pointer: coarse`.
 */
export function TouchPad({
  controls,
  disabled,
  onKey,
}: {
  controls: TouchControls;
  disabled: boolean;
  onKey: OnKey;
}) {
  const { a, b, repeat = false } = controls;
  return (
    <div
      className="touch-pad"
      data-disabled={disabled || undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="touch-dpad">
        {DPAD.map((d) => (
          <PadButton
            key={d.code}
            code={d.code}
            repeat={repeat}
            disabled={disabled}
            onKey={onKey}
            className={`touch-btn touch-dir ${d.dir}`}
            label={d.label}
          >
            <span aria-hidden="true">{d.glyph}</span>
          </PadButton>
        ))}
      </div>
      {(a || b) && (
        <div className="touch-actions">
          {/* B a la izquierda y A a la derecha, como en un mando clásico. */}
          {b && (
            <div className="touch-action b">
              <PadButton
                code={b.code}
                repeat={false}
                disabled={disabled}
                onKey={onKey}
                className="touch-btn touch-ab"
                label={b.label}
              >
                <span aria-hidden="true">B</span>
              </PadButton>
              <span className="touch-label" aria-hidden="true">
                {b.label}
              </span>
            </div>
          )}
          {a && (
            <div className="touch-action a">
              <PadButton
                code={a.code}
                repeat={false}
                disabled={disabled}
                onKey={onKey}
                className="touch-btn touch-ab"
                label={a.label}
              >
                <span aria-hidden="true">A</span>
              </PadButton>
              <span className="touch-label" aria-hidden="true">
                {a.label}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
