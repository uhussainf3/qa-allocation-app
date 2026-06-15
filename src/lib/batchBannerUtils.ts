// Pure helpers for the top-of-app "data last updated" banner.
//
// Shows when the most recent allocation import batch (RM Tool Migration or
// Weekly Upload, src/app/api/import/allocations/route.ts) was uploaded, and
// by whom. The Prisma lookup (getCachedCurrentBatch, src/lib/queries.ts) is
// query territory — these pure formatting/staleness functions are unit
// tested here (CODEBASE_RULES §9b).

export interface CurrentBatchInfo {
  label:          string;
  uploadedAt:     string; // ISO string
  uploadedByName: string | null;
}

export interface BatchBannerInfo {
  message: string;
  isStale: boolean;
}

/** Banner is flagged "stale" once the current batch is older than this. */
export const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const MINUTE = 60_000;
const HOUR   = 60 * MINUTE;
const DAY    = 24 * HOUR;

/**
 * Formats the gap between `uploadedAtISO` and `now` as a relative-time
 * string: "just now", "5 minutes ago", "3 hours ago", "2 days ago".
 * Future timestamps (clock skew) are treated as "just now".
 */
export function formatRelativeTime(uploadedAtISO: string, now: Date): string {
  const diffMs = now.getTime() - new Date(uploadedAtISO).getTime();

  if (diffMs < MINUTE) return "just now";
  if (diffMs < HOUR) {
    const m = Math.floor(diffMs / MINUTE);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diffMs < DAY) {
    const h = Math.floor(diffMs / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.floor(diffMs / DAY);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/**
 * Builds the message + staleness flag for the top banner.
 * - No batch ever imported -> a "no data" message, flagged stale.
 * - Otherwise -> "Data last updated: <label> — <relative> [by <name>]".
 *   Flagged stale once the batch is older than STALE_THRESHOLD_MS.
 */
export function buildBatchBannerInfo(batch: CurrentBatchInfo | null, now: Date): BatchBannerInfo {
  if (!batch) {
    return { message: "No allocation data has been imported yet.", isStale: true };
  }

  const relative = formatRelativeTime(batch.uploadedAt, now);
  const by = batch.uploadedByName ? ` by ${batch.uploadedByName}` : "";
  const message = `Data last updated: ${batch.label} — ${relative}${by}`;

  const diffMs  = now.getTime() - new Date(batch.uploadedAt).getTime();
  const isStale = diffMs > STALE_THRESHOLD_MS;

  return { message, isStale };
}
