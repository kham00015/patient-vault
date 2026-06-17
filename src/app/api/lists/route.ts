import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api";
import { canWrite, canDelete } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const lists = await prisma.patientList.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      patients: {
        include: { patient: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      updatedAt: l.updatedAt,
      patients: l.patients.map((p) => p.patient),
    })),
  });
}

const createSchema = z.object({ name: z.string().min(1) });

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = createSchema.parse(await request.json());
    const list = await prisma.patientList.create({
      data: { name: body.name.trim(), createdById: auth.user.id },
    });
    return NextResponse.json({ list }, { status: 201 });
  } catch {
    return badRequest("Invalid request");
  }
}
