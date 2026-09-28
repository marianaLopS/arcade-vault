"use client";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { cerrarSesion } from "@/app/acceso/actions";
import { createClient } from "@/lib/supabase/client";
/** `name` es `profiles.username`, ya en mayúsculas para pintarlo tal cual. */
export type User = { id: string; name: string };
type SessionValue = { user: User | null; loading: boolean; signOut: () => Promise<void> };
/** Si el perfil no se puede leer, el usuario sigue con sesión bajo este nombre. */
const NOMBRE_SIN_PERFIL = "JUGADOR";
const SessionContext = createContext<SessionValue | null>(null);
/**
 * Sesión de Supabase Auth para Client Components (SPEC 14).
 *
 * Sólo LEE la sesión: entrar y salir son Server Actions de
 * `app/acceso/actions.ts`, que escriben las cookies en el servidor. El cliente
 * de navegador no recibe evento por esas cookies, así que además de
 * `onAuthStateChange` se vuelve a leer la sesión en cada cambio de ruta (las
 * acciones de entrar y salir siempre terminan en un `redirect`).
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  /** `undefined` = todavía no se ha leído la sesión en este cliente. */
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<{ id: string; name: string } | null>(null);
  // `getClaims` valida el JWT de la cookie sin ir a la red en cada navegación.
  useEffect(() => {
    let vivo = true;
    createClient()
      .auth.getClaims()
      .then(({ data }) => {
        if (vivo) setUserId(data?.claims?.sub ?? null);
      });
    return () => {
      vivo = false;
    };
  }, [pathname]);
  // Nada de llamadas a Supabase dentro del callback: puede bloquear el cliente.
  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((_evento, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  // El username se lee aparte, cada vez que cambia el usuario.
  useEffect(() => {
    if (!userId || perfil?.id === userId) return;
    let vivo = true;
    createClient()
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) console.error("[useSession] profiles", error.message);
        setPerfil({ id: userId, name: data?.username.toUpperCase() ?? NOMBRE_SIN_PERFIL });
      });
    return () => {
      vivo = false;
    };
  }, [userId, perfil?.id]);
  const user = userId && perfil?.id === userId ? perfil : null;
  const loading = userId === undefined || (userId !== null && user === null);
  const signOut = useCallback(async () => {
    setUserId(null);
    await cerrarSesion();
  }, []);
  const value = useMemo(() => ({ user, loading, signOut }), [user, loading, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return value;
}
