import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { Files } from "lucide-react";
import { LoginForm } from "./login-form";

async function Login() {
  if (await getSession()) redirect("/");
  return (
    <main className="login-wrap">
      <div className="login-card">
        <div className="wordmark">
          <span className="brand-mark">
            <Files size={17} />
          </span>
          ClaimDesk
        </div>
        <section className="panel">
          <h1>Sign in to your desk</h1>
          <p className="muted text-sm">Cashless claims. Clear next steps.</p>
          <LoginForm />
        </section>
        <p className="login-note">
          A workspace for the hospital insurance desk.
          <br />
          Demo only. Every patient and document is fictional.
        </p>
      </div>
    </main>
  );
}
export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-8">Loading sign in…</main>}>
      <Login />
    </Suspense>
  );
}
