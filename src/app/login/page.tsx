import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

async function Login() {
  if (await getSession()) redirect("/");
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center px-5 py-12">
      <Card className="w-full">
        <CardHeader>
          <p className="mb-4 text-sm font-medium tracking-wide text-muted-foreground">
            CLAIMDESK
          </p>
          <CardTitle className="text-2xl">Sign in to your desk</CardTitle>
          <CardDescription>
            Hospital cashless claims and TPA tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
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
