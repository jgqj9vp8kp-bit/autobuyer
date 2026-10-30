import { NextRequest, NextResponse } from "next/server";

/**
 * Простая защита паролем (HTTP Basic Auth) для публичного деплоя.
 * Включается, когда задан BASIC_AUTH_PASSWORD (логин — BASIC_AUTH_USER, по умолчанию любой).
 * Без пароля в env приложение открыто — так удобно локально, но в проде пароль обязателен.
 */
export function middleware(req: NextRequest) {
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!password) return NextResponse.next();
  const user = process.env.BASIC_AUTH_USER;

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const idx = decoded.indexOf(":");
      const u = idx >= 0 ? decoded.slice(0, idx) : "";
      const p = idx >= 0 ? decoded.slice(idx + 1) : decoded;
      if (p === password && (!user || u === user)) return NextResponse.next();
    } catch {
      /* невалидный base64 — считаем неавторизованным */
    }
  }
  return new NextResponse("Нужен пароль", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Autobuyer", charset="UTF-8"' } });
}

export const config = {
  // всё, кроме статики Next и health-чека для хостинга
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
