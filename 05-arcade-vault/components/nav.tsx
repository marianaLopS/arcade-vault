"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/session";

const PANEL_ID = "av-menu-movil";

export function Nav() {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  // El menú móvil se cierra al navegar y con Escape.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Inicio sólo se marca en la landing exacta; Biblioteca cubre además el
  // detalle de cada juego y el reproductor.
  const enInicio = pathname === "/";
  const enBiblioteca =
    pathname.startsWith("/biblioteca") ||
    pathname.startsWith("/juegos") ||
    pathname.startsWith("/jugar");
  const enSalon = pathname.startsWith("/salon");
  const enAcerca = pathname.startsWith("/acerca");
  const enAcceso = pathname.startsWith("/acceso");
  const activa = (on: boolean) => (on ? "active" : "");

  return (
    <>
      <nav className="av-nav">
        <Link className="logo" href="/" onClick={close}>
          <div className="logo-mark" aria-hidden />
          <div className="logo-text neon-cyan">
            ARCADE <span className="neon-magenta">VAULT</span>
          </div>
        </Link>

        <div className="links">
          <Link className={activa(enInicio)} href="/">
            Inicio
          </Link>
          <Link className={activa(enBiblioteca)} href="/biblioteca">
            Biblioteca
          </Link>
          <Link className={activa(enSalon)} href="/salon">
            Salón de la Fama
          </Link>
          <Link className={activa(enAcerca)} href="/acerca">
            Acerca de
          </Link>
        </div>

        <div className="spacer" />

        <div className="coin-counter">
          <span className="coin" aria-hidden />
          <span>CRÉDITOS · 03</span>
        </div>

        {user ? (
          <button className="btn ghost auth-btn" onClick={signOut}>
            {user.name} ▾
          </button>
        ) : (
          <Link className="btn auth-btn" href="/acceso">
            Iniciar Sesión
          </Link>
        )}

        <button
          className="btn ghost hamburger"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={open}
          aria-controls={PANEL_ID}
        >
          ≡
        </button>
      </nav>

      <div
        className={"av-mobile-backdrop" + (open ? " open" : "")}
        onClick={close}
        aria-hidden
      />

      <aside
        id={PANEL_ID}
        className={"av-mobile-panel" + (open ? " open" : "")}
        inert={!open}
      >
        <div className="pixel neon-cyan" style={{ fontSize: 11, marginBottom: 16 }}>
          MENÚ
        </div>
        <Link className={activa(enInicio)} href="/" onClick={close}>
          Inicio
        </Link>
        <Link className={activa(enBiblioteca)} href="/biblioteca" onClick={close}>
          Biblioteca
        </Link>
        <Link className={activa(enSalon)} href="/salon" onClick={close}>
          Salón de la Fama
        </Link>
        <Link className={activa(enAcerca)} href="/acerca" onClick={close}>
          Acerca de
        </Link>
        <Link className={activa(enAcceso)} href="/acceso" onClick={close}>
          {user ? "Cuenta" : "Iniciar Sesión"}
        </Link>
        <div style={{ flex: 1 }} />
        <div
          className="pixel"
          style={{ fontSize: 9, color: "var(--ink-faint)", letterSpacing: "0.16em" }}
        >
          CRÉDITOS · 03
        </div>
      </aside>
    </>
  );
}
