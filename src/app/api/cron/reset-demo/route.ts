import { timingSafeEqual, createHash } from "node:crypto";
import { resetDemo } from "../../../../../seed/run";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!secret || !timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`)))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await resetDemo({ source: "cron" }), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "Demo reset failed. Existing data was preserved." },
      { status: 500 },
    );
  }
}
