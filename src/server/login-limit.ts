import "server-only";
import { createHash } from "node:crypto";

// Only failures count: reviewers share the published demo accounts and often one office IP,
// so successful sign-ins must never lock an account.
const failures = new Map<string, { count: number; resetsAt: number }>();
const WINDOW_MS = 15 * 60_000;
const PER_ACCOUNT = 5;
const PER_IP = 30;

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const keysFor = (ip: string, email: string) =>
  [
    [hash(`${ip}:${email}`), PER_ACCOUNT],
    [hash(`ip:${ip}`), PER_IP],
  ] as const;

function prune(now: number) {
  for (const [key, value] of failures)
    if (value.resetsAt <= now) failures.delete(key);
}

export function isLoginBlocked(ip: string, email: string, now = Date.now()) {
  prune(now);
  return keysFor(ip, email).some(
    ([key, limit]) => (failures.get(key)?.count ?? 0) >= limit,
  );
}

export function recordLoginFailure(
  ip: string,
  email: string,
  now = Date.now(),
) {
  prune(now);
  if (failures.size > 10_000) return;
  for (const [key] of keysFor(ip, email)) {
    const current = failures.get(key) ?? {
      count: 0,
      resetsAt: now + WINDOW_MS,
    };
    current.count++;
    failures.set(key, current);
  }
}

export function clearLoginFailures(ip: string, email: string) {
  failures.delete(keysFor(ip, email)[0][0]);
}
