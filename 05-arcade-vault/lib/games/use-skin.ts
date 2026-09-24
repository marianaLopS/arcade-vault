"use client";
// Skin elegido por juego, persistido en localStorage (`av-skin-<slug>`).
//
// Store externo con useSyncExternalStore, como lib/session.tsx: el servidor
// renderiza siempre DEFAULT_SKIN y React relee el valor real tras hidratar, así
// que no hay desajuste ni setState dentro de un efecto.
import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_SKIN, isSkinId, type SkinId } from "@/lib/games/skins";
const storageKey = (slug: string) => `av-skin-${slug}`;
/** Caché en memoria: también sirve de respaldo si localStorage falla. */
const cache = new Map<string, SkinId>();
const listeners = new Set<() => void>();
function readSkin(slug: string): SkinId {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    return isSkinId(raw) ? raw : DEFAULT_SKIN;
  } catch {
    return DEFAULT_SKIN;
  }
}
function writeSkin(slug: string, skin: SkinId) {
  cache.set(slug, skin);
  try {
    localStorage.setItem(storageKey(slug), skin);
  } catch {
    // localStorage deshabilitado: la elección vive sólo en memoria.
  }
  listeners.forEach((l) => l());
}
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
export function useSkin(slug: string): [SkinId, (skin: SkinId) => void] {
  const getSnapshot = useCallback(() => {
    let skin = cache.get(slug);
    if (skin === undefined) {
      skin = readSkin(slug);
      cache.set(slug, skin);
    }
    return skin;
  }, [slug]);
  const skin = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_SKIN);
  const setSkin = useCallback((next: SkinId) => writeSkin(slug, next), [slug]);
  return [skin, setSkin];
}
