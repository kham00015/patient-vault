import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { formatDisplayName } from "@/lib/patient-registration";
import { officeScope } from "@/lib/office";
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
  const patientScope = { status: "ACTIVE" as const, ...officeScope(auth.user) };

  const draftNoteWhere = isAdmin
    ? {
        status: "DRAFT" as const,
        patient: patientScope,
      }
    : {
        status: "DRAFT" as const,
        patient: patientScope,
        OR: [
          { createdById: auth.user.id },
          { encounter: { providerId: auth.user.id } },
          { encounter: { providerId: null, createdById: auth.user.id } },
        ],
      };

  const [draftNotes, encounters] = await Promise.all([
    prisma.note.findMany({
      where: draftNoteWhere,
      orderBy: [{ updatedAt: "desc" }],
      take: summaryOnly ? 500 : 300,
      select: {
        id: true,
        type: true,
        status: true,
        date: true,
        updatedAt: true,
        patientId: true,
        encounterId: true,
        createdById: true,
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
        encounter: {
          select: {
            id: true,
            visitCategory: true,
            modality: true,
            date: true,
            providerId: true,
            provider: { select: { id: true, name: true, email: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.encounter.findMany({
      where: {
        status: "OPEN",
        modality: { notIn: [...NON_PHYSICIAN_ENCOUNTER_MODALITIES] },
        patient: patientScope,
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
    }),
  ]);

  const alerts: UnsignedNoteAlertDTO[] = [];
  const coveredEncounterIds = new Set<string>();

  for (const note of draftNotes) {
    if (note.encounterId) coveredEncounterIds.add(note.encounterId);
    const provider =
      note.encounter?.provider ??
      note.createdBy ??
      null;
    alerts.push({
      id: `note:${note.id}`,
      encounterId: note.encounterId,
      patientId: note.patientId,
      patientName: formatDisplayName(note.patient),
      patientMrn: note.patient.mrn,
      visitCategory: note.encounter?.visitCategory ?? null,
      modality: note.encounter?.modality ?? null,
      date: (note.encounter?.date ?? note.date).toISOString(),
      providerId: note.encounter?.providerId ?? note.createdById,
      providerName: provider?.name ?? provider?.email ?? null,
      reason: "DRAFT",
      draftNoteId: note.id,
      draftNoteType: note.type,
    });
  }

  for (const enc of encounters) {
    if (coveredEncounterIds.has(enc.id)) continue;
    const classification = classifyUnsignedPhysicianNote(enc.notes);
    if (!classification || classification.reason !== "NOT_STARTED") continue;

    alerts.push({
      id: `encounter:${enc.id}`,
      encounterId: enc.id,
      patientId: enc.patientId,
      patientName: formatDisplayName(enc.patient),
      patientMrn: enc.patient.mrn,
      visitCategory: enc.visitCategory,
      modality: enc.modality,
      date: enc.date.toISOString(),
      providerId: enc.providerId,
      providerName: enc.provider?.name ?? enc.provider?.email ?? null,
      reason: "NOT_STARTED",
      draftNoteId: null,
      draftNoteType: null,
    });
  }

  alerts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
