import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { clinicDisplayName } from "@/lib/branding";
import { getFaxProviderConfig } from "@/lib/fax";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const config = getFaxProviderConfig({
    clinicName: clinicDisplayName(auth.user.officeName),
  });
  return NextResponse.json({
    fax: {
      provider: config.provider,
      configured: config.configured,
      mode: config.mode,
      fromNumber: config.fromNumber,
      fromName: config.fromName,
    },
  });
}
