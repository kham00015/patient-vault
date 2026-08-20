import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api";
import { canAcknowledgeReferrals, canManageReferrals } from "@/lib/referrals";

export const dynamic = "force-dynamic";

/** Packages assigned to me (any clinic) that I have not acknowledged yet. */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageReferrals(auth.user.role)) return forbidden();

  if (!canAcknowledgeReferrals(auth.user.role)) {
    return NextResponse.json({ unread: 0 });
  }

  const unread = await prisma.referralIntake.count({
    where: {
      assignedToId: auth.user.id,
      acknowledgedAt: null,
    },
  });

  return NextResponse.json({ unread });
}
