import { auth } from "@/lib/auth";
import { getCachedPublicHolidays, getCachedJobTitles } from "@/lib/queries";
import { HolidaysClient } from "./HolidaysClient";
import { JobTitlesClient } from "./JobTitlesClient";
import type { Role } from "@/types/enums";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();

  const [holidays, jobTitles] = await Promise.all([
    getCachedPublicHolidays(),
    getCachedJobTitles(),
  ]);

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
    </div>
  );
}
