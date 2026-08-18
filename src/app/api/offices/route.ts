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
  const visible = isPlatformOwner(auth.user.email)
    ? offices
    : offices.filter((o) => o.id === auth.user.officeId);
  return NextResponse.json({
    offices: visible,
    canAssignOffice: isPlatformOwner(auth.user.email),
    currentOfficeId: auth.user.officeId ?? null,
  });
}
