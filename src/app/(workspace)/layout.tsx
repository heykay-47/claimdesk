import { Suspense } from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { queries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/server/auth";
import { Sidebar } from "@/components/workspace/sidebar";
import { Skeleton } from "@/components/workspace/primitives";
async function Shell({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const open = await db()
    .select({ dueAt: queries.dueAt })
    .from(queries)
    .where(eq(queries.status, "OPEN"));
  const now = new Date();
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar
        user={user}
        openCount={open.length}
        overdue={open.some((q) => q.dueAt < now)}
      />
      <main id="main" className="workspace">
        <div className="workspace-inner">{children}</div>
      </main>
    </div>
  );
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="p-8">
          <Skeleton />
        </main>
      }
    >
      <Shell>{children}</Shell>
    </Suspense>
  );
}
