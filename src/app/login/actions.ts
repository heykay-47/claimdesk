"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, verifyCredentials } from "@/server/auth";
import { audit } from "@/server/audit";
import { consumeLoginAttempt } from "@/server/login-limit";
import {
  SESSION_COOKIE,
  SESSION_SECONDS,
  signSession,
} from "@/server/session-token";

export type LoginState = { error: string | null };
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});
export async function login(
  _previous: LoginState,
  form: FormData,
): Promise<LoginState> {
  const parsed = credentials.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!consumeLoginAttempt(ip, parsed.data.email))
    return { error: "Too many attempts. Try again in 15 minutes." };
  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    await audit({ action: "LOGIN_FAILED", entityType: "session", ip });
    return { error: "Email or password is incorrect." };
  }
  const token = await signSession(user.id);
  await audit({
    actorId: user.id,
    action: "LOGIN",
    entityType: "session",
    entityId: user.id,
    ip,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  redirect("/");
}
export async function logout(): Promise<void> {
  const user = await requireUser();
  await audit({
    actorId: user.id,
    action: "LOGOUT",
    entityType: "session",
    entityId: user.id,
  });
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
