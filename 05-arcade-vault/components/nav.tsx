"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useSession } from "@/lib/session";
const PANEL_ID = "av-menu-movil";
const USER_MENU_ID = "av-menu-usuario";
export function Nav() {
  const pathname = usePathname();
  const { user, loading, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saliendo, startSalir] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const salir = () =>
    startSalir(async () => {
      setMenuOpen(false);
      setOpen(false);
      await signOut();
    });
  // El menú del usuario se cierra con Escape y al pulsar fuera de él.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);
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
        {/* Mientras se lee la sesión no se pinta nada: evita el parpadeo a "Iniciar Sesión". */}
        {loading ? null : user ? (
          <div className="user-menu" ref={menuRef}>
            <button
              className="btn ghost auth-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={USER_MENU_ID}
              disabled={saliendo}
            >
              {saliendo ? "SALIENDO…" : `${user.name} ▾`}
            </button>
            {menuOpen && (
              <div id={USER_MENU_ID} className="user-menu-pop slide-in" role="menu">
                <div className="who">SESIÓN INICIADA</div>
                <button type="button" role="menuitem" onClick={salir} autoFocus>
                  ⏻ SALIR
                </button>
              </div>
            )}
          </div>
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
      <div className={"av-mobile-backdrop" + (open ? " open" : "")} onClick={close} aria-hidden />
      <aside id={PANEL_ID} className={"av-mobile-panel" + (open ? " open" : "")} inert={!open}>
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
        {loading ? null : user ? (
          <>
            <div className="mobile-user">{user.name}</div>
            <button type="button" className="mobile-salir" onClick={salir} disabled={saliendo}>
              {saliendo ? "Saliendo…" : "Salir"}
            </button>
          </>
        ) : (
          <Link className={activa(enAcceso)} href="/acceso" onClick={close}>
            Iniciar Sesión
          </Link>
        )}
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
