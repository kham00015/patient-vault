import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { getSessionUser, type SessionUser } from "@/lib/auth";

/** Explicit opt-in. Never enable on real clinic production without understanding PHI risk. */
export function isVisitRecorderTestMode() {
  return process.env.VISIT_RECORDER_TEST_MODE === "1";
}

export function visitRecorderTestKeyOk(request: Request) {
  const required = process.env.VISIT_RECORDER_TEST_KEY?.trim();
  if (!required) return true;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("key");
  const fromHeader = request.headers.get("x-visit-recorder-key");
  return fromQuery === required || fromHeader === required;
}

async function resolveTestActor(): Promise<SessionUser | null> {
  const preferredEmail = process.env.VISIT_RECORDER_TEST_USER_EMAIL?.trim().toLowerCase();
  const user = preferredEmail
    ? await prisma.user.findFirst({
        where: { email: preferredEmail, isActive: true },
      })
    : await prisma.user.findFirst({
        where: {
          isActive: true,
          role: { in: [Role.ADMIN, Role.CLINICIAN] },
        },
        orderBy: { createdAt: "asc" },
      });

  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    mfaEnabled: user.mfaEnabled,
  };
}

/**
 * Session user if logged in; otherwise test-mode actor when VISIT_RECORDER_TEST_MODE=1.
 */
export async function requireVisitRecorderAccess(
  request: Request
): Promise<{ user: SessionUser; testMode: boolean } | NextResponse> {
  const session = await getSessionUser();
  if (session) {
    return { user: session, testMode: false };
  }

  if (!isVisitRecorderTestMode()) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    return { user: auth.user, testMode: false };
  }

  if (!visitRecorderTestKeyOk(request)) {
    return NextResponse.json(
      { error: "Visit recorder test key required" },
      { status: 401 }
    );
  }

  const actor = await resolveTestActor();
  if (!actor) {
    return NextResponse.json(
      { error: "Visit recorder test mode needs an active admin/clinician user in the database" },
      { status: 503 }
    );
  }

  return { user: actor, testMode: true };
}
