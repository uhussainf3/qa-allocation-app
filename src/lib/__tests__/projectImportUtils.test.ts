import { describe, it, expect } from "vitest";
import {
  parseProjectDate,
  mapStatus,
  planProjectImport,
  type ProjImportRow,
  type ProjectImportLookups,
} from "../projectImportUtils";

// ─────────────────────────────────────────────────────────────────────────────
// parseProjectDate
// ─────────────────────────────────────────────────────────────────────────────

describe("parseProjectDate", () => {
  it("parses a YYYY.MM.DD date", () => {
    const d = parseProjectDate("2026.06.15");
    expect(d?.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("returns null for undefined or empty input", () => {
    expect(parseProjectDate(undefined)).toBeNull();
    expect(parseProjectDate("")).toBeNull();
    expect(parseProjectDate("   ")).toBeNull();
  });

  it("returns null for the wrong number of parts", () => {
    expect(parseProjectDate("2026-06-15")).toBeNull();
    expect(parseProjectDate("2026.06")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapStatus
// ─────────────────────────────────────────────────────────────────────────────

describe("mapStatus", () => {
  it("maps 'active' and 'on demand' to ACTIVE", () => {
    expect(mapStatus("Active")).toBe("ACTIVE");
    expect(mapStatus("On Demand")).toBe("ACTIVE");
  });

  it("maps 'close', 'closed', and 'completed' to COMPLETED", () => {
    expect(mapStatus("Close")).toBe("COMPLETED");
    expect(mapStatus("Closed")).toBe("COMPLETED");
    expect(mapStatus("Completed")).toBe("COMPLETED");
  });

  it("defaults unknown statuses to ACTIVE", () => {
    expect(mapStatus("On Hold")).toBe("ACTIVE");
    expect(mapStatus("")).toBe("ACTIVE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// planProjectImport
// ─────────────────────────────────────────────────────────────────────────────

function row(overrides: Partial<ProjImportRow> = {}): ProjImportRow {
  return {
    projectId:  "PRJ1",
    name:       "New Project",
    status:     "Active",
    directorId: "DIR1",
    ...overrides,
  };
}

function emptyLookups(overrides: Partial<ProjectImportLookups> = {}): ProjectImportLookups {
  return {
    divisionByDirectorId: new Map(),
    pmCandidates: [],
    existingByExternalId: new Map(),
    existingByCode: new Map(),
    ...overrides,
  };
}

describe("planProjectImport", () => {
  it("creates a brand new project when no existing match is found", () => {
    const plan = planProjectImport([row()], emptyLookups());

    expect(plan.created).toEqual(["New Project"]);
    expect(plan.updated).toEqual([]);
    expect(plan.projectsToCreate).toEqual([
      {
        name: "New Project",
        code: "P-PRJ1",
        status: "ACTIVE",
        divisionId: null,
        externalId: "PRJ1",
        managerId: null,
        startDate: null,
        endDate: null,
      },
    ]);
  });

  it("resolves divisionId from the director lookup", () => {
    const lookups = emptyLookups({
      divisionByDirectorId: new Map([["DIR1", "div-1"]]),
    });
    const plan = planProjectImport([row()], lookups);

    expect(plan.projectsToCreate[0].divisionId).toBe("div-1");
  });

  it("resolves managerId via case-insensitive PM name match", () => {
    const lookups = emptyLookups({
      pmCandidates: [{ id: "pm-1", name: "Jane Doe" }],
    });
    const plan = planProjectImport([row({ pmName: "jane" })], lookups);

    expect(plan.projectsToCreate[0].managerId).toBe("pm-1");
  });

  it("leaves managerId null when no PM candidate matches", () => {
    const lookups = emptyLookups({
      pmCandidates: [{ id: "pm-1", name: "Jane Doe" }],
    });
    const plan = planProjectImport([row({ pmName: "Bob" })], lookups);

    expect(plan.projectsToCreate[0].managerId).toBeNull();
  });

  it("updates an existing project matched by externalId", () => {
    const lookups = emptyLookups({
      existingByExternalId: new Map([
        ["PRJ1", { id: "proj-1", divisionId: "old-div", startDate: null, endDate: null }],
      ]),
    });
    const plan = planProjectImport([row({ name: "Renamed Project" })], lookups);

    expect(plan.created).toEqual([]);
    expect(plan.updated).toEqual(["Renamed Project"]);
    expect(plan.projectsToUpdate).toEqual([
      {
        id: "proj-1",
        projectId: "PRJ1",
        data: {
          name: "Renamed Project",
          status: "ACTIVE",
          divisionId: "old-div",
          externalId: "PRJ1",
          startDate: null,
          endDate: null,
        },
      },
    ]);
  });

  it("falls back to matching by code when externalId isn't found", () => {
    const lookups = emptyLookups({
      existingByCode: new Map([
        ["P-PRJ1", { id: "proj-legacy", divisionId: null, startDate: null, endDate: null }],
      ]),
    });
    const plan = planProjectImport([row()], lookups);

    expect(plan.updated).toEqual(["New Project"]);
    expect(plan.projectsToUpdate[0].id).toBe("proj-legacy");
  });

  it("preserves existing dates when the CSV row has none", () => {
    const existingStart = new Date("2025-01-01T00:00:00.000Z");
    const lookups = emptyLookups({
      existingByExternalId: new Map([
        ["PRJ1", { id: "proj-1", divisionId: null, startDate: existingStart, endDate: null }],
      ]),
    });
    const plan = planProjectImport([row()], lookups);

    expect(plan.projectsToUpdate[0].data.startDate).toBe(existingStart);
  });

  it("merges duplicate rows for the same projectId into a single create", () => {
    const plan = planProjectImport(
      [
        row({ name: "First Pass", startDate: "2026.01.01", status: "Active" }),
        row({ name: "Second Pass", startDate: "", endDate: "2026.12.31", status: "Closed" }),
      ],
      emptyLookups()
    );

    expect(plan.projectsToCreate).toHaveLength(1);
    expect(plan.projectsToCreate[0]).toMatchObject({
      name: "Second Pass",
      status: "COMPLETED",
      startDate: new Date("2026-01-01T00:00:00.000Z"), // kept from first row
      endDate: new Date("2026-12-31T00:00:00.000Z"),   // set by second row
    });
    expect(plan.created).toEqual(["Second Pass"]);
  });

  it("does not let a later row's missing PM clear an earlier-resolved managerId", () => {
    const lookups = emptyLookups({
      pmCandidates: [{ id: "pm-1", name: "Jane Doe" }],
    });
    const plan = planProjectImport(
      [
        row({ pmName: "Jane" }),
        row({ pmName: "" }),
      ],
      lookups
    );

    expect(plan.projectsToCreate[0].managerId).toBe("pm-1");
  });

  it("processes multiple distinct projects independently", () => {
    const plan = planProjectImport(
      [row({ projectId: "PRJ1", name: "Alpha" }), row({ projectId: "PRJ2", name: "Beta" })],
      emptyLookups()
    );

    expect(plan.created).toEqual(["Alpha", "Beta"]);
    expect(plan.projectsToCreate.map((p) => p.code)).toEqual(["P-PRJ1", "P-PRJ2"]);
  });
});
