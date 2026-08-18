import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api";
import { canManageUsers } from "@/lib/auth";
import { ensureOffices, isPlatformOwner } from "@/lib/office";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageUsers(auth.user.role) && !isPlatformOwner(auth.user.email)) {
    return forbidden();
  }

  await ensureOffices();
  const offices = await prisma.office.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  const owner = isPlatformOwner(auth.user.email);
  if (!owner) {
    const mine = offices.find((o) => o.id === auth.user.officeId);
    return NextResponse.json({
      offices: mine ? [{ id: mine.id, name: mine.name }] : [],
      canAssignOffice: false,
      currentOfficeId: auth.user.officeId ?? null,
    });
  }

  return NextResponse.json({
    offices,
    canAssignOffice: true,
    currentOfficeId: auth.user.officeId ?? null,
  });
}
