import Link from "next/link";
export default function Forbidden() {
  return (
    <main className="empty-state">
      <p className="mono muted">403</p>
      <h1>Desk head access required</h1>
      <p className="muted">
        Only the desk head can manage checklist rules and view the audit log.
      </p>
      <Link href="/claims" className="btn primary">
        Back to claims
      </Link>
    </main>
  );
}
