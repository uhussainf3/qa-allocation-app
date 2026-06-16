import { describe, it, expect } from "vitest";
import {
  filterUsers,
  computeUtilPct,
  computeBenchCount,
  computeActiveProjectCount,
  computeFilteredLeaveCount,
  filterEndingSoon,
  buildDivisionRoleStats,
  type DashboardUser,
  type DashboardAllocation,
} from "../dashboardUtils";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function user(over: Partial<DashboardUser> = {}): DashboardUser {
  return {
    id: "u1",
    divisionId: "div-a",
    department: "Developer",
    capacity: 40, // weekly hours -> 8/day
    isOnshore: false,
    ...over,
  };
}

function alloc(over: Partial<DashboardAllocation> = {}): DashboardAllocation {
  return { userId: "u1", projectId: "p1", hoursPerDay: 8, ...over };
}

// ─── filterUsers ────────────────────────────────────────────────────────────

describe("filterUsers", () => {
  const users = [
    user({ id: "u1", divisionId: "div-a", department: "Developer" }),
    user({ id: "u2", divisionId: "div-a", department: "QA Engineer" }),
    user({ id: "u3", divisionId: "div-b", department: "Developer" }),
  ];

  it("returns all users when no filters applied", () => {
    expect(filterUsers(users, "", "")).toHaveLength(3);
  });

  it("filters by division only", () => {
    const result = filterUsers(users, "div-a", "");
    expect(result.map((u) => u.id)).toEqual(["u1", "u2"]);
  });

  it("filters by role only", () => {
    const result = filterUsers(users, "", "Developer");
    expect(result.map((u) => u.id)).toEqual(["u1", "u3"]);
  });

  it("filters by division and role combined", () => {
    const result = filterUsers(users, "div-a", "Developer");
    expect(result.map((u) => u.id)).toEqual(["u1"]);
  });

  it("returns empty array when no users match", () => {
    expect(filterUsers(users, "div-z", "")).toEqual([]);
  });
});

// ─── computeUtilPct ─────────────────────────────────────────────────────────

describe("computeUtilPct", () => {
  it("returns 0 for an empty user list", () => {
    expect(computeUtilPct([], [])).toBe(0);
  });

  it("returns 0 when total capacity is 0", () => {
    const users = [user({ id: "u1", capacity: 0 })];
    expect(computeUtilPct(users, [alloc({ userId: "u1", hoursPerDay: 4 })])).toBe(0);
  });

  it("computes the percentage of capacity allocated today", () => {
    // capacity 40/wk -> 8/day; allocated 4h -> 50%
    const users = [user({ id: "u1", capacity: 40 })];
    expect(computeUtilPct(users, [alloc({ userId: "u1", hoursPerDay: 4 })])).toBe(50);
  });

  it("ignores allocations belonging to users outside the set", () => {
    const users = [user({ id: "u1", capacity: 40 })];
    const allocs = [alloc({ userId: "u1", hoursPerDay: 8 }), alloc({ userId: "other", hoursPerDay: 100 })];
    expect(computeUtilPct(users, allocs)).toBe(100);
  });

  it("can exceed 100% when over-allocated", () => {
    const users = [user({ id: "u1", capacity: 40 })];
    expect(computeUtilPct(users, [alloc({ userId: "u1", hoursPerDay: 10 })])).toBe(125);
  });
});

// ─── computeBenchCount ──────────────────────────────────────────────────────

describe("computeBenchCount", () => {
  it("counts a user with no allocations as on bench", () => {
    const users = [user({ id: "u1", capacity: 40 })];
    expect(computeBenchCount(users, [])).toBe(1);
  });

  it("does not count a fully allocated user", () => {
    const users = [user({ id: "u1", capacity: 40 })];
    expect(computeBenchCount(users, [alloc({ userId: "u1", hoursPerDay: 8 })])).toBe(0);
  });

  it("counts a partially allocated user", () => {
    const users = [user({ id: "u1", capacity: 40 })];
    expect(computeBenchCount(users, [alloc({ userId: "u1", hoursPerDay: 4 })])).toBe(1);
  });

  it("never counts a user with zero capacity", () => {
    const users = [user({ id: "u1", capacity: 0 })];
    expect(computeBenchCount(users, [])).toBe(0);
  });

  it("excludes onshore users even when they have bench capacity (mirrors bench/page.tsx logic)", () => {
    const users = [
      user({ id: "u1", isOnshore: false, capacity: 40 }), // offshore — counted
      user({ id: "u2", isOnshore: true,  capacity: 40 }), // onshore  — excluded
    ];
    // Neither has allocations today; only u1 (offshore) should be counted
    expect(computeBenchCount(users, [])).toBe(1);
  });

  it("counts offshore users on bench and ignores onshore users regardless of allocation", () => {
    const users = [
      user({ id: "u1", isOnshore: false, capacity: 40 }), // offshore, partially allocated → bench
      user({ id: "u2", isOnshore: true,  capacity: 40 }), // onshore → always excluded
      user({ id: "u3", isOnshore: false, capacity: 40 }), // offshore, fully allocated → not on bench
    ];
    const allocs = [
      alloc({ userId: "u1", hoursPerDay: 4 }), // 50% → on bench
      alloc({ userId: "u3", hoursPerDay: 8 }), // 100% → NOT on bench
    ];
    expect(computeBenchCount(users, allocs)).toBe(1);
  });
});

// ─── computeActiveProjectCount ──────────────────────────────────────────────

