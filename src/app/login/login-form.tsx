"use client";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: null });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  function fill(account: string) {
    setEmail(account);
    setPassword("ClaimDesk@2026");
    toast.success("Demo credentials filled. Select Sign in to continue.");
  }
  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="space-y-2 border-t pt-5">
        <p className="text-sm text-muted-foreground">
          Demo accounts. Select one to fill in the form.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fill("desk@claimdesk.demo")}
          >
            Desk executive
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fill("head@claimdesk.demo")}
          >
            Desk head
          </Button>
        </div>
      </div>
    </form>
  );
}
