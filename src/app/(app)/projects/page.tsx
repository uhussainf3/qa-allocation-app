import { Suspense } from "react";
import { auth }            from "@/lib/auth";
import { prisma }          from "@/lib/prisma";
import { totalWorkingDays } from "@/lib/weeks";
import { computeAllocationPct, groupAllocationsByCategory, type ProjectAllocationRow } from "@/lib/projectAllocationUtils";
import { ProjectsClient }  from "./ProjectsClient";
import {
  getCachedProjectsFull,
  getCachedAllAllocationsForProjects,
  getCachedPublicHolidays,
  getCachedSimpleUsers,
  getCachedDivisions,
} from "@/lib/queries";
import type { Role } from "@/types/enums";

export default async function ProjectsPage() {
  const session = await auth();

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1"). Each cached call has its own 60s TTL so
  // steady-state requests don't hit the DB at all.
  const { projects, hoursConsumed } = await getCachedProjectsFull();
  const allocations = await getCachedAllAllocationsForProjects();
  const rawHolidays = await getCachedPublicHolidays();
  const teamMembers = await getCachedSimpleUsers();
  const divisions   = await getCachedDivisions();
  // Approved leaves — used to deduct hours from project totals
  const approvedLeaves = await prisma.leave.findMany({
    where:  { status: "APPROVED" },
    select: { userId: true, startDate: true, endDate: true },
  });

  const holidays = new Set(rawHolidays.map((h) => h.date));

  const consumedMap = Object.fromEntries(hoursConsumed.map((h) => [h.projectId, h._sum.hours ?? 0]));

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // ── Build approved-leave lookup by userId ───────────────────────────────────
  const leavesByUser = new Map<string, { start: Date; end: Date }[]>();
  for (const l of approvedLeaves) {
    if (!leavesByUser.has(l.userId)) leavesByUser.set(l.userId, []);
    leavesByUser.get(l.userId)!.push({ start: l.startDate, end: l.endDate });
  }

  // ── Helper: compute leave deduction for one allocation ─────────────────────
  function leaveDeduction(
    userId: string,
    allocStart: Date,
    allocEnd: Date,
    hoursPerDay: number
  ): { allocDeduction: number; toDateDeduction: number } {
    const leaves = leavesByUser.get(userId) ?? [];
    let allocDeduction  = 0;
    let toDateDeduction = 0;

    for (const lv of leaves) {
      // Overlap with full allocation range
      const overlapStart = new Date(Math.max(lv.start.getTime(), allocStart.getTime()));
      const overlapEnd   = new Date(Math.min(lv.end.getTime(),   allocEnd.getTime()));
      if (overlapStart > overlapEnd) continue;

      const lvDays  = totalWorkingDays(overlapStart, overlapEnd, holidays);
      allocDeduction += lvDays * hoursPerDay;

      // Overlap with past portion only (for hoursToDate deduction)
      const pastEnd = new Date(Math.min(overlapEnd.getTime(), today.getTime()));
      if (overlapStart <= pastEnd) {
        const pastDays = totalWorkingDays(overlapStart, pastEnd, holidays);
        toDateDeduction += pastDays * hoursPerDay;
      }
    }

    return {
      allocDeduction:  Math.round(allocDeduction  * 10) / 10,
      toDateDeduction: Math.round(toDateDeduction * 10) / 10,
    };
  }

  // ── Compute per-project hours (with leave deduction) ───────────────────────
  const allocatedMap:   Record<string, number> = {};
  const hoursToDateMap: Record<string, number> = {};
  type EngineerEntry = { userId: string; userName: string | null; hoursToDate: number; totalAllocated: number };
  const engineerBreakdownMap: Record<string, Record<string, EngineerEntry>> = {};
  const allocationRowsMap: Record<string, ProjectAllocationRow[]> = {};
  const todayStr = new Date().toISOString().slice(0, 10);

  for (const a of allocations) {
    const start = new Date(a.startDate);
    const end   = new Date(a.endDate);

    // Full-range allocated hours (before leave deduction)
    const totalDays = totalWorkingDays(start, end, holidays);
    const totalHrs  = Math.round(totalDays * a.hoursPerDay * 10) / 10;

    // Hours worked up to today (before leave deduction)
    const effectiveEnd = end < today ? end : today;
    const toDateDays   = start > today ? 0 : totalWorkingDays(start, effectiveEnd, holidays);
    const toDateHrs    = Math.round(toDateDays * a.hoursPerDay * 10) / 10;

    // Deduct approved leave hours
    const { allocDeduction, toDateDeduction } = leaveDeduction(a.userId, start, end, a.hoursPerDay);

    const netTotal  = Math.max(0, totalHrs  - allocDeduction);
    const netToDate = Math.max(0, toDateHrs - toDateDeduction);

    allocatedMap[a.projectId]   = (allocatedMap[a.projectId]   ?? 0) + netTotal;
    hoursToDateMap[a.projectId] = (hoursToDateMap[a.projectId] ?? 0) + netToDate;

    // Per-engineer breakdown
    if (!engineerBreakdownMap[a.projectId]) engineerBreakdownMap[a.projectId] = {};
    if (!engineerBreakdownMap[a.projectId][a.userId]) {
      engineerBreakdownMap[a.projectId][a.userId] = {
        userId: a.userId, userName: a.userName, hoursToDate: 0, totalAllocated: 0,
      };
    }
    engineerBreakdownMap[a.projectId][a.userId].hoursToDate    += netToDate;
    engineerBreakdownMap[a.projectId][a.userId].totalAllocated += netTotal;

    // Per-allocation row for the "Allocations" tab (Active / Upcoming / Ended)
    if (!allocationRowsMap[a.projectId]) allocationRowsMap[a.projectId] = [];
    allocationRowsMap[a.projectId].push({
      id:            a.id,
      userId:        a.userId,
      userName:      a.userName,
      startDate:     a.startDate,
      endDate:       a.endDate,
      allocationPct: computeAllocationPct(a.hoursPerDay, a.userCapacity),
      hoursToDate:   Math.round(netToDate * 10) / 10,
      totalHours:    Math.round(netTotal  * 10) / 10,
    });
  }

  return (
    <Suspense>
      <ProjectsClient
        projects={projects.map((p) => ({
          ...p,
          consumedHours:  consumedMap[p.id] ?? 0,
          allocatedHours: Math.round((allocatedMap[p.id]   ?? 0) * 10) / 10,
          hoursToDate:    Math.round((hoursToDateMap[p.id] ?? 0) * 10) / 10,
          engineerBreakdown: Object.values(engineerBreakdownMap[p.id] ?? {})
            .map((e) => ({
              ...e,
              hoursToDate:    Math.round(e.hoursToDate    * 10) / 10,
              totalAllocated: Math.round(e.totalAllocated * 10) / 10,
            }))
            .sort((a, b) => b.totalAllocated - a.totalAllocated),
          allocationDetails: groupAllocationsByCategory(allocationRowsMap[p.id] ?? [], todayStr),
        }))}
        currentUserRole={session!.user.role as Role}
        teamMembers={teamMembers.map((u) => ({ id: u.id, name: u.name, role: u.role, department: u.department ?? null }))}
        divisions={divisions.map((d) => ({ id: d.id, name: d.name, code: d.code, color: d.color }))}
      />
    </Suspense>
  );
}
