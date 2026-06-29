import type { SendFaxInput, SendFaxResult } from "./types";

export async function sendViaMock(input: SendFaxInput): Promise<SendFaxResult> {
  if (!input.toNumber.replace(/\D/g, "")) {
    throw new Error("Invalid fax number");
  }
  if (!input.fileBuffer.length) {
    throw new Error("Empty document");
  }

  const jobId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    providerJobId: jobId,
    status: "DELIVERED",
    pageCount: Math.max(1, Math.ceil(input.fileBuffer.length / 50_000)),
  };
}
