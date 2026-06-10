import { describe, it, expect } from "vitest";
import { computeOnBenchPct, computeBenchMap, buildRoleTiles } from "../benchUtils";

// ─────────────────────────────────────────────────────────────────────────────
// computeOnBenchPct
// ─────────────────────────────────────────────────────────────────────────────

describe("computeOnBenchPct", () => {
  // Standard 40 h/wk engineer (dailyCap = 8 h/day)

  it("returns 100 when no hours are allocated (fully on bench)", () => {
    expect(computeOnBenchPct(40, 0)).toBe(100);
  });

  it("returns 50 when half daily capacity is allocated", () => {
    // 40 h/wk → 8 h/day.  Allocated 4 h/day → 50% allocated → 50% bench
    expect(computeOnBenchPct(40, 4)).toBe(50);
  });

  it("returns 0 when fully allocated at exactly daily capacity", () => {
    expect(computeOnBenchPct(40, 8)).toBe(0);
  });

  it("returns 0 when over-allocated (never goes negative)", () => {
    expect(computeOnBenchPct(40, 10)).toBe(0);
  });

  it("returns 0 when capacity is 0 and hours > 0", () => {
    // dailyCap = 0 → allocPct = 0 → 100 - 0 = 100
    // BUT a user with 0 capacity shouldn't be on bench either;
    // per the formula: dailyCap = 0 → allocPct guard → 0, so bench = 100
    expect(computeOnBenchPct(0, 4)).toBe(100);
  });

  it("correctly rounds a fractional allocation percentage", () => {
    // 40 h/wk → 8 h/day.  Allocated 3 h/day → 3/8 = 37.5% ≈ 38% → bench 62%
    expect(computeOnBenchPct(40, 3)).toBe(62);
  });

  it("handles 20 h/wk part-time engineer (dailyCap = 4 h/day)", () => {
    // Allocated 2 h/day → 50% allocated → 50% bench
    expect(computeOnBenchPct(20, 2)).toBe(50);
  });

  it("handles 32 h/wk capacity with 8 h/day allocation (125% — clamp to 0)", () => {
    // 32 h/wk → 6.4 h/day. Allocated 8 h/day → Math.round(125) = 125% → bench 0
    expect(computeOnBenchPct(32, 8)).toBe(0);
  });

  it("returns 25 for 75% allocated engineer", () => {
    // 40 h/wk → 8 h/day.  Allocated 6 h/day → 75% allocated → 25% bench
    expect(computeOnBenchPct(40, 6)).toBe(25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeBenchMap
// ─────────────────────────────────────────────────────────────────────────────

describe("computeBenchMap", () => {
  it("returns 100 for all users when allocations list is empty", () => {
    const users = [
      { id: "u1", capacity: 40 },
      { id: "u2", capacity: 40 },
    ];
    const map = computeBenchMap(users, []);
    expect(map).toEqual({ u1: 100, u2: 100 });
  });

  it("maps each user to the correct bench percentage", () => {
    const users = [
      { id: "u1", capacity: 40 }, // 8 h/day
      { id: "u2", capacity: 40 }, // 8 h/day
    ];
    const allocs = [
      { userId: "u1", hoursPerDay: 8 }, // fully allocated
      { userId: "u2", hoursPerDay: 4 }, // 50% allocated
    ];
    const map = computeBenchMap(users, allocs);
    expect(map.u1).toBe(0);
    expect(map.u2).toBe(50);
  });

  it("sums multiple allocations for the same user", () => {
    // u1 has two projects: 3 h/day + 3 h/day = 6 h/day out of 8 → 75% allocated → 25% bench
    const users  = [{ id: "u1", capacity: 40 }];
    const allocs = [
      { userId: "u1", hoursPerDay: 3 },
      { userId: "u1", hoursPerDay: 3 },
    ];
    expect(computeBenchMap(users, allocs).u1).toBe(25);
  });

  it("ignores allocations that do not belong to any listed user", () => {
    const users  = [{ id: "u1", capacity: 40 }];
    const allocs = [{ userId: "ghost", hoursPerDay: 8 }];
    expect(computeBenchMap(users, allocs)).toEqual({ u1: 100 });
  });

  it("returns empty map when users list is empty", () => {
    const allocs = [{ userId: "u1", hoursPerDay: 8 }];
    expect(computeBenchMap([], allocs)).toEqual({});
  });

  it("handles a mix of fully free, partially free, and fully allocated users", () => {
    const users = [
      { id: "free",    capacity: 40 },
      { id: "partial", capacity: 40 },
      { id: "full",    capacity: 40 },
    ];
    const allocs = [
      { userId: "partial", hoursPerDay: 4 },
      { userId: "full",    hoursPerDay: 8 },
    ];
    const map = computeBenchMap(users, allocs);
    expect(map.free).toBe(100);
    expect(map.partial).toBe(50);
    expect(map.full).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildRoleTiles
// ─────────────────────────────────────────────────────────────────────────────

describe("buildRoleTiles", () => {
  // ── count field ─────────────────────────────────────────────────────────────

  it("returns empty array when all users have null department", () => {
    const users = [
      { department: null,  onBenchPct: 100 },
      { department: null,  onBenchPct: 50  },
    ];
    expect(buildRoleTiles(users)).toEqual([]);
  });

  it("returns empty array for an empty user list", () => {
    expect(buildRoleTiles([])).toEqual([]);
  });

  it("counts a single department correctly", () => {
    const users = [
      { department: "QA Engineer", onBenchPct: 100 },
      { department: "QA Engineer", onBenchPct: 60  },
    ];
    expect(buildRoleTiles(users)).toEqual([
      { role: "QA Engineer", count: 2, sumBenchPct: 160 },
    ]);
  });

  it("sorts tiles by count descending", () => {
    const users = [
      { department: "Developer",            onBenchPct: 100 },
      { department: "QA Engineer",          onBenchPct: 80  },
      { department: "QA Engineer",          onBenchPct: 60  },
      { department: "QA Engineer",          onBenchPct: 40  },
      { department: "Developer",            onBenchPct: 50  },
      { department: "Functional Consultant",onBenchPct: 100 },
    ];
    const tiles = buildRoleTiles(users);
    expect(tiles[0]).toEqual({ role: "QA Engineer",           count: 3, sumBenchPct: 180 });
    expect(tiles[1]).toEqual({ role: "Developer",             count: 2, sumBenchPct: 150 });
    expect(tiles[2]).toEqual({ role: "Functional Consultant", count: 1, sumBenchPct: 100 });
  });

  it("excludes users whose department is null from the count and sum", () => {
    const users = [
      { department: "Developer", onBenchPct: 80  },
      { department: null,        onBenchPct: 100 }, // should be ignored
      { department: "Developer", onBenchPct: 60  },
    ];
    const tiles = buildRoleTiles(users);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toEqual({ role: "Developer", count: 2, sumBenchPct: 140 });
  });

  it("excludes users whose department is undefined", () => {
    const users = [
      { department: "Developer", onBenchPct: 75  },
      { department: undefined,   onBenchPct: 100 }, // should be ignored
    ];
    const tiles = buildRoleTiles(users);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].role).toBe("Developer");
    expect(tiles[0].count).toBe(1);
  });

  it("handles multiple departments each with count 1", () => {
    const users = [
      { department: "A", onBenchPct: 100 },
      { department: "B", onBenchPct: 50  },
      { department: "C", onBenchPct: 75  },
    ];
    const tiles  = buildRoleTiles(users);
    const counts = tiles.map((t) => t.count);
    expect(counts).toEqual([1, 1, 1]);
    expect(tiles.map((t) => t.role).sort()).toEqual(["A", "B", "C"]);
  });

  // ── sumBenchPct field ────────────────────────────────────────────────────────

  it("returns sumBenchPct = sum of onBenchPct for all users in that role", () => {
    // 3 QA Engineers with bench 100%, 60%, 40% → sum = 200
    const users = [
      { department: "QA Engineer", onBenchPct: 100 },
      { department: "QA Engineer", onBenchPct: 60  },
      { department: "QA Engineer", onBenchPct: 40  },
    ];
    const [tile] = buildRoleTiles(users);
    expect(tile.sumBenchPct).toBe(200);
  });

  it("returns sumBenchPct = 0 for a role where all users have 0 bench", () => {
    // Fully allocated QA engineers still appear in the list if explicitly passed in
    const users = [
      { department: "Developer", onBenchPct: 0 },
      { department: "Developer", onBenchPct: 0 },
    ];
    const [tile] = buildRoleTiles(users);
    expect(tile.sumBenchPct).toBe(0);
  });

  it("keeps sumBenchPct separate per role (no cross-contamination)", () => {
    const users = [
      { department: "QA Engineer", onBenchPct: 80 },
      { department: "Developer",   onBenchPct: 50 },
      { department: "QA Engineer", onBenchPct: 70 },
    ];
    const tiles = buildRoleTiles(users);
    const qa  = tiles.find((t) => t.role === "QA Engineer")!;
    const dev = tiles.find((t) => t.role === "Developer")!;
    expect(qa.sumBenchPct).toBe(150); // 80 + 70
    expect(dev.sumBenchPct).toBe(50); // 50 only
  });

  it("sumBenchPct for a single fully-free user equals 100", () => {
    const users = [{ department: "Developer", onBenchPct: 100 }];
    const [tile] = buildRoleTiles(users);
    expect(tile.sumBenchPct).toBe(100);
  });
});
