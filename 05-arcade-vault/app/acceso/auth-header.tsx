/** Cabecera común de las tarjetas de `/acceso`, `/acceso/recuperar` y `/acceso/nueva-clave`. */
export function AuthHeader({ sub = "ACCESO AL SISTEMA · v2.6" }: { sub?: string }) {
  return (
    <div className="auth-header">
      <div className="mark" aria-hidden />
      <h2 className="neon-cyan">ARCADE VAULT</h2>
      <div
        className="mono"
        style={{
          fontSize: 11,
          color: "var(--ink-faint)",
          letterSpacing: "0.16em",
          marginTop: 6,
        }}
      >
        {sub}
      </div>
    </div>
  );
}
