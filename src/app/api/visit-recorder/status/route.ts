import { NextResponse } from "next/server";
import {
  isVisitRecorderTestMode,
  requireVisitRecorderAccess,
  visitRecorderTestKeyOk,
} from "@/lib/visit-recorder-auth";
import { getSessionUser } from "@/lib/auth";
import { isBedrockConfigured } from "@/lib/ai";
import { isAssemblyAiConfigured } from "@/lib/assemblyai-transcribe";

export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    const testMode = isVisitRecorderTestMode();
    const keyOk = visitRecorderTestKeyOk(request);
    const enabled = Boolean(session) || (testMode && keyOk);

    if (!enabled && testMode && !keyOk) {
      return NextResponse.json(
        {
          enabled: false,
          testMode: true,
          authenticated: false,
          keyRequired: true,
          error: "Add ?key=... from VISIT_RECORDER_TEST_KEY",
        },
        { status: 401 }
      );
    }

    if (!enabled) {
      return NextResponse.json(
        {
          enabled: false,
          testMode: false,
          authenticated: false,
          error:
            "Sign in, or set VISIT_RECORDER_TEST_MODE=1 in .env.local and restart the app",
        },
        { status: 401 }
      );
    }

    let actorEmail: string | undefined = session?.email;
    let resolvedTestMode = false;
    if (!session) {
      const access = await requireVisitRecorderAccess(request);
      if (access instanceof NextResponse) return access;
      actorEmail = access.user.email;
      resolvedTestMode = access.testMode;
    }

    return NextResponse.json({
      enabled: true,
      testMode: resolvedTestMode || (testMode && !session),
      authenticated: Boolean(session),
      actorEmail,
      clinicName: session?.officeName ?? undefined,
      transcribeConfigured: isAssemblyAiConfigured(),
      bedrockConfigured: isBedrockConfigured(),
    });
  } catch (error) {
    console.error("[visit-recorder/status]", error);
    const message = error instanceof Error ? error.message : "Status check failed";
    return NextResponse.json(
      {
        enabled: false,
        testMode: isVisitRecorderTestMode(),
        authenticated: false,
        error: message.includes("Authentication failed")
          ? "Database connection failed — fix DATABASE_URL, then retry"
          : message,
      },
      { status: 503 }
    );
  }
}
