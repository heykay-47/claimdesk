"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Files,
  Inbox,
  ListChecks,
  History,
  LogOut,
  ChartNoAxesColumn,
} from "lucide-react";
import { logout } from "@/app/login/actions";
import type { SessionUser } from "@/server/auth";
export function Sidebar({
  user,
  openCount,
  overdue,
}: {
  user: SessionUser;
  openCount: number;
  overdue: boolean;
}) {
  const path = usePathname();
  const items = [
    { href: "/claims", label: "Claims", icon: Files },
    { href: "/queries", label: "Queries", icon: Inbox },
    { href: "/insights", label: "Insights", icon: ChartNoAxesColumn },
    ...(user.role === "HEAD"
      ? [
          {
            href: "/settings/checklists",
            label: "Checklist rules",
            icon: ListChecks,
          },
          { href: "/settings/audit", label: "Audit log", icon: History },
        ]
      : []),
  ];
  return (
    <aside className="sidebar">
      <Link href="/claims" className="wordmark" aria-label="ClaimDesk home">
        <span className="brand-mark">
          <Files size={17} strokeWidth={1.8} />
        </span>
        ClaimDesk
      </Link>
      <nav aria-label="Main navigation">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link ${path.startsWith(href) ? "active" : ""}`}
            aria-current={path.startsWith(href) ? "page" : undefined}
          >
            <Icon size={17} strokeWidth={1.7} />
            <span>{label}</span>
            {href === "/queries" && openCount > 0 && (
              <span className={`nav-count ${overdue ? "overdue" : ""}`}>
                {openCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <p className="demo-note">
          Synthetic demo data
          <br />
          No patient records
        </p>
        <details className="user-menu">
          <summary>
            <span className="avatar">
              {user.name
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </span>
            <span>
              <strong>{user.name}</strong>
              <span className="muted">
                {user.role === "HEAD" ? "Desk head" : "Desk executive"}
              </span>
            </span>
          </summary>
          <form action={logout}>
            <button className="btn w-full" type="submit">
              <LogOut size={14} />
              Sign out
            </button>
          </form>
        </details>
      </div>
    </aside>
  );
}
