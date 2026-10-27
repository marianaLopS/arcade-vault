"use client";
import { useReveal } from "@/lib/use-reveal";
/** Monta `useReveal()` desde una página de servidor. No pinta nada. */
export function Reveal() {
  useReveal();
  return null;
}
