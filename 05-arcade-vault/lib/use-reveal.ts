"use client";

import { useEffect } from "react";

/**
 * Revela las secciones marcadas con `.reveal` a medida que entran en pantalla,
 * añadiéndoles la clase `.in`. Es el efecto de `home.jsx` y `about.jsx` del
 * template, con dos añadidos: se comparte entre ambas páginas y respeta
 * `prefers-reduced-motion`.
 */
export function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    if (els.length === 0) return;

    // Sin animación: todo visible desde el primer momento, sin observar nada.
    const sinMovimiento =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (sinMovimiento || typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}
