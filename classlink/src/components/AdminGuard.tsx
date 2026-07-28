"use client";

import { useCurrentUser } from "@/components/UserContext";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  if (user.role !== "ADMIN") {
    return <p className="text-sm text-slate-500">Área restrita à administração da escola.</p>;
  }
  return <>{children}</>;
}
