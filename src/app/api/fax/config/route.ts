import { NextResponse } from "next/server";
import { getFaxProviderConfig } from "@/lib/fax";

export async function GET() {
  const config = getFaxProviderConfig();
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
