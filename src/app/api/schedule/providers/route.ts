import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { listScheduleProviders } from "@/lib/schedule-providers";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const providers = await listScheduleProviders(auth.user);
  return NextResponse.json({
    providers,
    currentOfficeId: auth.user.officeId ?? null,
  });
}
