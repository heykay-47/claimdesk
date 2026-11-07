import { afterEach, describe, expect, it, vi } from "vitest";
import { SEED_CLAIMS, seedAdmission, seedFields } from "../seed/data";

const reset = vi.hoisted(() => vi.fn(async () => ({ claims: 8 })));
vi.mock("../seed/run", () => ({ resetDemo: reset }));
import { GET } from "../src/app/api/cron/reset-demo/route";

afterEach(() => {
  vi.unstubAllEnvs();
  reset.mockClear();
});
describe("fresh and secured demo reset", () => {
  it("keeps the admission story relative to each seed run", () => {
    const now = new Date("2026-11-09T18:00:00Z");
    expect(now.getTime() - seedAdmission(SEED_CLAIMS[0], now).getTime()).toBe(
      50 * 3600000,
    );
    expect(now.getTime() - seedAdmission(SEED_CLAIMS[3], now).getTime()).toBe(
      3600000,
    );
  });
  it("uses the hospital's IST admission date across the UTC day boundary", () => {
    expect(
      seedFields(SEED_CLAIMS[0], new Date("2026-11-09T20:00:00Z"))
        .date_of_admission,
    ).toBe("2026-11-10");
  });
  it("rejects missing configuration, missing credentials and wrong credentials", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("https://example.test"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    for (const value of ["", "Bearer wrong"])
      expect(
        (
          await GET(
            new Request("https://example.test", {
              headers: { authorization: value },
            }),
          )
        ).status,
      ).toBe(401);
    expect(reset).not.toHaveBeenCalled();
  });
  it("runs the shared reset only for the configured bearer", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const response = await GET(
      new Request("https://example.test", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(reset).toHaveBeenCalledWith({ source: "cron" });
  });
  it("returns a retryable, uncached failure without exposing infrastructure details", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    reset.mockRejectedValueOnce(new Error("Internal storage detail"));
    const response = await GET(
      new Request("https://example.test", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.text()).not.toContain("Internal storage detail");
  });
});
