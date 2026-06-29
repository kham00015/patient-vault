import { sendViaFaxPlus } from "./faxplus-provider";
import { sendViaMock } from "./mock-provider";
import type { FaxProviderConfig, FaxProviderName, SendFaxInput, SendFaxResult } from "./types";

export type { FaxProviderConfig, FaxProviderName, SendFaxInput, SendFaxResult } from "./types";

export function getFaxProviderName(): FaxProviderName {
  const raw = process.env.FAX_PROVIDER?.trim().toLowerCase();
  if (raw === "faxplus") return "faxplus";
  return "mock";
}

export function getFaxProviderConfig(): FaxProviderConfig {
  const provider = getFaxProviderName();
  const fromNumber = process.env.FAXPLUS_FROM_NUMBER?.trim() || null;
  const fromName = process.env.FAX_FROM_NAME?.trim() || process.env.NEXT_PUBLIC_CLINIC_NAME?.trim() || null;

  if (provider === "faxplus") {
    const apiKey = process.env.FAXPLUS_API_KEY?.trim();
    const configured = Boolean(apiKey && !apiKey.includes("change-me"));
    return {
      provider,
      configured,
      fromNumber,
      fromName,
      mode: configured ? "live" : "mock",
    };
  }

  return {
    provider: "mock",
    configured: true,
    fromNumber,
    fromName,
    mode: "mock",
  };
}

export function normalizeFaxNumber(number: string) {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export async function sendFax(input: SendFaxInput): Promise<SendFaxResult & { provider: FaxProviderName }> {
  const config = getFaxProviderConfig();
  const provider = config.mode === "live" ? config.provider : "mock";

  const result =
    provider === "faxplus" ? await sendViaFaxPlus(input) : await sendViaMock(input);

  return { ...result, provider };
}
