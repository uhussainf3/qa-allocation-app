"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Division = { id: string; name: string; code: string; color: string };

interface Props {
  divisions: Division[];
  /** The current value — pass `searchParams.division ?? ""` from the server page */
  value: string;
}

export function DivisionFilter({ divisions, value }: Props) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [, start]    = useTransition();

  function onChange(divId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (divId) params.set("division", divId);
    else       params.delete("division");
    start(() => router.replace(`${pathname}?${params.toString()}`));
  }

  return (
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ minWidth: 180 }}
    >
      <option value="">All Divisions</option>
      {divisions.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name} ({d.code})
        </option>
      ))}
    </select>
  );
}
