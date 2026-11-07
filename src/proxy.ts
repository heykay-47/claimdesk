import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/server/session-token";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/login") return NextResponse.next();
  const userId = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!userId) return NextResponse.redirect(new URL("/login", request.url));
  if (
    request.nextUrl.pathname === "/settings" ||
    request.nextUrl.pathname.startsWith("/settings/")
  ) {
    const [user] = await db()
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId));
    if (user?.role !== "HEAD")
      return NextResponse.rewrite(new URL("/access-denied", request.url), {
        status: 403,
      });
  }
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
