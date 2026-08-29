import Link from "next/link";

export default function NotFound() {
  return (
    <div className="av-hero fade-in" style={{ paddingBottom: 96 }}>
      <h1 className="flicker">GAME OVER</h1>
      <div className="sub">
        404 · CARTUCHO NO ENCONTRADO <span className="blink">_</span>
      </div>
      <p
        className="mono"
        style={{
          maxWidth: 460,
          margin: "24px auto 0",
          color: "var(--ink-dim)",
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        La ranura está vacía. Ese juego no existe en el vault o su identificador se ha
        desmagnetizado.
      </p>
      <div style={{ marginTop: 32, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link className="btn lg" href="/">
          VOLVER AL VAULT
        </Link>
        <Link className="btn ghost lg" href="/salon">
          SALÓN DE LA FAMA
        </Link>
      </div>
    </div>
  );
}
