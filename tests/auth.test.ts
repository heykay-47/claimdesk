import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { signSession, verifySession } from "../src/server/session-token";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
} from "../src/server/login-limit";
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
  it("never blocks repeated successful sign-ins from a shared IP", () => {
    for (let i = 0; i < 20; i++) {
      expect(isLoginBlocked("office-ip", "desk@example.invalid", i)).toBe(
        false,
      );
      clearLoginFailures("office-ip", "desk@example.invalid");
    }
  });
  it("blocks an account after 5 failures for 15 minutes; success clears it", () => {
    for (let i = 0; i < 5; i++)
      recordLoginFailure("test-ip", "demo@example.invalid", 0);
    expect(isLoginBlocked("test-ip", "demo@example.invalid", 1)).toBe(true);
    expect(isLoginBlocked("test-ip", "other@example.invalid", 2)).toBe(false);
    expect(isLoginBlocked("test-ip", "demo@example.invalid", 15 * 60_000)).toBe(
      false,
    );
    recordLoginFailure("ip-2", "demo@example.invalid", 0);
    clearLoginFailures("ip-2", "demo@example.invalid");
    expect(isLoginBlocked("ip-2", "demo@example.invalid", 1)).toBe(false);
  });
});
