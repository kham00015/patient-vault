import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { assertSameOfficeRecord } from "@/lib/office";
import { assertPatientReadable } from "@/lib/patient-access";

type Params = { params: Promise<{ id: string; patientId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();
  const { id: listId, patientId } = await params;
  const list = await prisma.patientList.findUnique({ where: { id: listId } });
  if (!list) return notFound();
  const deniedList = await assertSameOfficeRecord(auth.user, list.officeId);
  if (deniedList) return deniedList;
  const deniedPatient = await assertPatientReadable(auth.user, patientId);
  if (deniedPatient) return deniedPatient;

  await prisma.listPatient.delete({
    where: { listId_patientId: { listId, patientId } },
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
