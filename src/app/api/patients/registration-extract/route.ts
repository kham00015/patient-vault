import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { createAuditLog, getClientInfo } from "@/lib/audit";
import {
  extractRegistrationFromUploads,
  type RegistrationUpload,
} from "@/lib/registration-extract";

export const maxDuration = 180;

const MAX_FILES = 12;
const MAX_SIZE = 25 * 1024 * 1024;

function friendlyAiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|TimeoutError|Aborted|network/i.test(message)) {
    return "Connection to AI was interrupted while reading uploads. Please try again.";
  }
  if (/throttl|Too many requests|ServiceUnavailable|ModelNotReady/i.test(message)) {
    return "AI is temporarily busy. Please wait a moment and try again.";
  }
  return message || "Could not fill registration from uploads";
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not read upload body";
    return badRequest(`Upload body rejected (${msg})`);
  }

  const files = formData
    .getAll("files")
    .concat(formData.getAll("file"))
    .filter((entry): entry is File => typeof File !== "undefined" && entry instanceof File);

  if (files.length === 0) {
    return badRequest("Upload at least one document or capture first.");
  }
  if (files.length > MAX_FILES) {
    return badRequest(`Too many files (max ${MAX_FILES}).`);
  }

  const uploads: RegistrationUpload[] = [];
  for (const file of files) {
    if (file.size <= 0) continue;
    if (file.size > MAX_SIZE) {
      return badRequest(`${file.name} is too large (max 25MB).`);
    }
    uploads.push({
      fileName: file.name.slice(0, 255) || "upload.bin",
      mimeType: file.type || "application/octet-stream",
      buffer: Buffer.from(await file.arrayBuffer()),
    });
  }

  if (uploads.length === 0) {
    return badRequest("No readable files were uploaded.");
  }

  try {
    const result = await extractRegistrationFromUploads(uploads);
    const { ipAddress, userAgent } = getClientInfo(request);
    await createAuditLog({
      userId: auth.user.id,
      action: AuditAction.AI_QUERY,
      resource: "registration_extract",
      ipAddress,
      userAgent,
      metadata: {
        fileCount: uploads.length,
        conflictCount: result.conflicts.length,
        filledFieldCount: Object.keys(result.fields).length,
        provider: result.provider,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[registration-extract]", error);
    return NextResponse.json({ error: friendlyAiError(error) }, { status: 500 });
  }
}