describe("computeActiveProjectCount", () => {
  const activeProjects = [
    { id: "p1", divisionId: "div-a" },
    { id: "p2", divisionId: "div-a" },
    { id: "p3", divisionId: "div-b" },
  ];

  it("returns total active project count with no filters", () => {
    expect(computeActiveProjectCount(activeProjects, [], [], "", "")).toBe(3);
  });

  it("returns 0 for an empty active project list", () => {
    expect(computeActiveProjectCount([], [], [], "", "")).toBe(0);
  });

  it("scopes to division when division filter set and no role filter", () => {
    expect(computeActiveProjectCount(activeProjects, [], [], "div-a", "")).toBe(2);
  });

  it("counts distinct projects with an allocation from the filtered users (role filter)", () => {
    const users = [user({ id: "u1" })];
    const allocs = [
      alloc({ userId: "u1", projectId: "p1" }),
      alloc({ userId: "u1", projectId: "p2" }),
    ];
    expect(computeActiveProjectCount(activeProjects, allocs, users, "", "Developer")).toBe(2);
  });

  it("combines division scoping with role-based allocation matching", () => {
    const users = [user({ id: "u1" })];
    // u1 is allocated to p1 (div-a) and p3 (div-b); division filter narrows to div-a
    const allocs = [
      alloc({ userId: "u1", projectId: "p1" }),
      alloc({ userId: "u1", projectId: "p3" }),
    ];
    expect(computeActiveProjectCount(activeProjects, allocs, users, "div-a", "Developer")).toBe(1);
  });

  it("returns 0 when the filtered users have no allocations to active projects", () => {
    const users = [user({ id: "u1" })];
    expect(computeActiveProjectCount(activeProjects, [], users, "", "Developer")).toBe(0);
  });
});

// ─── computeFilteredLeaveCount ──────────────────────────────────────────────

describe("computeFilteredLeaveCount", () => {
  const leaves = [
    { divisionId: "div-a", department: "Developer" },
    { divisionId: "div-a", department: "QA Engineer" },
    { divisionId: "div-b", department: "Developer" },
  ];

  it("returns total count with no filters", () => {
    expect(computeFilteredLeaveCount(leaves, "", "")).toBe(3);
  });

  it("filters by division only", () => {
    expect(computeFilteredLeaveCount(leaves, "div-a", "")).toBe(2);
  });

  it("filters by role only", () => {
    expect(computeFilteredLeaveCount(leaves, "", "Developer")).toBe(2);
  });

  it("filters by division and role combined", () => {
    expect(computeFilteredLeaveCount(leaves, "div-a", "Developer")).toBe(1);
  });

  it("returns 0 when nothing matches", () => {
    expect(computeFilteredLeaveCount(leaves, "div-z", "")).toBe(0);
  });
});

// ─── filterEndingSoon ───────────────────────────────────────────────────────

describe("filterEndingSoon", () => {
  const items = [
    { divisionId: "div-a", department: "Developer", name: "a" },
    { divisionId: "div-a", department: "QA Engineer", name: "b" },
    { divisionId: "div-b", department: "Developer", name: "c" },
  ];

  it("returns all items with no filters", () => {
    expect(filterEndingSoon(items, "", "")).toHaveLength(3);
  });

  it("filters by division", () => {
    expect(filterEndingSoon(items, "div-a", "").map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("filters by role", () => {
    expect(filterEndingSoon(items, "", "Developer").map((i) => i.name)).toEqual(["a", "c"]);
  });

  it("filters by division and role combined", () => {
    expect(filterEndingSoon(items, "div-a", "Developer").map((i) => i.name)).toEqual(["a"]);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterEndingSoon(items, "div-z", "")).toEqual([]);
  });
});

// ─── buildDivisionRoleStats ─────────────────────────────────────────────────

describe("buildDivisionRoleStats", () => {
  const users = [
    user({ id: "u1", divisionId: "div-a", department: "Developer", capacity: 40 }),
    user({ id: "u2", divisionId: "div-a", department: "QA Engineer", capacity: 40 }),
    user({ id: "u3", divisionId: "div-b", department: "Developer", capacity: 40 }),
  ];

  it("computes headcount and utilisation per division with no role filter", () => {
    const allocs = [alloc({ userId: "u1", hoursPerDay: 8 }), alloc({ userId: "u2", hoursPerDay: 4 })];
    const result = buildDivisionRoleStats(["div-a", "div-b"], users, allocs, "");
    expect(result).toEqual([
      { id: "div-a", headcount: 2, utilPct: 75 }, // (8+4)/(8+8) = 75%
      { id: "div-b", headcount: 1, utilPct: 0 },
    ]);
  });

  it("narrows headcount and utilisation to the role filter", () => {
    const allocs = [alloc({ userId: "u1", hoursPerDay: 8 }), alloc({ userId: "u2", hoursPerDay: 4 })];
    const result = buildDivisionRoleStats(["div-a", "div-b"], users, allocs, "Developer");
    expect(result).toEqual([
      { id: "div-a", headcount: 1, utilPct: 100 }, // only u1 (Developer), 8/8 = 100%
      { id: "div-b", headcount: 1, utilPct: 0 },   // u3 (Developer) has capacity but no allocation
    ]);
  });

  it("returns headcount 0 and utilPct 0 for a division with no matching members", () => {
    const result = buildDivisionRoleStats(["div-a"], users, [], "Project Manager");
    expect(result).toEqual([{ id: "div-a", headcount: 0, utilPct: 0 }]);
  });
});
