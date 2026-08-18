import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api";
import { assertNotConsultantDocumentsOnly, assertPatientReadable } from "@/lib/patient-access";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { organizeChartWithAI } from "@/lib/ai";
import { buildPatientChartAiContext } from "@/lib/ai-chart-context";
import { preparePatientUpdate, isPatientChartWritable } from "@/lib/patients";
import {
  expandSyncedPatientFields,
  syncDraftNotesFromChartFields,
} from "@/lib/chart-note-sync";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const consultantBlocked = await assertNotConsultantDocumentsOnly(auth.user);
  if (consultantBlocked) return consultantBlocked;
  const { id: patientId } = await params;
  const officeDenied = await assertPatientReadable(auth.user, patientId);
  if (officeDenied) return officeDenied;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return notFound();
  if (!isPatientChartWritable(patient.status)) {
    return badRequest("Archived charts are read-only");
  }

  try {
    const chart = await buildPatientChartAiContext(patientId);
    const organized = expandSyncedPatientFields(
      (await organizeChartWithAI(chart.text)) as Record<string, string>
    );
    // If AI returned both diagnosis and pmh differently, prefer diagnosis for the pair.
    if (organized.diagnosis != null) {
      organized.pmh = organized.diagnosis;
    } else if (organized.pmh != null) {
      organized.diagnosis = organized.pmh;
    }
    if (organized.medications != null) {
      organized.currentMedications = organized.medications;
    } else if (organized.currentMedications != null) {
      organized.medications = organized.currentMedications;
    }

    const encrypted = preparePatientUpdate(organized as Record<string, string>);
    await prisma.patient.update({ where: { id: patientId }, data: encrypted });
    await syncDraftNotesFromChartFields(patientId, {
      diagnosis: organized.diagnosis,
      pmh: organized.pmh,
      medications: organized.medications,
      currentMedications: organized.currentMedications,
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.AI_QUERY,
      resource: "ai_organize",
      patientId,
      ipAddress,
      userAgent,
      metadata: {
        provider: "bedrock",
        attachments: chart.attachmentSummary.length,
      },
    });

    return NextResponse.json({ sections: organized });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI organize failed";
    console.error("[ai organize]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
