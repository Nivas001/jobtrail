import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "jobtrail-session";
const PUBLIC_PATHS = ["/login", "/auth"];

// Optimistic check only: no session cookie → /login. Pages and actions verify
// the session with Appwrite themselves.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return NextResponse.next();
  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
