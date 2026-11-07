import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ role: "EXECUTIVE", read: vi.fn() }));
vi.mock("@/server/session-token", () => ({
  SESSION_COOKIE: "test-session",
  verifySession: async (value?: string) => (value === "signed" ? "user" : null),
}));
vi.mock("@/db", () => ({
  db: () => ({
    select: () => ({
      from: () => ({
        where: async () => {
          state.read();
          return [{ role: state.role }];
        },
      }),
    }),
  }),
}));
import { proxy } from "../src/proxy";
const request = (path: string, authenticated = true) =>
  new NextRequest(`https://example.test${path}`, {
    headers: authenticated ? { cookie: "test-session=signed" } : {},
  });
beforeEach(() => {
  state.role = "EXECUTIVE";
  state.read.mockClear();
});
describe("early settings permission response", () => {
  it("denies executive settings navigation with a real 403 before streaming", async () => {
    const response = await proxy(request("/settings/checklists"));
    expect(response.status).toBe(403);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://example.test/access-denied",
    );
  });
  it("checks current database roles only for settings and still allows head access", async () => {
    expect((await proxy(request("/claims"))).status).toBe(200);
    expect(state.read).not.toHaveBeenCalled();
    state.role = "HEAD";
    expect((await proxy(request("/settings/checklists"))).status).toBe(200);
    expect(state.read).toHaveBeenCalledTimes(1);
  });
  it("redirects unsigned requests to login before a role read", async () => {
    const response = await proxy(request("/settings/checklists", false));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.test/login");
    expect(state.read).not.toHaveBeenCalled();
  });
});
