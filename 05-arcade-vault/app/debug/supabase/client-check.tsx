"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
type Estado = { texto: string; ok: boolean };
/**
 * Misma comprobación que la página, pero desde el navegador: demuestra que
 * `lib/supabase/client.ts` funciona dentro de un Client Component.
 *
 * Temporal, igual que la ruta que lo contiene.
 */
export default function ClientCheck() {
  const [estado, setEstado] = useState<Estado | null>(null);
  useEffect(() => {
    let vivo = true;
    createClient()
      .auth.getClaims()
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) setEstado({ texto: `ERROR: ${error.message}`, ok: false });
        else if (data?.claims?.sub) setEstado({ texto: `SESIÓN: ${data.claims.sub}`, ok: true });
        else setEstado({ texto: "SIN SESIÓN", ok: true });
      });
    return () => {
      vivo = false;
    };
  }, []);
  return (
    <>
      <div className="line">
        <span className="prompt">vault@arcade:~$</span> ./check_supabase --desde=navegador
      </div>
      <div className="line dim">[··] Creando cliente de navegador…</div>
      <div
        className="line success"
        style={estado && !estado.ok ? { color: "var(--magenta)" } : undefined}
      >
        &gt; {estado ? estado.texto : "COMPROBANDO"}
        <span className="caret">_</span>
      </div>
    </>
  );
}
