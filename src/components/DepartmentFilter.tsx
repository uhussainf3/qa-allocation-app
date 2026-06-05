"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  departments: string[];
  value:       string;
}

export function DepartmentFilter({ departments, value }: Props) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [, start]    = useTransition();

  function onChange(dept: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (dept) params.set("department", dept);
    else      params.delete("department");
    start(() => router.replace(`${pathname}?${params.toString()}`));
  }

  return (
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ minWidth: 160 }}
    >
      <option value="">All Departments</option>
      {departments.map((d) => (
        <option key={d} value={d}>{d}</option>
      ))}
    </select>
  );
}
