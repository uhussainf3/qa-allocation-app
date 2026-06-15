import { auth } from "@/lib/auth";
import { getCachedPublicHolidays, getCachedJobTitles } from "@/lib/queries";
import { HolidaysClient } from "./HolidaysClient";
import { JobTitlesClient } from "./JobTitlesClient";
import { DangerZoneClient } from "./DangerZoneClient";
import type { Role } from "@/types/enums";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();

  // Sequential, not Promise.all — the Neon connection pool here is
  // configured with connection_limit=1, so issuing several Prisma queries
  // concurrently just queues them up and times out waiting for a
  // connection ("Timed out fetching a new connection from the connection
  // pool ... connection limit: 1").
  const holidays  = await getCachedPublicHolidays();
  const jobTitles = await getCachedJobTitles();

  return (
    <div className="page" data-screen-label="Settings">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">System configuration</div>
        </div>
      </div>

      <JobTitlesClient
        initialJobTitles={jobTitles}
        currentUserRole={session!.user.role as Role}
      />

      <HolidaysClient
        initialHolidays={holidays}
        currentUserRole={session!.user.role as Role}
      />

      {session!.user.role === "ADMIN" && <DangerZoneClient />}
    </div>
  );
}
