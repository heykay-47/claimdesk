import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

export const SESSION_COOKIE = "claimdesk_session";
export const SESSION_SECONDS = 8 * 60 * 60;
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}
export async function signSession(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("claimdesk")
    .setAudience("claimdesk")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(key());
}
export async function verifySession(
  token: string | undefined,
): Promise<string | null> {
  if (!token) return null;
  const secret = key();
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "claimdesk",
      audience: "claimdesk",
      requiredClaims: ["sub", "exp", "iat"],
    });
    return z.uuid().parse(payload.sub);
  } catch {
    return null;
  }
}
