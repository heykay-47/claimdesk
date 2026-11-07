import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { compare } from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SESSION_COOKIE, verifySession } from "./session-token";

export class AuthenticationError extends Error {
  readonly status = 401;
  constructor() {
    super("Sign in to continue");
    this.name = "AuthenticationError";
  }
}
export class AuthorizationError extends Error {
  readonly status = 403;
  constructor() {
    super("This action requires the desk head role");
    this.name = "AuthorizationError";
  }
}
export type SessionUser = Pick<
  typeof users.$inferSelect,
  "id" | "name" | "email" | "role"
>;
export async function getSession(): Promise<SessionUser | null> {
  const userId = await verifySession(
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  if (!userId) return null;
  const [user] = await db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, userId));
  return user ?? null;
}
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new AuthenticationError();
  return user;
}
export async function requireRole(role: "HEAD"): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== role) throw new AuthorizationError();
  return user;
}
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const [user] = await db().select().from(users).where(eq(users.email, email));
  const valid = await compare(
    password,
    user?.passwordHash ??
      "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5Wzx.YN3kHmQ4IzQiEq6WcuS5I7UIy.",
  );
  if (!user || !valid) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
