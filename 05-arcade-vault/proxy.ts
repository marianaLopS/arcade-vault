import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
// En Next 16 `middleware.ts` está deprecado y renombrado a `proxy.ts`, con la
// función exportada como `proxy`. Ver
// node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}
export const config = {
  matcher: [
    // Todo menos los estáticos de Next, el favicon y las imágenes: ahí no hay
    // sesión que refrescar y el proxy sólo añadiría latencia.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
