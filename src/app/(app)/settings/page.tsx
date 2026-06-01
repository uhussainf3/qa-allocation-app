import { auth } from "@/lib/auth";
import { getCachedPublicHolidays } from "@/lib/queries";
import { HolidaysClient } from "./HolidaysClient";
import type { Role } from "@/types/enums";

export default async function SettingsPage() {
  const session  = await auth();
  const holidays = await getCachedPublicHolidays();
  return (
    <HolidaysClient
      initialHolidays={holidays}
      currentUserRole={session!.user.role as Role}
    />
  );
}
