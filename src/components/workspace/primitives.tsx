import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import type { ClaimStatus } from "@/domain/claim-status";
import type { ChecklistResult, ResolvedRule } from "@/domain/checklist";
export const STATUS_LABELS: Record<ClaimStatus, string> = {
  PREAUTH_DRAFT: "Pre-auth draft",
  PREAUTH_SUBMITTED: "Pre-auth sent",
  QUERY: "Query",
  APPROVED: "Approved",
  ENHANCEMENT: "Enhancement",
  FINAL_BILL_SUBMITTED: "Final bill sent",
  SETTLED: "Settled",
  REJECTED: "Rejected",
};
export function StatusPill({ status }: { status: ClaimStatus }) {
  const tone =
    status === "QUERY" || status === "REJECTED"
      ? "danger"
      : status === "ENHANCEMENT"
        ? "warning"
        : status === "APPROVED" || status === "SETTLED"
          ? "success"
          : "neutral";
  return (
    <span className={`pill ${tone}`}>
      <span className="status-dot" />
      {STATUS_LABELS[status]}
    </span>
  );
}
export function PageTitle({
  title,
  description,
  children,
  back,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="page-heading">
      {back && (
        <Link className="back-link" href={back.href}>
          <ChevronLeft size={14} />
          {back.label}
        </Link>
      )}
      <div className="heading-row">
        <div>
          <h1>{title}</h1>
          {description && <p className="muted mt-1">{description}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {children}
    </div>
  );
}
export function readinessText(result: ChecklistResult) {
  if (result.ready) return "Ready";
  const counts = result.counts;
  const parts = [
    counts.MISSING ? `${counts.MISSING} missing` : "",
    counts.STALE ? `${counts.STALE} stale` : "",
    counts.UNVERIFIED ? `${counts.UNVERIFIED} to verify` : "",
    result.unsorted.filter((f) => f.status !== "CONFIRMED").length
      ? "Unsorted files"
      : "",
    result.blockers.some((b) => b.kind === "FIELD") ? "Fields to review" : "",
  ].filter(Boolean);
  return parts.join(" · ") || "Review needed";
}
export function ruleSource(
  rule: ResolvedRule,
  payer: string,
  procedure: string,
) {
  return `${rule.payerId ? payer : "All payers"} · ${rule.procedureId ? procedure : "default"}`;
}
export function Skeleton() {
  return (
    <div className="skeleton-page" role="status" aria-label="Loading workspace">
      <div className="skeleton h-7 w-48" />
      <div className="skeleton h-20" />
      <div className="skeleton h-10" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="skeleton h-16" />
      ))}
      <span className="sr-only">Loading workspace</span>
    </div>
  );
}
