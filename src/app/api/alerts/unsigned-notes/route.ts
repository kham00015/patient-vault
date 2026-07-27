import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { formatDisplayName } from "@/lib/patient-registration";
import {
  NON_PHYSICIAN_ENCOUNTER_MODALITIES,
  classifyUnsignedPhysicianNote,
  type UnsignedNoteAlertDTO,
} from "@/lib/unsigned-notes";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const summaryOnly = searchParams.get("summary") === "1";

  const isAdmin = auth.user.role === "ADMIN";

  const encounters = await prisma.encounter.findMany({
    where: {
      status: "OPEN",
      modality: { notIn: [...NON_PHYSICIAN_ENCOUNTER_MODALITIES] },
      patient: { status: "ACTIVE" },
      ...(isAdmin
        ? {}
        : {
            OR: [
              { providerId: auth.user.id },
              { providerId: null, createdById: auth.user.id },
            ],
          }),
    },
    orderBy: { date: "desc" },
    take: summaryOnly ? 500 : 200,
    select: {
      id: true,
      patientId: true,
      visitCategory: true,
      modality: true,
      date: true,
      providerId: true,
      patient: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          middleName: true,
          mrn: true,
        },
      },
      provider: { select: { id: true, name: true, email: true } },
      notes: {
        select: {
          id: true,
          type: true,
          status: true,
          updatedAt: true,
        },
      },
    },
  });

  const alerts: UnsignedNoteAlertDTO[] = [];

  for (const enc of encounters) {
    const classification = classifyUnsignedPhysicianNote(enc.notes);
    if (!classification) continue;

    alerts.push({
      encounterId: enc.id,
      patientId: enc.patientId,
      patientName: formatDisplayName(enc.patient),
      patientMrn: enc.patient.mrn,
      visitCategory: enc.visitCategory,
      modality: enc.modality,
      date: enc.date.toISOString(),
      providerId: enc.providerId,
      providerName: enc.provider?.name ?? enc.provider?.email ?? null,
      reason: classification.reason,
      draftNoteId: classification.draftNoteId,
      draftNoteType: classification.draftNoteType,
    });
  }

  if (summaryOnly) {
    return NextResponse.json({
      count: alerts.length,
      draftCount: alerts.filter((a) => a.reason === "DRAFT").length,
      notStartedCount: alerts.filter((a) => a.reason === "NOT_STARTED").length,
    });
  }

  return NextResponse.json({
    count: alerts.length,
    alerts,
    scope: isAdmin ? "all_physicians" : "own",
  });
}
