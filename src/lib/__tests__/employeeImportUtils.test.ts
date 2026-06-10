import { describe, it, expect } from "vitest";
import {
  mapRole,
  mapDepartment,
  planEmployeeImport,
  type EmpImportRow,
  type EmployeeImportLookups,
} from "../employeeImportUtils";

// ─────────────────────────────────────────────────────────────────────────────
// mapRole
// ─────────────────────────────────────────────────────────────────────────────

describe("mapRole", () => {
  it("maps 'pm' to PROJECT_MANAGER", () => {
    expect(mapRole("PM")).toEqual({ role: "PROJECT_MANAGER" });
    expect(mapRole(" pm ")).toEqual({ role: "PROJECT_MANAGER" });
  });

  it("maps any other role to MEMBER", () => {
    expect(mapRole("Dev")).toEqual({ role: "MEMBER" });
    expect(mapRole("QA")).toEqual({ role: "MEMBER" });
    expect(mapRole("")).toEqual({ role: "MEMBER" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapDepartment
// ─────────────────────────────────────────────────────────────────────────────

describe("mapDepartment", () => {
  it("maps 'dev' and 'ui' to Developer", () => {
    expect(mapDepartment("Dev")).toBe("Developer");
    expect(mapDepartment("UI")).toBe("Developer");
  });

  it("maps 'qa' to QA Engineer", () => {
    expect(mapDepartment("QA")).toBe("QA Engineer");
  });

  it("maps 'pm' to Project Manager", () => {
    expect(mapDepartment("PM")).toBe("Project Manager");
  });

  it("maps 'fc' to Functional Consultant", () => {
    expect(mapDepartment("FC")).toBe("Functional Consultant");
  });

  it("maps 'product manager' to Product Manager", () => {
    expect(mapDepartment("Product Manager")).toBe("Product Manager");
  });

  it("returns null for unrecognised roles", () => {
    expect(mapDepartment("Director")).toBeNull();
    expect(mapDepartment("")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// planEmployeeImport
// ─────────────────────────────────────────────────────────────────────────────

function row(overrides: Partial<EmpImportRow> = {}): EmpImportRow {
  return {
    fomsId: "F1",
    name: "New Hire",
    email: "newhire@example.com",
    rmRole: "Dev",
    position: "Software Engineer",
    ...overrides,
  };
}

function emptyLookups(overrides: Partial<EmployeeImportLookups> = {}): EmployeeImportLookups {
  return {
    directorsByExternalId: new Map(),
    usersByExternalId: new Map(),
    usersByEmail: new Map(),
    existingJobTitles: new Set(),
    ...overrides,
  };
}

describe("planEmployeeImport", () => {
  it("creates a brand new user when neither externalId nor email match", () => {
    const plan = planEmployeeImport([row()], emptyLookups());

    expect(plan.created).toEqual(["New Hire"]);
    expect(plan.skipped).toEqual([]);
    expect(plan.usersToCreate).toEqual([
      {
        name: "New Hire",
        email: "newhire@example.com",
        role: "MEMBER",
        jobTitle: "Software Engineer",
        department: "Developer",
        externalId: "F1",
        divisionId: null,
        managerId: null,
        isActive: true,
        capacity: 40,
      },
    ]);
  });

  it("queues a new job title only when it doesn't already exist", () => {
    const known = planEmployeeImport([row({ position: "Senior QA Engineer" })], emptyLookups({
      existingJobTitles: new Set(["Senior QA Engineer"]),
    }));
    expect(known.jobTitlesToCreate).toEqual([]);

    const unknown = planEmployeeImport([row({ position: "Senior QA Engineer" })], emptyLookups());
    expect(unknown.jobTitlesToCreate).toEqual(["Senior QA Engineer"]);
  });

  it("dedupes job titles across multiple rows", () => {
    const plan = planEmployeeImport(
      [row({ fomsId: "F1", email: "a@x.com" }), row({ fomsId: "F2", email: "b@x.com" })],
      emptyLookups()
    );
    expect(plan.jobTitlesToCreate).toEqual(["Software Engineer"]);
  });

  it("resolves divisionId and managerId from the dominant director", () => {
    const lookups = emptyLookups({
      directorsByExternalId: new Map([["DIR1", { id: "director-id", divisionId: "div-1" }]]),
    });
    const plan = planEmployeeImport([row({ dominantDirectorId: "DIR1" })], lookups);

    expect(plan.usersToCreate[0].divisionId).toBe("div-1");
    expect(plan.usersToCreate[0].managerId).toBe("director-id");
  });

  it("leaves divisionId/managerId null when the dominant director isn't found", () => {
    const plan = planEmployeeImport([row({ dominantDirectorId: "UNKNOWN" })], emptyLookups());

    expect(plan.usersToCreate[0].divisionId).toBeNull();
    expect(plan.usersToCreate[0].managerId).toBeNull();
  });

  it("updates an existing user matched by externalId and marks it skipped", () => {
    const lookups = emptyLookups({
      usersByExternalId: new Map([
        ["F1", { id: "u1", role: "MEMBER", divisionId: null, managerId: null, externalId: "F1" }],
      ]),
    });
    const plan = planEmployeeImport([row({ rmRole: "PM", position: "Project Manager" })], lookups);

    expect(plan.created).toEqual([]);
    expect(plan.skipped).toEqual(["F1"]);
    expect(plan.usersToCreate).toEqual([]);
    expect(plan.usersToUpdate).toEqual([
      {
        id: "u1",
        fomsId: "F1",
        data: {
          jobTitle: "Project Manager",
          department: "Project Manager",
          role: "PROJECT_MANAGER", // promoted from MEMBER because RM says PM
        },
      },
    ]);
  });

  it("does not overwrite divisionId/managerId on an existing user that already has them", () => {
    const lookups = emptyLookups({
      directorsByExternalId: new Map([["DIR1", { id: "new-director", divisionId: "new-div" }]]),
      usersByExternalId: new Map([
        ["F1", { id: "u1", role: "MEMBER", divisionId: "old-div", managerId: "old-manager", externalId: "F1" }],
      ]),
    });
    const plan = planEmployeeImport([row({ dominantDirectorId: "DIR1" })], lookups);

    expect(plan.usersToUpdate[0].data).not.toHaveProperty("divisionId");
    expect(plan.usersToUpdate[0].data).not.toHaveProperty("managerId");
  });

  it("does not demote an existing PROJECT_MANAGER back to MEMBER", () => {
    const lookups = emptyLookups({
      usersByExternalId: new Map([
        ["F1", { id: "u1", role: "PROJECT_MANAGER", divisionId: null, managerId: null, externalId: "F1" }],
      ]),
    });
    const plan = planEmployeeImport([row({ rmRole: "Dev" })], lookups);

    expect(plan.usersToUpdate[0].data).not.toHaveProperty("role");
  });

  it("matches an existing user by email, sets externalId, and preserves ADMIN role", () => {
    const lookups = emptyLookups({
      usersByEmail: new Map([
        ["newhire@example.com", { id: "u1", role: "ADMIN", divisionId: null, managerId: null, externalId: null }],
      ]),
    });
    const plan = planEmployeeImport([row({ rmRole: "PM" })], lookups);

    expect(plan.created).toEqual([]);
    expect(plan.skipped).toEqual(["F1"]);
    expect(plan.usersToUpdate[0].data).toMatchObject({
      externalId: "F1",
      role: "ADMIN",
    });
  });

  it("fills divisionId/managerId for an email-matched user only if currently missing", () => {
    const lookups = emptyLookups({
      directorsByExternalId: new Map([["DIR1", { id: "director-id", divisionId: "div-1" }]]),
      usersByEmail: new Map([
        ["newhire@example.com", { id: "u1", role: "MEMBER", divisionId: null, managerId: "existing-manager", externalId: null }],
      ]),
    });
    const plan = planEmployeeImport([row({ dominantDirectorId: "DIR1" })], lookups);

    expect(plan.usersToUpdate[0].data.divisionId).toBe("div-1");
    expect(plan.usersToUpdate[0].data.managerId).toBe("existing-manager");
  });

  it("processes multiple rows independently", () => {
    const lookups = emptyLookups({
      usersByExternalId: new Map([
        ["F1", { id: "u1", role: "MEMBER", divisionId: null, managerId: null, externalId: "F1" }],
      ]),
    });
    const plan = planEmployeeImport(
      [
        row({ fomsId: "F1", email: "a@x.com" }),
        row({ fomsId: "F2", name: "Other Hire", email: "b@x.com" }),
      ],
      lookups
    );

    expect(plan.skipped).toEqual(["F1"]);
    expect(plan.created).toEqual(["Other Hire"]);
  });
});
