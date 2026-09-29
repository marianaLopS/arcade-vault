# SPEC 17 — Monetización: INSERT COIN y VAULT PASS

> **Estado:** Borrador
> **Depende de:** SPEC 06, SPEC 14, SPEC 15, SPEC 16
> **Fecha:** 2026-09-28
> **Objetivo:** Definir cómo gana dinero Arcade Vault sin romper el leaderboard, empezando por un botón de apoyo (INSERT COIN) y siguiendo con una suscripción (VAULT PASS).

## Por qué existe esta spec

Esta spec recoge un brainstorming de monetización. **No es para implementar todavía**: deja por
escrito las ideas, lo elegido y lo que falta decidir. Cuando se vaya a implementar, cada parte
(INSERT COIN y VAULT PASS) se separa en su propia spec lista para `/spec-impl`.

Punto de partida del proyecto:

- 5 juegos con motor propio: `asteroids`, `caida`, `arkanoid`, `snake` y `frogger`.
- Leaderboard real en Supabase.
- Cuentas de Supabase Auth (SPEC 14).
- Skins `clasico` / `neon` / `retro`.
- Soporte móvil (SPEC 11).
- Proyecto de Supabase en plan Free.

**Regla de oro:** nada pay-to-win. El leaderboard es el producto, y ninguna ventaja de pago puede
cambiar la puntuación ni la mecánica de un juego.

## Ideas evaluadas

| #   | Idea                                                                          | Grupo         | Veredicto                                       |
| --- | ----------------------------------------------------------------------------- | ------------- | ----------------------------------------------- |
| 1   | Skins premium por juego o por packs (CRT, Game Boy, vaporwave); sólo visuales | Cosmética     | Más adelante (reutiliza `skins.ts`)             |
| 2   | Identidad en el ranking: color o marco del nombre, insignia, avatar pixel-art | Cosmética     | Entra en VAULT PASS (insignia)                  |
| 3   | Temas de la web: fondo, fuente, HUD                                           | Cosmética     | Más adelante                                    |
| 4   | VAULT PASS: sin anuncios, todos los skins, estadísticas personales            | Suscripción   | **Elegida** (fase 2)                            |
| 5   | Replays / ghost de la mejor partida; leaderboards semanales o por país        | Suscripción   | Más adelante                                    |
| 6   | Acceso anticipado a los juegos de la game-jam                                 | Suscripción   | Más adelante                                    |
| 7   | Banner o intersticial **fuera** de la partida                                 | Publicidad    | Más adelante; poco dinero sin tráfico           |
| 8   | Anuncio con recompensa (vida extra)                                           | Publicidad    | Sólo en modo casual sin ranking; aparcada       |
| 9   | Torneos patrocinados con entrada gratis                                       | Competición   | Más adelante                                    |
| 10  | Torneos con entrada de pago y premio en dinero                                | Competición   | **Descartada**: riesgo legal de juego o apuesta |
| 11  | Reto diario con semilla fija (todos juegan la misma partida)                  | Competición   | Candidata a la v1 de VAULT PASS                 |
| 12  | Botón INSERT COIN (donación)                                                  | Apoyo directo | **Elegida** (fase 1)                            |
| 13  | Mecenas en créditos o "salón de la fama"                                      | Apoyo directo | Más adelante                                    |
| 14  | Advergaming / marca blanca para empresas                                      | B2B           | Fuera de la app; en paralelo                    |
| 15  | Licencia para incrustar juegos (iframe) con enlace de vuelta                  | B2B           | Más adelante; choca con `X-Frame-Options: DENY` |
| 16  | Juegos a encargo con el flujo game-jam → spec → motor                         | B2B           | Fuera de la app                                 |
| 17  | Plantilla o curso "arcade con Next + Supabase + Claude Code"                  | B2B           | Fuera de la app; en paralelo                    |
| 18  | Merch pixel-art (juegos y top 1 del mes)                                      | Otros         | Más adelante                                    |

Orden recomendado:

1. **INSERT COIN**: poco coste, sirve para medir interés.
2. **Skins premium**: reutiliza `skins.ts`.
3. **VAULT PASS**: cuando haya usuarios que vuelven.
4. **B2B o curso**: en paralelo, sin tocar la app.

Se eligieron la 1 (INSERT COIN) y la 3 (VAULT PASS).

## Alcance

**Dentro:**

- **Fase 1 — INSERT COIN** (spec propia al implementar).
  - Un botón con un **Stripe Payment Link** (decidido), leído de la variable pública `NEXT_PUBLIC_DONATE_URL`.
  - Si la variable no existe, el botón no se pinta y nada falla.
  - Sin backend de pagos: el enlace lleva a Stripe y el pago ocurre allí.
- **Fase 2 — VAULT PASS** (spec propia al implementar).
  - Suscripción mensual o anual con **Stripe Checkout**, y **Customer Portal** para gestionarla o cancelarla.
  - Página `/pass` para suscribirse.
  - Route Handler `app/api/stripe/webhook/route.ts`:
    - comprueba la firma con `STRIPE_WEBHOOK_SECRET`;
    - escribe el estado en la tabla `subscriptions`.
  - `useSession()` (`lib/session.tsx`) expone `pass: boolean`.
  - Ventajas de la v1:
    - insignia VAULT PASS junto al nombre en `Leaderboard`;
    - estadísticas personales (mejor puntuación y partidas por juego, derivadas de `scores.user_id`);
    - reto diario con semilla fija (pendiente de confirmar).
  - Ninguna ventaja toca `score`, los motores ni la validación de `guardarScore`.

