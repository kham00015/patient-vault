import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest } from "@/lib/api";
import { isPlatformOwner, ACTIVE_OFFICE_COOKIE } from "@/lib/office";

const bodySchema = z.object({
  officeId: z.string().min(1),
});

function cookieSecure() {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!isPlatformOwner(auth.user.email)) return forbidden();

  try {
    const body = bodySchema.parse(await request.json());
    const office = await prisma.office.findUnique({
      where: { id: body.officeId },
      select: { id: true, name: true, code: true },
    });
    if (!office) return badRequest("Clinic not found");

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_OFFICE_COOKIE, office.id, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({
      officeId: office.id,
      officeName: office.name,
      officeCode: office.code,
    });
  } catch {
    return badRequest("Invalid request");
  }
}
