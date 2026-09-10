import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import ClientCheck from "./client-check";
export const metadata = { title: "Diagnóstico Supabase · Arcade Vault" };
export default async function DebugSupabase() {
  const host = new URL(SUPABASE_URL).host;
  const clave = `PRESENTE (${SUPABASE_PUBLISHABLE_KEY.length} caracteres)`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sesion = error
    ? { texto: `ERROR: ${error.message}`, ok: false }
    : data?.claims?.sub
      ? { texto: `SESIÓN: ${data.claims.sub}`, ok: true }
      : { texto: "SIN SESIÓN", ok: true };
  return (
    <div className="fade-in" style={{ maxWidth: 780, margin: "0 auto", padding: "48px 20px 80px" }}>
      <div
        className="mono"
        style={{
          display: "inline-block",
          marginBottom: 18,
          padding: "8px 12px",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--magenta)",
          border: "1px solid var(--magenta)",
          background: "rgba(255,0,110,0.08)",
        }}
      >
        RUTA TEMPORAL DE DIAGNÓSTICO — LA BORRA LA SPEC 05
      </div>
      <div className="terminal-success">
        <div className="term-bar">
          <span className="dot r" />
          <span className="dot y" />
          <span className="dot g" />
          <span className="term-title">VAULT-OS // SUPABASE</span>
        </div>
        <div className="term-body">
          <div className="line">
            <span className="prompt">vault@arcade:~$</span> ./check_supabase --desde=servidor
          </div>
          <div className="line dim">[OK] PROYECTO: {host}</div>
          <div className="line dim">[OK] CLAVE: {clave}</div>
          <div
            className="line success"
            style={sesion.ok ? undefined : { color: "var(--magenta)" }}
          >
            &gt; {sesion.texto}
          </div>
          <div style={{ height: 1, background: "var(--line)", margin: "18px 0" }} />
          <ClientCheck />
        </div>
      </div>
      <p
        className="mono"
        style={{ marginTop: 20, fontSize: 12, lineHeight: 1.7, color: "var(--ink-dim)" }}
      >
        Los dos bloques deben decir <strong style={{ color: "var(--green)" }}>SIN SESIÓN</strong>:
        la SPEC 04 monta los clientes, no el login. La clave nunca se imprime; sólo su longitud.
      </p>
    </div>
  );
}
