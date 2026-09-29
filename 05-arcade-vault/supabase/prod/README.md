# Producción (Supabase)

Runbook para dejar el proyecto Supabase de **producción** igual que dev. Claude **no** tiene
acceso a producción: el MCP apunta sólo a dev (`wlofsbjzfzywdgvovibv`). Todo lo de aquí lo
ejecutas tú en el dashboard de prod. Nunca pases a Claude el token, la connection string ni la
`service_role` de prod.

Se migra **esquema + catálogo `games`**. Puntuaciones y usuarios de dev son de prueba y no pasan.

## A. Base de datos

1. Dashboard de prod → **SQL Editor** → pegar `bootstrap.sql` completo → **Run**.
   - Es una transacción: si falla, no queda nada a medias. Si `public.games` ya existe, se niega.
   - Si sale `WARNING: No se pudo crear el event trigger ensure_rls`, el esquema queda bien igual
     (las tablas activan RLS a mano), pero crea tablas futuras siempre con `enable row level security`.
2. Ejecutar las consultas de verificación del final del script. Esperado: 5 juegos, 3 tablas con
   RLS `true`, 4 políticas, trigger `on_auth_user_created`, funciones sin `anon`/`authenticated`
   en el ACL, event trigger `ensure_rls`.
3. **Advisors → Security**: el único aviso admitido es _Leaked password protection_ (plan Free).

## B. Auth (dashboard de prod)

| Dónde                                    | Valor                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Auth → URL Configuration → Site URL      | `https://<tu-dominio>` (sin barra final, igual que `SITE_URL`)                         |
| Auth → URL Configuration → Redirect URLs | `https://<tu-dominio>/auth/callback` y `https://<tu-dominio>/auth/confirm`             |
| Providers → Email                        | _Confirm email_ ON · _Secure password change_ ON                                       |
| Providers → Email → Password             | _Minimum length_ 8 · _Requirements_ "Lowercase, uppercase letters, digits and symbols" |
| Auth → Rate Limits                       | Sign-ups y sign-ins: 10 / 5 min por IP                                                 |
| Emails → Confirm signup (enlace)         | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`                   |
| Emails → Reset password (enlace)         | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`                |

Copia el resto del texto de las plantillas desde el dashboard de dev.

## C. OAuth (Google y GitHub)

Callback de prod: `https://<ref-prod>.supabase.co/auth/v1/callback`.

- **Google Cloud**: en el cliente OAuth, añadir ese callback a _Authorized redirect URIs_ y el
  dominio a _Authorized JavaScript origins_ (o crear un cliente nuevo para prod).
- **GitHub**: una OAuth App sólo admite un callback → crear una **OAuth App nueva** para prod.
- Pegar Client ID / Secret en prod → Auth → Providers → Google / GitHub y activarlos.

## D. SMTP

El SMTP por defecto de Supabase sólo manda unos pocos correos por hora: insuficiente para
registros reales. Recomendado: Auth → SMTP Settings con Resend (`smtp.resend.com`, puerto 465,
usuario `resend`, contraseña = una API key de Resend) y un remitente de un dominio verificado.

## E. Variables de entorno del hosting

No van al repo. En el proveedor de hosting (Production):

| Variable                               | Valor                                                |
| -------------------------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<ref-prod>.supabase.co`                     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` de prod (Settings → API Keys)     |
| `SITE_URL`                             | `https://<tu-dominio>` sin barra final (obligatoria) |
| `RESEND_API_KEY`                       | clave de Resend (formulario de `/acerca`)            |

Las `NEXT_PUBLIC_*` se incrustan en el build: tras cambiarlas, redeploy.

## F. Comprobación final

Con la app desplegada contra prod: registrarse (llega el correo y el enlace abre `/biblioteca`),
entrar con Google y GitHub, recuperar contraseña, jugar `/jugar/asteroids` y guardar una
puntuación con y sin sesión. Borra luego las cuentas de prueba desde Auth → Users.

## G. Cambios futuros de esquema

`supabase/migrations/` sigue siendo la fuente de verdad. Flujo: Claude crea la migración y la
aplica en dev → la revisas → la pegas tú en el SQL Editor de prod. `bootstrap.sql` sólo sirve
para un proyecto vacío; no hay que regenerarlo con cada migración. Los tipos
(`lib/supabase/database.types.ts`) salen de dev y valen para prod mientras ambos estén al día.
