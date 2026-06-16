import { describe, it, expect } from "vitest";
import { canViewExecutiveDashboard } from "../accessUtils";

describe("canViewExecutiveDashboard", () => {
  it("allows ADMIN regardless of job title", () => {
    expect(canViewExecutiveDashboard("ADMIN", null)).toBe(true);
    expect(canViewExecutiveDashboard("ADMIN", "Senior QA Engineer")).toBe(true);
  });

  it("allows EXECUTIVE regardless of job title", () => {
    expect(canViewExecutiveDashboard("EXECUTIVE", null)).toBe(true);
  });

  it("allows DIVISION_OWNER regardless of job title", () => {
    expect(canViewExecutiveDashboard("DIVISION_OWNER", null)).toBe(true);
    expect(canViewExecutiveDashboard("DIVISION_OWNER", "VP")).toBe(true);
    expect(canViewExecutiveDashboard("DIVISION_OWNER", "Senior QA Engineer")).toBe(true);
  });

  it("allows a MEMBER whose job title is VP", () => {
    expect(canViewExecutiveDashboard("MEMBER", "VP")).toBe(true);
  });

  it("denies PROJECT_MANAGER and MEMBER without VP title", () => {
    expect(canViewExecutiveDashboard("PROJECT_MANAGER", undefined)).toBe(false);
    expect(canViewExecutiveDashboard("MEMBER", "Developer")).toBe(false);
  });

  it("is case-sensitive — 'vp' lowercase does not match for non-DO roles", () => {
    expect(canViewExecutiveDashboard("MEMBER", "vp")).toBe(false);
  });
});
