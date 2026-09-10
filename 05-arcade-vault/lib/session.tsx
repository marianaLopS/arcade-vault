"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

export type User = { name: string };

const USER_KEY = "av_user";

// ---------------------------------------------------------------------------
// Store externo sobre localStorage.
//
// El servidor renderiza siempre "sin sesión" (getServerSnapshot → null) y React
// vuelve a leer el valor real tras la hidratación, así que no hay desajuste.
// ---------------------------------------------------------------------------

/** `undefined` = todavía no se ha leído localStorage en este cliente. */
let cachedUser: User | null | undefined = undefined;
const listeners = new Set<() => void>();

function readUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Devuelve siempre la misma referencia mientras la sesión no cambie. */
function getSnapshot(): User | null {
  if (cachedUser === undefined) cachedUser = readUser();
  return cachedUser;
}

function getServerSnapshot(): User | null {
  return null;
}

function setUser(next: User | null) {
  cachedUser = next;
  try {
    if (next) localStorage.setItem(USER_KEY, JSON.stringify(next));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // localStorage deshabilitado: la sesión vive sólo en memoria.
  }
  listeners.forEach((l) => l());
}

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

type SessionValue = {
  user: User | null;
  signIn: (user: User) => void;
  signOut: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const user = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const signIn = useCallback((next: User) => setUser(next), []);
  const signOut = useCallback(() => setUser(null), []);

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return value;
}
