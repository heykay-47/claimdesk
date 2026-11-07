import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { logout } from "./login/actions";
import { Button } from "@/components/ui/button";

async function Workspace() {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">ClaimDesk</p>
          <h1 className="mt-2 text-2xl font-semibold">Welcome, {user.name}</h1>
        </div>
        <form action={logout}>
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </header>
      <section className="rounded-xl border p-6">
        <h2 className="font-medium">Your session is active</h2>
        <p className="mt-2 text-muted-foreground">{user.email}</p>
        <p className="mt-2 text-sm">
          Role <strong>{user.role}</strong>
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          The claims workspace is being prepared. This demo contains synthetic
          records only.
        </p>
      </section>
    </main>
  );
}
export default function Home() {
  return (
    <Suspense fallback={<main className="p-8">Loading workspace…</main>}>
      <Workspace />
    </Suspense>
  );
}
