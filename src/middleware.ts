// Sign-in gate: when Firebase auth is configured, every page needs a valid session cookie; others go to /login?next=….
// Open without it (demo). API routes, invite links, the legal pages (/privacy, /terms) and static files are excluded by the matcher.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, readSession, safeNext } from "@/lib/session";

export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  const user = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (pathname === "/login") return user ? NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")), req.url)) : NextResponse.next();
  if (user) return NextResponse.next();
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api/|_next/|brand/|invite/|privacy|terms|icon.png|apple-icon.png|favicon.ico|robots.txt).*)"],
};
