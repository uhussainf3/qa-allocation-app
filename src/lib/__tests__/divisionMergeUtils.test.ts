import { describe, it, expect } from "vitest";
import {
  validateMerge,
  buildMergePreview,
  mergeTargetOptions,
  type DivisionMergeCandidate,
} from "../divisionMergeUtils";

function div(overrides: Partial<DivisionMergeCandidate> = {}): DivisionMergeCandidate {
  return {
    id: "ns",
    code: "NS",
    name: "NetSuite (old)",
    memberCount: 0,
    projectCount: 0,
    ...overrides,
  };
}

describe("validateMerge", () => {
  it("is valid when source and target are different non-empty ids", () => {
    expect(validateMerge("ns", "netsui")).toEqual({ valid: true });
  });

  it("rejects merging a division into itself", () => {
    const result = validateMerge("ns", "ns");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/different/i);
  });

  it("rejects when no target is chosen", () => {
    expect(validateMerge("ns", "")).toEqual({
      valid: false,
      error: "Choose a target division to merge into.",
    });
  });

  it("rejects when source id is missing", () => {
    expect(validateMerge("", "netsui").valid).toBe(false);
  });
});

describe("buildMergePreview", () => {
  it("computes records-to-move and resulting target totals", () => {
    const source = div({ id: "ns", code: "NS", memberCount: 5, projectCount: 2 });
    const target = div({ id: "netsui", code: "NETSUI", memberCount: 20, projectCount: 8 });

    expect(buildMergePreview(source, target)).toEqual({
      usersToMove: 5,
      projectsToMove: 2,
      resultingTargetMembers: 25,
      resultingTargetProjects: 10,
      sourceEmptyAfterMerge: true,
    });
  });

  it("handles a source division that is already empty", () => {
    const source = div({ memberCount: 0, projectCount: 0 });
    const target = div({ id: "netsui", memberCount: 12, projectCount: 4 });

    const preview = buildMergePreview(source, target);
    expect(preview.usersToMove).toBe(0);
    expect(preview.projectsToMove).toBe(0);
    expect(preview.resultingTargetMembers).toBe(12);
    expect(preview.resultingTargetProjects).toBe(4);
  });
});

describe("mergeTargetOptions", () => {
  it("excludes the current division from the list of merge targets", () => {
    const divisions = [div({ id: "ns" }), div({ id: "netsui" }), div({ id: "other" })];
    const options = mergeTargetOptions(divisions, "ns");
    expect(options.map((d) => d.id)).toEqual(["netsui", "other"]);
  });

  it("returns an empty array when it is the only division", () => {
    const divisions = [div({ id: "ns" })];
    expect(mergeTargetOptions(divisions, "ns")).toEqual([]);
  });
});
