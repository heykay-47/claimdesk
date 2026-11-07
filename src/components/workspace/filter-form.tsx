"use client";
import {
  useEffect,
  useRef,
  useTransition,
  type ReactNode,
  type FormEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function FilterForm({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    for (const element of Array.from(form.current?.elements ?? [])) {
      if (!(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement
      ))
        continue;
      if (
        element === document.activeElement &&
        element instanceof HTMLInputElement &&
        element.type === "search"
      )
        continue;
      if (element instanceof HTMLInputElement && element.type === "checkbox")
        element.checked = params.get(element.name) === element.value;
      else
        element.value =
          params.get(element.name) ??
          (element.name === "stage" ? "PREAUTH" : "");
    }
  }, [params]);
  function apply() {
    if (!form.current) return;
    const next = new URLSearchParams();
    for (const [key, value] of new FormData(form.current))
      if (typeof value === "string" && value) next.set(key, value);
    startTransition(() =>
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
        scroll: false,
      }),
    );
  }
  function change(event: FormEvent<HTMLFormElement>) {
    clearTimeout(timer.current);
    if (
      event.target instanceof HTMLInputElement &&
      event.target.type === "search"
    )
      timer.current = setTimeout(apply, 300);
    else apply();
  }
  return (
    <form
      ref={form}
      className="filter-bar"
      aria-busy={pending}
      onChange={change}
      onSubmit={(event) => {
        event.preventDefault();
        clearTimeout(timer.current);
        apply();
      }}
    >
      {children}
      <span className="sr-only" role="status">
        {pending ? "Updating results" : ""}
      </span>
    </form>
  );
}
