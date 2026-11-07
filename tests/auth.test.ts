import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { signSession, verifySession } from "../src/server/session-token";
import { consumeLoginAttempt } from "../src/server/login-limit";
const id = "00000000-0000-4000-a000-000000000001";
describe("sessions and login limit", () => {
  it("accepts signed sessions and rejects tampered or absent cookies", async () => {
    const token = await signSession(id);
    expect(await verifySession(token)).toBe(id);
    expect(await verifySession(`${token}tampered`)).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });
  it("rejects expired sessions and non-UUID subjects", async () => {
    const key = new TextEncoder().encode(process.env.SESSION_SECRET!);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(id)
      .setIssuer("claimdesk")
      .setAudience("claimdesk")
      .setIssuedAt()
      .setExpirationTime(0)
      .sign(key);
    expect(await verifySession(token)).toBeNull();
    expect(await verifySession(await signSession("not-an-id"))).toBeNull();
  });
  it("limits attempts per IP and email and resets after 15 minutes", () => {
    for (let i = 0; i < 5; i++)
      expect(consumeLoginAttempt("test-ip", "demo@example.invalid", 0)).toBe(
        true,
      );
    expect(consumeLoginAttempt("test-ip", "demo@example.invalid", 1)).toBe(
      false,
    );
    expect(consumeLoginAttempt("test-ip", "other@example.invalid", 2)).toBe(
      true,
    );
    expect(
      consumeLoginAttempt("test-ip", "demo@example.invalid", 15 * 60_000),
    ).toBe(true);
  });
});
