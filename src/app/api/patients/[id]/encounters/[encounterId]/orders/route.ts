import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api";
import { toOrderDTO } from "@/lib/orders";

type Params = { params: Promise<{ id: string; encounterId: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id: patientId, encounterId } = await params;

  const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, patientId } });
  if (!encounter) return notFound();

  const orders = await prisma.order.findMany({
    where: { patientId, encounterId },
    orderBy: [{ status: "asc" }, { orderedAt: "desc" }],
    include: {
      createdBy: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true, email: true } },
      encounter: { select: { id: true, visitCategory: true, modality: true, date: true } },
    },
  });

  return NextResponse.json({ orders: orders.map(toOrderDTO) });
}
