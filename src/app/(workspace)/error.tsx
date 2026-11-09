"use client";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <section className="empty-state panel" role="alert">
      <h1>This page could not load</h1>
      <p className="muted">
        Your saved work is safe. Select Try again. If it keeps failing, reload
        the page.
      </p>
      <button className="btn primary" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
