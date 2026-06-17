import { AuditAction } from "@prisma/client";
import { prisma } from "./prisma";

type AuditParams = {
  userId?: string | null;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  patientId?: string;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  metadata?: Record<string, string | number | boolean | string[]>;
};

/** HIPAA: log all PHI access — never store PHI in metadata */
export async function createAuditLog(params: AuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        patientId: params.patientId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent?.slice(0, 512),
        success: params.success ?? true,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (error) {
    console.error("[AUDIT] Failed to write audit log:", error);
  }
}

export function getClientInfo(request: Request) {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown",
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
}
