import "server-only";
import { createHash } from "node:crypto";
const attempts = new Map<string, { count: number; resetsAt: number }>();
const WINDOW_MS = 15 * 60_000;
export function consumeLoginAttempt(
  ip: string,
  email: string,
  now = Date.now(),
): boolean {
  for (const [key, value] of attempts)
    if (value.resetsAt <= now) attempts.delete(key);
  const keys = [
    createHash("sha256").update(`${ip}:${email}`).digest("hex"),
    createHash("sha256").update(`ip:${ip}`).digest("hex"),
  ];
  if (attempts.size > 10_000) return false;
  const limits = [5, 30];
  let allowed = true;
  keys.forEach((key, index) => {
    const current = attempts.get(key) ?? {
      count: 0,
      resetsAt: now + WINDOW_MS,
    };
    current.count++;
    attempts.set(key, current);
    if (current.count > limits[index]) allowed = false;
  });
  return allowed;
}
