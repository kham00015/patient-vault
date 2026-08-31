import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, badRequest } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { officeScope } from "@/lib/office";
import { decryptPatientFields } from "@/lib/encryption";
import { expandIcd10SearchTerms } from "@/lib/icd10-aliases";
import { expandDiagnosisSearchTermsWithAI, isBedrockConfigured } from "@/lib/ai";
import {
  resolveAnalyticsPeriod,
  scheduleEntryDayWhere,
} from "@/lib/analytics";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { scheduleDayBounds } from "@/lib/utils";

const bodySchema = z.object({
  query: z.string().min(1).max(200),
  preset: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  /** When true, call Bedrock to expand synonyms (plus ICD aliases). */
  useAi: z.boolean().optional().default(true),
  /** Extra terms from ICD picker (code / description). */
  extraTerms: z.array(z.string().max(120)).max(20).optional(),
});

/**
 * POST /api/analytics/diagnoses
 * Body: { query, preset?, start?, end?, useAi?, extraTerms? }
 * Returns matching active patients (decrypted diagnosis contains any term).
 * Period filters to patients with a schedule visit or encounter in range (all = no activity filter).
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role) && auth.user.role !== "READONLY") {
    return forbidden();
  }

  try {
    const body = bodySchema.parse(await request.json());
    const period = resolveAnalyticsPeriod({
      preset: body.preset,
      start: body.start,
      end: body.end,
    });

    const aliasTerms = expandIcd10SearchTerms(body.query);
    let aiTerms: string[] = [];
    let aiUsed = false;
    let aiError: string | null = null;

    if (body.useAi && isBedrockConfigured()) {
      try {
        aiTerms = await expandDiagnosisSearchTermsWithAI(body.query);
        aiUsed = true;
      } catch (e) {
        aiError = e instanceof Error ? e.message : "AI expand failed";
      }
    } else if (body.useAi && !isBedrockConfigured()) {
      aiError = "AI not configured — using aliases and query text only";
    }

    const terms = uniqueTerms([
      body.query,
      ...aliasTerms,
      ...aiTerms,
      ...(body.extraTerms ?? []),
    ]);

    if (terms.length === 0) return badRequest("Enter a diagnosis to search");

    const activityFilter = buildActivityFilter(period);

    const rows = await prisma.patient.findMany({
      where: {
        ...officeScope(auth.user),
        status: "ACTIVE",
        ...activityFilter,
      },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        middleName: true,
        mrn: true,
        diagnosis: true,
        pmh: true,
        dateOfBirth: true,
        updatedAt: true,
      },
      orderBy: { name: "asc" },
      take: 2000,
    });

    const matches: {
      id: string;
      name: string;
      mrn: string | null;
      diagnosis: string | null;
      matchedOn: string[];
    }[] = [];

    for (const row of rows) {
      const dto = decryptPatientFields({ ...row });
      const text = `${dto.diagnosis ?? ""}\n${dto.pmh ?? ""}`;
      const lower = text.toLowerCase();
      const hit = terms.filter((t) => lower.includes(t.toLowerCase()));
      if (hit.length === 0) continue;
      matches.push({
        id: dto.id,
        name: dto.name,
        mrn: dto.mrn ?? null,
        diagnosis: dto.diagnosis ?? null,
        matchedOn: hit.slice(0, 5),
      });
    }

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_ACCESS,
      resource: "analytics_diagnoses",
      ipAddress,
      userAgent,
      metadata: {
        query: body.query,
        matchCount: matches.length,
        termCount: terms.length,
        aiUsed,
        preset: period.preset,
        startDay: period.startDay,
        endDay: period.endDay,
      },
    });

    return NextResponse.json({
      period,
      query: body.query,
      terms,
      aiUsed,
      aiError,
      totalPatientsScanned: rows.length,
      matchCount: matches.length,
      patients: matches,
    });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      return badRequest("Invalid request");
    }
    console.error("[analytics/diagnoses]", err);
    return badRequest("Diagnosis analytics failed");
  }
}

function uniqueTerms(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const t = raw.trim();
    if (t.length < 2) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 24);
}

function buildActivityFilter(period: ReturnType<typeof resolveAnalyticsPeriod>) {
  if (!period.startDay && !period.endDay) return {};

  const dayWhere = scheduleEntryDayWhere(period);
  const encounterDate: { gte?: Date; lt?: Date } = {};
  if (period.startDay) {
    encounterDate.gte = scheduleDayBounds(period.startDay).start;
  }
  if (period.endDay) {
    encounterDate.lt = scheduleDayBounds(period.endDay).end;
  }

  return {
    OR: [
      { scheduleEntries: { some: dayWhere } },
      { encounters: { some: { date: encounterDate } } },
    ],
  };
}
