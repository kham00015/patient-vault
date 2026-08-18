import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { officeScope } from "@/lib/office";
import { toPotentialPatientDTO } from "@/lib/potentials";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const potentials = await prisma.potentialPatient.findMany({
    where: officeScope(auth.user),
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({
    potentials: potentials.map(toPotentialPatientDTO),
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = createSchema.parse(await request.json());
    const potential = await prisma.potentialPatient.create({
      data: {
        name: body.name.trim(),
        createdById: auth.user.id,
        officeId: auth.user.officeId ?? undefined,
      },
    });
    return NextResponse.json({ potential: toPotentialPatientDTO(potential) }, { status: 201 });
  } catch {
    return badRequest("Invalid request");
  }
}
