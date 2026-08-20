import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden, serverError } from "@/lib/api";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import { requireOfficeId } from "@/lib/office";
import {
  canAttachReferralsToChart,
  canManageReferrals,
  REFERRAL_RECEIVER_ROLES,
} from "@/lib/referrals";
import { platformOwnerEmails } from "@/lib/office";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  patientName: z.string().max(200).optional(),
  patientId: z.string().min(1).optional(),
  assignedToId: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

function personLabel(u?: { name: string | null; email: string } | null) {
  return u?.name?.trim() || u?.email || null;
}

function toReferralDTO(row: {
  id: string;
  patientName: string;
  patientId: string | null;
  notes: string | null;
  status: string;
  officeId: string;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  assignedToId: string | null;
  acknowledgedAt: Date | null;
  acknowledgedById: string | null;
  createdBy?: {
    id: string;
    name: string | null;
    email: string;
    office?: { name: string } | null;
  } | null;
  assignedTo?: {
    id: string;
    name: string | null;
    email: string;
    office?: { name: string } | null;
  } | null;
  acknowledgedBy?: { id: string; name: string | null; email: string } | null;
  documents?: Array<{
    id: string;
    name: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    uploadedAt: Date;
    importedDocumentId: string | null;
    importedAt: Date | null;
  }>;
}) {
  return {
    id: row.id,
    patientName: row.patientName,
    patientId: row.patientId,
    notes: row.notes,
    status: row.status,
    officeId: row.officeId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdById: row.createdById,
    createdByName: personLabel(row.createdBy),
    createdByOfficeName: row.createdBy?.office?.name ?? null,
    assignedToId: row.assignedToId,
    assignedToName: personLabel(row.assignedTo),
    assignedToOfficeName: row.assignedTo?.office?.name ?? null,
    acknowledged: Boolean(row.acknowledgedAt),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedById: row.acknowledgedById,
    acknowledgedByName: personLabel(row.acknowledgedBy),
    documents: (row.documents ?? []).map((doc) => ({
      id: doc.id,
      name: doc.name,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      uploadedAt: doc.uploadedAt.toISOString(),
      imported: Boolean(doc.importedDocumentId),
      importedAt: doc.importedAt?.toISOString() ?? null,
      openUrl: `/api/referrals/${row.id}/documents/${doc.id}`,
    })),
  };
}

const personSelect = {
  id: true,
  name: true,
  email: true,
  office: { select: { name: true } },
} as const;

const referralInclude = {
  createdBy: { select: personSelect },
  assignedTo: { select: personSelect },
  acknowledgedBy: { select: { id: true, name: true, email: true } },
  documents: { orderBy: { uploadedAt: "desc" as const } },
};

function listWhere(user: { id: string; role: string; officeId?: string | null }) {
  const mine = [{ createdById: user.id }, { assignedToId: user.id }];
  // Admins also see packages originated in their clinic.
  if (user.role === "ADMIN" && user.officeId) {
    return { OR: [...mine, { officeId: user.officeId }] };
  }
  return { OR: mine };
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageReferrals(auth.user.role)) return forbidden();

  try {
    const rows = await prisma.referralIntake.findMany({
      where: listWhere(auth.user),
      include: referralInclude,
      orderBy: [
        { acknowledgedAt: { sort: "asc", nulls: "first" } },
        { createdAt: "desc" },
      ],
      take: 200,
    });

    return NextResponse.json({ referrals: rows.map(toReferralDTO) });
  } catch (error) {
    console.error("[referrals GET]", error);
    return serverError("Could not load referrals");
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canManageReferrals(auth.user.role)) return forbidden();

  try {
    const body = createSchema.parse(await request.json());
    const officeId = requireOfficeId(auth.user);
    if (body.assignedToId === auth.user.id) {
      return badRequest("Choose someone else to receive this referral");
    }

    const assignee = await prisma.user.findFirst({
      where: {
        id: body.assignedToId,
        isActive: true,
        role: { in: REFERRAL_RECEIVER_ROLES },
        email: { notIn: platformOwnerEmails() },
      },
    });
    if (!assignee) return badRequest("Recipient not found");

    let patientId: string | null = null;
    let patientName = body.patientName?.trim() || "";

    if (canAttachReferralsToChart(auth.user.role)) {
      if (!body.patientId) {
        return badRequest("Choose a patient from the list");
      }
      const patient = await prisma.patient.findFirst({
        where: { id: body.patientId, officeId },
        select: { id: true, name: true },
      });
      if (!patient) return badRequest("Patient not found");
      patientId = patient.id;
      patientName = patient.name;
    } else if (!patientName) {
      return badRequest("Patient name required");
    }

    const row = await prisma.referralIntake.create({
      data: {
        officeId,
        patientId,
        patientName,
        notes: body.notes?.trim() || null,
        createdById: auth.user.id,
        assignedToId: assignee.id,
      },
      include: referralInclude,
    });

    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.PHI_CREATE,
      resource: "referral_intake",
      resourceId: row.id,
      patientId: patientId ?? undefined,
      ipAddress,
      userAgent,
      metadata: {
        patientName,
        assignedToId: assignee.id,
        assignedOfficeId: assignee.officeId,
      },
    });

    return NextResponse.json({ referral: toReferralDTO(row) }, { status: 201 });
  } catch (error) {
    console.error("[referrals POST]", error);
    if (error instanceof z.ZodError) return badRequest("Patient and recipient required");
    return badRequest("Could not create referral");
  }
}
