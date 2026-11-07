import "server-only";
import { z } from "zod";
import { requireRole } from "./auth";
import { resetDemo } from "../../seed/run";

export async function resetDemoAsHead(input: unknown) {
  const user = await requireRole("HEAD");
  z.object({ confirmedReset: z.literal(true) }).parse(input);
  await resetDemo({ actorId: user.id, source: "head" });
}