**Fuera de alcance (futuras specs):**

- Skins premium y temas de pago.
- Anuncios, de cualquier tipo.
- Replays / ghost, leaderboards semanales o por país, y acceso anticipado.
- Torneos, de cualquier tipo. Los de pago están descartados.
- Embed / iframe, B2B, curso y merch.
- Insignia "supporter" por donar: no hay forma fiable de enlazar un Payment Link anónimo con una cuenta sin webhook.

## Modelo de datos

**Fase 1:** no añade datos. Sólo la env var `NEXT_PUBLIC_DONATE_URL`.

**Fase 2:** propuesta (la cerrará su spec).

```sql
create table public.subscriptions (
  user_id uuid primary key references auth.users on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  status text not null, -- valores de Stripe: active, trialing, past_due, canceled...
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
-- RLS: select sólo de la fila propia (user_id = auth.uid()); sin insert, update ni delete para clientes.
```

- Hay pass si `status in ('active','trialing')` y `current_period_end > now()`.
- La tabla sólo la escribe el webhook, con la clave `service_role`, que existe **sólo en el servidor**.
- Esto es una excepción explícita a la regla de CLAUDE.md "la clave `service_role` no entra en este repositorio":
  - la clave no se versiona; va en `.env.local` y en las env vars del hosting;
  - hay que documentar la excepción en CLAUDE.md y en el baseline del `security-auditor`.
- Env vars nuevas, todas sólo servidor:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`

## Plan de implementación

**No aplica todavía.** Cuando se apruebe la dirección:

1. Escribir la spec de INSERT COIN con `/spec`, cerrar sus decisiones pendientes e implementarla con `/spec-impl`.
2. Crear la cuenta de Stripe en modo test y los productos y precios del pass.
3. Escribir la spec de VAULT PASS con `/spec`, cerrar sus decisiones pendientes e implementarla con `/spec-impl`.

## Criterios de aceptación

De esta spec (documento de dirección):

- [ ] La dirección (INSERT COIN y después VAULT PASS) está aprobada.
- [ ] Las decisiones pendientes de abajo tienen respuesta.
- [ ] Existen las specs separadas de INSERT COIN y VAULT PASS, con estas decisiones incorporadas.

Criterios que heredan las specs hijas:

- [ ] Ninguna ventaja de pago cambia `score`, los motores ni la validación de `guardarScore`.
- [ ] Sin `NEXT_PUBLIC_DONATE_URL`, la app se construye y funciona sin mostrar el botón.
- [ ] Un cliente autenticado no puede insertar ni modificar filas de `subscriptions`: RLS lo bloquea (se comprueba con `execute_sql`).
- [ ] Un webhook con firma inválida responde 400 y no escribe nada.
- [ ] `get_advisors` (security) sólo da el aviso ya aceptado de _Leaked password protection_.

## Decisiones tomadas y descartadas

- **Sí:** nada pay-to-win. Un leaderboard comprado no vale nada.
- **Sí:** Stripe como proveedor único. El Payment Link de INSERT COIN y el Checkout del pass usan la misma cuenta y el mismo panel.
- **No:** Ko-fi o Buy Me a Coffee. Serían un segundo proveedor para lo que ya cubre Stripe.
- **Sí:** INSERT COIN antes que el pass. Cuesta casi nada y mide el interés antes de invertir en webhooks.
- **Sí:** el estado del pass se guarda en Supabase, escrito por el webhook. RLS y `useSession()` lo leen sin llamar a Stripe en cada request.
- **No:** consultar la API de Stripe en cada carga. Es lento y depende de un tercero.
- **No:** torneos con entrada de pago (riesgo legal) ni anuncios con recompensa en modo ranking (integridad).
- **No:** insignia "supporter" por donación en la fase 1 (ver "Fuera de alcance").

## Decisiones pendientes

1. Dónde va el botón INSERT COIN: nav, fin de partida (modal de `GamePlayer`), `/acerca` o footer.
2. Si se mide el uso del botón. Recomendación: no; basta con el panel de Stripe.
3. Precio y moneda del pass (mensual y anual), y si tiene prueba gratis.
4. Si el reto diario entra en la v1 del pass o va en otra spec.
5. Si hace falta subir a Supabase Pro (activaría _Leaked password protection_).

## Riesgos identificados

| Riesgo                                                         | Mitigación                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| La clave `service_role` se filtra al cliente                   | Se usa sólo en el Route Handler, con `import "server-only"`, sin `NEXT_PUBLIC_`. Lo revisa el `security-auditor`. |
| Webhooks falsos o repetidos                                    | Se verifica la firma con `STRIPE_WEBHOOK_SECRET` y se hace upsert idempotente por `stripe_subscription_id`.       |
| El estado local se desincroniza de Stripe                      | Se escuchan `customer.subscription.*` y se guarda `current_period_end` como caducidad de respaldo.                |
| Obligaciones fiscales y legales (IVA UE, términos, reembolsos) | Stripe Tax o revisión manual antes de cobrar en modo live, y páginas de términos y privacidad.                    |
| Poco tráfico: el ingreso no compensa el esfuerzo               | Se hace primero INSERT COIN y se decide el pass con datos reales.                                                 |

## Qué **no** entra en esta spec

- Código, migraciones o configuración de Stripe: esta spec sólo define la dirección.
- Skins premium, anuncios, replays, torneos, embed, B2B, curso y merch.

Cada una, si llega, va en su propia spec.
