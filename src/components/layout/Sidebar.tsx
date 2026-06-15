"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Role } from "@/types/enums";
import { canViewExecutiveDashboard } from "@/lib/accessUtils";

type NavItem = { href: string; label: string };
type NavGroup = { group: string; items: NavItem[]; roles?: Role[] };

const NAV: NavGroup[] = [
  {
    // Visibility for this group is handled by canViewExecutiveDashboard()
    // below (ADMIN/EXECUTIVE roles, or any user with jobTitle "VP").
    group: "Overview",
    items: [
      { href: "/dashboard", label: "Executive Dashboard" },
    ],
  },
  {
    group: "Plan",
    items: [
      { href: "/allocations",     label: "Allocations"        },
      { href: "/allocation-list", label: "Manage Allocations"  },
      { href: "/my-projects",     label: "My Projects"         },
      { href: "/pipeline",        label: "Pipeline"            },
      { href: "/capacity",        label: "Capacity"            },
      { href: "/forecast",        label: "Forecast"            },
      { href: "/leave",           label: "Leave"               },
    ],
  },
  {
    group: "Work",
    items: [
      { href: "/projects",    label: "Projects"    },
      { href: "/tasks",       label: "My Tasks"    },
      { href: "/hours",       label: "Hours log"   },
      { href: "/timesheets",  label: "Timesheets"  },
      { href: "/requests",    label: "Requests"    },
    ],
  },
  {
    group: "Insights",
    items: [
      { href: "/conflicts", label: "Conflicts"    },
      { href: "/bench",     label: "Bench"        },
      { href: "/skills",    label: "Skill matrix" },
      { href: "/audit",     label: "Activity log" },
    ],
    roles: ["ADMIN", "EXECUTIVE", "DIVISION_OWNER", "PROJECT_MANAGER"],
  },
  {
    group: "Admin",
    items: [
      { href: "/divisions",    label: "Divisions"     },
      { href: "/team",         label: "Team"          },
      { href: "/import",       label: "Import"        },
      { href: "/notifications", label: "Notifications" },
      { href: "/settings",     label: "Settings"      },
    ],
    roles: ["ADMIN"],
  },
];

interface Props {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: Role;
    jobTitle?: string | null;
  };
}

export function Sidebar({ user }: Props) {
  const pathname = usePathname();

  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel: Record<Role, string> = {
    ADMIN:          "Admin",
    EXECUTIVE:      "Executive",
    DIVISION_OWNER: "Division Owner",
    PROJECT_MANAGER:"Project Manager",
    MEMBER:         "Member",
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" />
        <span>Folio3 Allocation</span>
      </div>

      <nav className="side-nav">
        {NAV.filter((grp) => {
          // "Overview" (Executive Dashboard) uses the shared access
          // predicate so ADMIN/EXECUTIVE roles AND any VP-titled user
          // see the link (kept in sync with proxy.ts + dashboard guard).
          if (grp.group === "Overview") return canViewExecutiveDashboard(user.role, user.jobTitle);
          return !grp.roles || grp.roles.includes(user.role);
        }).map((grp) => (
          <div className="side-group" key={grp.group}>
            <div className="side-label">{grp.group}</div>
            {grp.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={pathname === item.href ? "active" : ""}
              >
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <span className="avatar">{initials}</span>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{user.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {roleLabel[user.role] ?? user.role}
          </div>
        </div>
        <button
          className="iconbtn"
          title="Sign out"
          style={{ marginLeft: "auto" }}
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          ↩
        </button>
      </div>
    </aside>
  );
}
