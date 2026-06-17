import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE } from "@/lib/auth"
import { VALID_SESSION_TOKENS } from "@/lib/users"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value

  // The proxy runs on the Edge and cannot query Postgres, so it performs only a
  // lightweight gate:
  //  - a static registry token is authoritatively valid here, and
  //  - any other non-empty session token (i.e. a dynamic, admin-created user)
  //    is provisionally allowed, then authoritatively validated — including
  //    account status — by the server-side dashboard layout, which CAN reach
  //    the database.
  // A completely missing cookie is always rejected.
  const isAuthed = !!token && (VALID_SESSION_TOKENS.has(token) || token.length > 0)

  // Protect every /dashboard route — redirect unauthorized visitors to /login.
  if (pathname.startsWith("/dashboard")) {
    if (!isAuthed) {
      const loginUrl = new URL("/login", request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  // If already authed, keep users out of the login page.
  if (pathname === "/login" && isAuthed) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
}
