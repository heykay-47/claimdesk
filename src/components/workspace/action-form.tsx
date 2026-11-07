"use client";
import { useState, useTransition, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { runAction, type ActionName } from "@/app/actions";
export function ActionForm({
  action,
  values = {},
  children,
  label = "Save changes",
  success = "Changes saved",
  redirectTo,
  confirm,
  className = "",
}: {
  action: ActionName;
  values?: Record<string, unknown>;
  children?: ReactNode;
  label?: string;
  success?: string;
  redirectTo?: string;
  confirm?: string;
  className?: string;
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (confirm && !window.confirm(confirm)) return;
    setError("");
    startTransition(async () => {
      const result = await runAction(action, {
        ...values,
        ...Object.fromEntries(form),
      });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(success);
      if (result.data?.aiError || result.data?.error)
        toast.warning(result.data.aiError ?? result.data.error);
      const href =
        action === "createClaim" && result.data?.code
          ? `/claims/${result.data.code}`
          : action === "logQuery" && result.data?.id
            ? `/queries/${result.data.id}`
            : redirectTo;
      if (href) router.push(href);
      router.refresh();
    });
  }
  return (
    <form onSubmit={submit} className={className}>
      <fieldset disabled={pending}>{children}</fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
    </form>
  );
}
export function ActionButton({
  action,
  values,
  children,
  success = "Changes saved",
  className = "btn small",
  confirm,
}: {
  action: ActionName;
  values: Record<string, unknown>;
  children: ReactNode;
  success?: string;
  className?: string;
  confirm?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        startTransition(async () => {
          const result = await runAction(action, values);
          if (!result.ok) toast.error(result.error);
          else {
            toast.success(success);
            if (result.data?.error || result.data?.aiError)
              toast.warning(result.data.error ?? result.data.aiError);
            router.refresh();
          }
        });
      }}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
