import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api";
import { canViewAudit } from "@/lib/auth";
import { officeScope } from "@/lib/office";
import { assertPatientReadable } from "@/lib/patient-access";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canViewAudit(auth.user.role)) return forbidden();

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);
  const patientId = searchParams.get("patientId") ?? undefined;
  if (patientId) {
    const denied = await assertPatientReadable(auth.user, patientId);
    if (denied) return denied;
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      user: officeScope(auth.user),
      ...(patientId ? { patientId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { email: true, name: true } } },
  });

  return NextResponse.json({ logs });
}
