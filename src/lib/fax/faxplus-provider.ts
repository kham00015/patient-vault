import type { SendFaxInput, SendFaxResult } from "./types";

function normalizeE164(number: string) {
  const digits = number.replace(/\D/g, "");
  if (!digits) throw new Error("Invalid fax number");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  return number.startsWith("+") ? number : `+${digits}`;
}

function guessMime(fileName: string, mimeType: string) {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  return "application/pdf";
}

/**
 * Fax.Plus REST API v3 — https://apidoc.fax.plus/
 * Set FAXPLUS_API_KEY and optionally FAXPLUS_FROM_NUMBER in .env
 */
export async function sendViaFaxPlus(input: SendFaxInput): Promise<SendFaxResult> {
  const apiKey = process.env.FAXPLUS_API_KEY?.trim();
  if (!apiKey || apiKey.includes("change-me")) {
    throw new Error("FAXPLUS_API_KEY is not configured");
  }

  const to = normalizeE164(input.toNumber);
  const fromNumber = process.env.FAXPLUS_FROM_NUMBER?.trim();
  const fromName = input.fromName ?? process.env.FAX_FROM_NAME ?? "Clinic";

  const faxData: Record<string, unknown> = {
    to: [to],
    comment: input.coverSheet ? { text: input.coverSheet } : undefined,
    from: fromName,
  };
  if (fromNumber) faxData.from_number = normalizeE164(fromNumber);

  const form = new FormData();
  form.append(
    "fax_data",
    new Blob([JSON.stringify(faxData)], { type: "application/json" })
  );
  const mime = guessMime(input.fileName, input.mimeType);
  form.append(
    "attachment",
    new Blob([new Uint8Array(input.fileBuffer)], { type: mime }),
    input.fileName
  );

  const baseUrl = process.env.FAXPLUS_API_BASE?.trim() || "https://restapi.fax.plus/v3";
  const response = await fetch(`${baseUrl}/accounts/self/outbox`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    uid?: string;
    status?: string;
    message?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Fax.Plus error (${response.status})`);
  }

  const jobId = payload.id || payload.uid;
  if (!jobId) throw new Error("Fax.Plus did not return a job id");

  const remoteStatus = (payload.status ?? "sending").toLowerCase();
  const status =
    remoteStatus === "success" || remoteStatus === "delivered"
      ? "DELIVERED"
      : remoteStatus === "failed"
        ? "QUEUED"
        : "SENDING";

  return {
    providerJobId: jobId,
    status: status as SendFaxResult["status"],
  };
}
