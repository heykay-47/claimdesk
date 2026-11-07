"use client";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <section className="empty-state panel" role="alert">
      <h1>We couldn’t load this workspace</h1>
      <p className="muted">
        Your saved records are unchanged. Try again to reconnect.
      </p>
      <button className="btn primary" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
