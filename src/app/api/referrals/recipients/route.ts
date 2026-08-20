import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api";
import { canManageReferrals, REFERRAL_RECEIVER_ROLES } from "@/lib/referrals";
import { platformOwnerEmails } from "@/lib/office";

export const dynamic = "force-dynamic";

/** Active users in any clinic who can receive a referral. */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageReferrals(auth.user.role)) return forbidden();

  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: auth.user.id },
      role: { in: REFERRAL_RECEIVER_ROLES },
      email: { notIn: platformOwnerEmails() },
    },
    orderBy: [{ office: { name: "asc" } }, { name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      office: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json({
    recipients: recipients.map((u) => ({
      id: u.id,
      name: u.name?.trim() || u.email,
      email: u.email,
      role: u.role,
      officeId: u.office?.id ?? null,
      officeName: u.office?.name ?? "Unknown clinic",
    })),
  });
}
