import { getCachedCurrentBatch } from "@/lib/queries";
import { buildBatchBannerInfo } from "@/lib/batchBannerUtils";

/**
 * Top-of-app banner showing when the current allocation data was last
 * imported (RM Tool Migration or Weekly Upload) and by whom.
 * Server component — reads the cached "current" AllocationBatch
 * (src/lib/queries.ts getCachedCurrentBatch, tag "allocations").
 */
export async function UpdateBanner() {
  const batch = await getCachedCurrentBatch();
  const { message, isStale } = buildBatchBannerInfo(batch, new Date());

  return (
    <div className={`update-banner${isStale ? " update-banner-stale" : ""}`}>
      <span className="update-banner-dot" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
