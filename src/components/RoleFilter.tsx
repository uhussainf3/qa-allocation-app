"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  roles: string[];
  /** The current value — pass `searchParams.role ?? ""` from the server page */
  value: string;
}

export function RoleFilter({ roles, value }: Props) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [, start]    = useTransition();

  function onChange(role: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (role) params.set("role", role);
    else      params.delete("role");
    start(() => router.replace(`${pathname}?${params.toString()}`));
  }

  return (
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ minWidth: 180 }}
    >
      <option value="">All Roles</option>
      {roles.map((r) => (
        <option key={r} value={r}>{r}</option>
      ))}
    </select>
  );
}
