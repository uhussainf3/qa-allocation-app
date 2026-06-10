// Pure helpers for /api/import/projects.
// Extracted so the create/update plan can be computed in memory from a small
// number of batch-fetched lookups, instead of issuing ~5 DB round-trips per
// CSV row (which would time out on Vercel for the ~2,500-row Projects File).

export type ProjImportRow = {
  projectId:  string;
  name:       string;
  status:     string;
  directorId: string;
  pmName?:    string;
  startDate?: string;
  endDate?:   string;
};

// Format: YYYY.MM.DD
export function parseProjectDate(raw: string | undefined): Date | null {
  if (!raw || raw.trim() === "") return null;
  const parts = raw.trim().split(".");
  if (parts.length !== 3) return null;
  const d = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

export function mapStatus(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === "active" || s === "on demand") return "ACTIVE";
  if (s === "close" || s === "closed" || s === "completed") return "COMPLETED";
  return "ACTIVE";
}

export type ExistingProject = {
  id: string;
  divisionId: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

export type PMCandidate = { id: string; name: string };

export type ProjectImportLookups = {
  // directorId (externalId) -> divisionId owned by that director
  divisionByDirectorId: Map<string, string>;
  // active PROJECT_MANAGER / DIVISION_OWNER / ADMIN users, for name-contains match
  pmCandidates: PMCandidate[];
  existingByExternalId: Map<string, ExistingProject>;
  existingByCode: Map<string, ExistingProject>;
};

export type ProjectCreateData = {
  name: string;
  code: string;
  status: string;
  divisionId: string | null;
  externalId: string;
  managerId: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

export type ProjectUpdateData = {
  id: string;
  projectId: string;
  data: {
    name: string;
    status: string;
    divisionId: string | null;
    externalId: string;
    startDate: Date | null;
    endDate: Date | null;
    managerId?: string;
  };
};

export type ProjectImportPlan = {
  projectsToCreate: ProjectCreateData[];
  projectsToUpdate: ProjectUpdateData[];
  created: string[];
  updated: string[];
};

type CreateState = { kind: "create"; data: ProjectCreateData };
type UpdateState = { kind: "update"; id: string; data: ProjectUpdateData["data"] };

// Computes the full create/update plan for a projects import in memory.
// Mirrors the original per-row logic, but takes pre-fetched lookups so the
// caller can resolve everything with a handful of batch queries.
//
// The Projects File CSV can contain multiple rows for the same ProjectID
// (e.g. one row per allocation period). The original sequential code handled
// this naturally because each row's `findFirst` would see the project the
// previous row had just created/updated. Here we replicate that by folding
// repeated rows for the same project (keyed by `code`) into a single
// create/update entry, with later rows overriding earlier field values
// (falling back to the earlier value when the later row's field is empty).
export function planProjectImport(rows: ProjImportRow[], lookups: ProjectImportLookups): ProjectImportPlan {
  const { divisionByDirectorId, pmCandidates, existingByExternalId, existingByCode } = lookups;

  const states = new Map<string, CreateState | UpdateState>();
  const order: string[] = [];

  for (const row of rows) {
    const { projectId, name, status, directorId, pmName, startDate, endDate } = row;
    const code = `P-${projectId}`;

    const divisionId = divisionByDirectorId.get(directorId) ?? null;

    let managerId: string | null = null;
    if (pmName?.trim()) {
      const needle = pmName.trim().toLowerCase();
      const match = pmCandidates.find((c) => c.name.toLowerCase().includes(needle));
      managerId = match?.id ?? null;
    }

    const appStatus = mapStatus(status);
    const start = parseProjectDate(startDate);
    const end = parseProjectDate(endDate);

    let state = states.get(code);
    if (!state) {
      const existing = existingByExternalId.get(projectId) ?? existingByCode.get(code);
      if (existing) {
        state = {
          kind: "update",
          id: existing.id,
          data: {
            name,
            status: appStatus,
            divisionId: divisionId ?? existing.divisionId,
            externalId: projectId,
            startDate: start ?? existing.startDate,
            endDate: end ?? existing.endDate,
            ...(managerId ? { managerId } : {}),
          },
        };
      } else {
        state = {
          kind: "create",
          data: {
            name,
            code,
            status: appStatus,
            divisionId,
            externalId: projectId,
            managerId,
            startDate: start,
            endDate: end,
          },
        };
      }
      states.set(code, state);
      order.push(code);
      continue;
    }

    state.data.name       = name;
    state.data.status     = appStatus;
    state.data.divisionId = divisionId ?? state.data.divisionId;
    state.data.startDate  = start ?? state.data.startDate;
    state.data.endDate    = end ?? state.data.endDate;
    if (managerId) state.data.managerId = managerId;
  }

  const projectsToCreate: ProjectCreateData[] = [];
  const projectsToUpdate: ProjectUpdateData[] = [];
  const created: string[] = [];
  const updated: string[] = [];

  for (const code of order) {
    const state = states.get(code)!;
    if (state.kind === "create") {
      projectsToCreate.push(state.data);
      created.push(state.data.name);
    } else {
      projectsToUpdate.push({ id: state.id, projectId: state.data.externalId, data: state.data });
      updated.push(state.data.name);
    }
  }

  return { projectsToCreate, projectsToUpdate, created, updated };
}
