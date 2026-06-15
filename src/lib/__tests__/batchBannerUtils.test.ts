import { describe, it, expect } from "vitest";
import {
  formatRelativeTime,
  buildBatchBannerInfo,
  STALE_THRESHOLD_MS,
  type CurrentBatchInfo,
} from "../batchBannerUtils";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function isoMinusMs(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe("formatRelativeTime", () => {
  it("returns 'just now' for a timestamp seconds ago", () => {
    expect(formatRelativeTime(isoMinusMs(30_000), NOW)).toBe("just now");
  });

  it("returns 'just now' for a future timestamp (clock skew)", () => {
    expect(formatRelativeTime(isoMinusMs(-60_000), NOW)).toBe("just now");
  });

  it("returns singular '1 minute ago'", () => {
    expect(formatRelativeTime(isoMinusMs(60_000), NOW)).toBe("1 minute ago");
  });

  it("returns plural minutes", () => {
    expect(formatRelativeTime(isoMinusMs(5 * 60_000), NOW)).toBe("5 minutes ago");
  });

  it("returns singular '1 hour ago'", () => {
    expect(formatRelativeTime(isoMinusMs(60 * 60_000), NOW)).toBe("1 hour ago");
  });

  it("returns plural hours", () => {
    expect(formatRelativeTime(isoMinusMs(3 * 60 * 60_000), NOW)).toBe("3 hours ago");
  });

  it("returns singular '1 day ago'", () => {
    expect(formatRelativeTime(isoMinusMs(24 * 60 * 60_000), NOW)).toBe("1 day ago");
  });

  it("returns plural days", () => {
    expect(formatRelativeTime(isoMinusMs(10 * 24 * 60 * 60_000), NOW)).toBe("10 days ago");
  });
});

describe("buildBatchBannerInfo", () => {
  it("returns a 'no data' message flagged stale when no batch exists", () => {
    expect(buildBatchBannerInfo(null, NOW)).toEqual({
      message: "No allocation data has been imported yet.",
      isStale: true,
    });
  });

  it("includes label, relative time, and uploader name", () => {
    const batch: CurrentBatchInfo = {
      label: "Weekly Upload - 2026-06-09",
      uploadedAt: isoMinusMs(2 * 60 * 60_000),
      uploadedByName: "Umair Hussain",
    };
    const result = buildBatchBannerInfo(batch, NOW);
    expect(result.message).toBe(
      "Data last updated: Weekly Upload - 2026-06-09 — 2 hours ago by Umair Hussain"
    );
    expect(result.isStale).toBe(false);
  });

  it("omits the 'by <name>' suffix when uploadedByName is null", () => {
    const batch: CurrentBatchInfo = {
      label: "RM Tool Migration",
      uploadedAt: isoMinusMs(10 * 60_000),
      uploadedByName: null,
    };
    const result = buildBatchBannerInfo(batch, NOW);
    expect(result.message).toBe("Data last updated: RM Tool Migration — 10 minutes ago");
  });

  it("flags isStale=false right at the threshold boundary", () => {
    const batch: CurrentBatchInfo = {
      label: "Weekly Upload",
      uploadedAt: isoMinusMs(STALE_THRESHOLD_MS),
      uploadedByName: null,
    };
    expect(buildBatchBannerInfo(batch, NOW).isStale).toBe(false);
  });

  it("flags isStale=true once older than the threshold", () => {
    const batch: CurrentBatchInfo = {
      label: "Weekly Upload",
      uploadedAt: isoMinusMs(STALE_THRESHOLD_MS + 60_000),
      uploadedByName: null,
    };
    expect(buildBatchBannerInfo(batch, NOW).isStale).toBe(true);
  });
});
