import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./auth";
import { createAuditLog, getClientInfo } from "./audit";
import { AuditAction } from "@prisma/client";

export type ApiContext = {
  user: SessionUser;
  request: Request;
};

export async function requireAuth(
  request: Request
): Promise<{ user: SessionUser } | NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      action: AuditAction.LOGIN_FAILED,
      resource: "session",
      ipAddress,
      userAgent,
      success: false,
      metadata: { reason: "unauthenticated" },
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { user };
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message = "Internal server error") {
  return NextResponse.json({ error: message }, { status: 500 });
}
