import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      service: "patient-vault",
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const dbAuthFailed =
      message.includes("Authentication failed") ||
      message.includes("credentials for") ||
      message.includes("P1000");
    return NextResponse.json(
      {
        ok: false,
        service: "patient-vault",
        reason: dbAuthFailed ? "database_auth" : "database_unavailable",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
