import { auth } from "./auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Allow webhook endpoint without auth (agents post here)
  if (pathname.startsWith("/api/webhook")) return;

  // Allow auth API routes
  if (pathname.startsWith("/api/auth")) return;

  // Allow login page
  if (pathname === "/login") return;

  // Redirect unauthenticated users to login
  if (!isLoggedIn) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|office.js).*)"],
};
