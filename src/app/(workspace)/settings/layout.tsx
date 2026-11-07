import { forbidden } from "next/navigation";
import { requireUser } from "@/server/auth";
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.role !== "HEAD") forbidden();
  return children;
}
