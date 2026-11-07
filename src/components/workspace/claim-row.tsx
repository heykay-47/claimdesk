"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
export function ClaimRow({
  code,
  children,
}: {
  code: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      className="click-row"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("a,button,input"))
          router.push(`/claims/${code}`);
      }}
    >
      {children}
    </tr>
  );
}
