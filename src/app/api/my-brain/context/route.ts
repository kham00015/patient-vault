import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { buildMyBrainContext } from "@/lib/my-brain";

/** Provider-agnostic My Brain prompt context for any AI integration. */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const maxCharsParam = new URL(request.url).searchParams.get("maxChars");
  const maxChars = maxCharsParam ? Number.parseInt(maxCharsParam, 10) : undefined;

  const brain = await buildMyBrainContext(auth.user.id, {
    maxChars: Number.isFinite(maxChars) ? maxChars : undefined,
  });

  return NextResponse.json({
    ...brain,
    attachmentCount: brain.attachments.length,
    attachments: undefined,
  });
}
