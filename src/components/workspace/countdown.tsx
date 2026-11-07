"use client";
import { useEffect, useState } from "react";
import { deadlineState } from "@/domain/deadline";
import { formatIST } from "@/domain/format";
export function Countdown({
  dueAt,
  answered = false,
}: {
  dueAt: Date | string;
  answered?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const due = new Date(dueAt);
  if (answered) return <span className="pill neutral">Answered</span>;
  const state = deadlineState(due, now);
  const minutes = Math.max(
    0,
    Math.ceil(Math.abs(due.getTime() - now.getTime()) / 60000),
  );
  const duration = `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  const label =
    state === "OVERDUE" ? `${duration} overdue` : `${duration} left`;
  return (
    <time
      role="timer"
      aria-live="off"
      suppressHydrationWarning
      dateTime={due.toISOString()}
      title={`Due ${formatIST(due)} IST`}
      aria-label={label}
      className={`countdown mono ${state === "OVERDUE" ? "danger-text" : state === "DUE_SOON" ? "warning-text" : "muted"}`}
    >
      {label}
    </time>
  );
}
