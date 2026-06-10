// Pure helpers for /api/import/employees.
// Extracted so the create/update plan can be computed in memory from a small
// number of batch-fetched lookups, instead of issuing several DB round-trips
// per CSV row (which timed out on Vercel for large employee lists).

export type EmpImportRow = {
  fomsId: string;
  name: string;
  email: string;
  rmRole: string;
  position?: string;
  dominantDirectorId?: string;
};

// Derive app role from the RM tool's coarse role column.
export function mapRole(rmRole: string): { role: string } {
  switch (rmRole.trim().toLowerCase()) {
    case "pm": return { role: "PROJECT_MANAGER" };
    default:   return { role: "MEMBER" };
  }
}

// Map RM Role column -> readable department label stored on User.department
export function mapDepartment(rmRole: string): string | null {
  switch (rmRole.trim().toLowerCase()) {
    case "dev":
    case "ui":              return "Developer";
    case "qa":              return "QA Engineer";
    case "pm":              return "Project Manager";
    case "fc":              return "Functional Consultant";
    case "product manager": return "Product Manager";
    default:                return null;
  }
}

export type DirectorInfo = { id: string; divisionId: string | null };

export type ExistingUser = {
  id: string;
  role: string;
  divisionId: string | null;
  managerId: string | null;
  externalId: string | null;
};

export type EmployeeImportLookups = {
  directorsByExternalId: Map<string, DirectorInfo>;
  usersByExternalId: Map<string, ExistingUser>;
  usersByEmail: Map<string, ExistingUser>;
  existingJobTitles: Set<string>;
};

export type UserCreateData = {
  name: string;
  email: string;
  role: string;
  jobTitle: string | null;
  department: string | null;
  externalId: string;
  divisionId: string | null;
  managerId: string | null;
  isActive: true;
  capacity: number;
};

export type UserUpdateData = {
  id: string;
  fomsId: string;
  data: Record<string, unknown>;
};

export type EmployeeImportPlan = {
  jobTitlesToCreate: string[];
  usersToCreate: UserCreateData[];
  usersToUpdate: UserUpdateData[];
  created: string[];
  skipped: string[];
};

// Computes the full create/update plan for an employee import in memory.
// Mirrors the original per-row logic, but takes pre-fetched lookups so the
// caller can resolve everything with a handful of batch queries.
export function planEmployeeImport(
  rows: EmpImportRow[],
  lookups: EmployeeImportLookups
): EmployeeImportPlan {
  const { directorsByExternalId, usersByExternalId, usersByEmail, existingJobTitles } = lookups;

  const jobTitlesToCreate = new Set<string>();
  const usersToCreate: UserCreateData[] = [];
  const usersToUpdate: UserUpdateData[] = [];
  const created: string[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const { fomsId, name, email, rmRole, position = "", dominantDirectorId } = row;

    const { role }   = mapRole(rmRole);
    const jobTitle   = position || null;
    const department = mapDepartment(rmRole);

    if (jobTitle && !existingJobTitles.has(jobTitle)) {
      jobTitlesToCreate.add(jobTitle);
    }

    let divisionId: string | null = null;
    let managerId:  string | null = null;
    if (dominantDirectorId) {
      const director = directorsByExternalId.get(dominantDirectorId);
      if (director) {
        divisionId = director.divisionId;
        managerId  = director.id;
      }
    }

    const existingByExtId = usersByExternalId.get(fomsId);
    if (existingByExtId) {
      usersToUpdate.push({
        id: existingByExtId.id,
        fomsId,
        data: {
          ...(jobTitle    ? { jobTitle }   : {}),
          ...(department  ? { department } : {}),
          ...(divisionId && !existingByExtId.divisionId ? { divisionId } : {}),
          ...(managerId  && !existingByExtId.managerId  ? { managerId }  : {}),
          ...(role !== "MEMBER" && existingByExtId.role === "MEMBER" ? { role } : {}),
        },
      });
      skipped.push(fomsId);
      continue;
    }

    const existing = usersByEmail.get(email);
    if (existing) {
      usersToUpdate.push({
        id: existing.id,
        fomsId,
        data: {
          externalId: fomsId,
          role:       existing.role === "ADMIN" ? existing.role : role,
          ...(jobTitle    ? { jobTitle }   : {}),
          ...(department  ? { department } : {}),
          divisionId: existing.divisionId ?? divisionId,
          managerId:  existing.managerId  ?? managerId,
        },
      });
      skipped.push(fomsId);
    } else {
      usersToCreate.push({
        name,
        email,
        role,
        jobTitle,
        department,
        externalId: fomsId,
        divisionId,
        managerId,
        isActive: true,
        capacity: 40,
      });
      created.push(name);
    }
  }

  return {
    jobTitlesToCreate: [...jobTitlesToCreate],
    usersToCreate,
    usersToUpdate,
    created,
    skipped,
  };
}
