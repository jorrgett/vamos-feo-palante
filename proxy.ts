import { NextResponse, type NextRequest } from "next/server";

// Chequeo optimista: si no hay cookie de sesión, directo a /entrar.
// La verificación real de la sesión ocurre en el servidor (lib/auth).
const PRIVATE = ["/inicio", "/salidas", "/pagar", "/panas", "/bienvenida", "/cashea", "/tasas", "/historial", "/calculadora", "/perfil", "/avisos", "/admin", "/novedades"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PRIVATE.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.has("vaca_sid")) {
    const url = new URL("/entrar", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/inicio/:path*", "/salidas/:path*", "/pagar/:path*", "/panas/:path*", "/bienvenida/:path*", "/cashea/:path*", "/tasas/:path*", "/historial/:path*", "/calculadora/:path*", "/perfil/:path*", "/avisos/:path*", "/admin/:path*", "/novedades/:path*"],
};
