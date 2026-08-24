import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { isBedrockConfigured } from "@/lib/ai";
import type {
  BedrockDocumentFormat,
  BedrockImageFormat,
  ChartDocumentAttachment,
} from "@/lib/ai-chart-context";
import {
  EMPTY_PATIENT_FORM,
  SEX_AT_BIRTH_OPTIONS,
  US_STATES,
  type CreatePatientInput,
} from "@/lib/patient-registration";
import type {
  RegistrationExtractResult,
  RegistrationFieldConflict,
} from "@/lib/registration-extract-types";

export type { RegistrationExtractResult, RegistrationFieldConflict };

const DEFAULT_BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID?.trim() ||
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

const MAX_ATTACHMENT_BYTES = 4.5 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

const FIELD_LABELS: Partial<Record<keyof CreatePatientInput, string>> = {
  firstName: "First name",
  lastName: "Last name",
  middleName: "Middle name",
  dateOfBirth: "Date of birth",
  sexAtBirth: "Sex at birth",
  phone: "Phone",
  email: "Email",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  city: "City",
  state: "State",
  zip: "ZIP",
  emergencyContactName: "Emergency contact name",
  emergencyContactPhone: "Emergency contact phone",
  emergencyContactRelation: "Emergency contact relation",
  primaryInsuranceCarrier: "Primary insurance carrier",
  primaryInsuranceMemberId: "Primary member ID",
  primaryInsuranceGroupNumber: "Primary group number",
  primaryInsurancePayerId: "Primary payer ID",
  primaryInsuranceClaimAddressLine1: "Primary claim address line 1",
  primaryInsuranceClaimAddressLine2: "Primary claim address line 2",
  primaryInsuranceClaimCity: "Primary claim city",
  primaryInsuranceClaimState: "Primary claim state",
  primaryInsuranceClaimZip: "Primary claim ZIP",
  secondaryInsuranceCarrier: "Secondary insurance carrier",
  secondaryInsuranceMemberId: "Secondary member ID",
  secondaryInsuranceGroupNumber: "Secondary group number",
  secondaryInsurancePayerId: "Secondary payer ID",
  secondaryInsuranceClaimAddressLine1: "Secondary claim address line 1",
  secondaryInsuranceClaimAddressLine2: "Secondary claim address line 2",
  secondaryInsuranceClaimCity: "Secondary claim city",
  secondaryInsuranceClaimState: "Secondary claim state",
  secondaryInsuranceClaimZip: "Secondary claim ZIP",
  allergies: "Allergies",
  currentMedications: "Current medications",
};

const EXTRACTABLE_KEYS = Object.keys(EMPTY_PATIENT_FORM) as (keyof CreatePatientInput)[];

function getBedrockRegion() {
  return (
    process.env.BEDROCK_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    "us-east-1"
  );
}

function mimeToDocumentFormat(mimeType: string, fileName: string): BedrockDocumentFormat | null {
  const mime = mimeType.toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (mime.includes("pdf") || ext === "pdf") return "pdf";
  if (mime.includes("html") || ext === "html" || ext === "htm") return "html";
  if (mime.startsWith("text/plain") || ext === "txt") return "txt";
  if (mime.includes("markdown") || ext === "md") return "md";
  if (mime.includes("wordprocessingml") || ext === "docx") return "docx";
  if (mime === "application/msword" || ext === "doc") return "doc";
  return null;
}

function mimeToImageFormat(mimeType: string, fileName: string): BedrockImageFormat | null {
  const mime = mimeType.toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (mime === "image/png" || ext === "png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg" || ext === "jpg" || ext === "jpeg") return "jpeg";
  if (mime === "image/gif" || ext === "gif") return "gif";
  if (mime === "image/webp" || ext === "webp") return "webp";
  return null;
}

function safeDocName(name: string) {
  const base = name.replace(/\.[^.]+$/, "");
  const cleaned = base
    .replace(/[^a-zA-Z0-9 \-()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || "document";
}

async function extractPdfText(bytes: Buffer): Promise<string | null> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : String(text ?? "");
    const cleaned = joined.replace(/\s+/g, " ").trim();
    return cleaned || null;
  } catch {
    return null;
  }
}

async function extractDocxText(bytes: Buffer): Promise<string | null> {
  try {
    const result = await mammoth.extractRawText({ buffer: bytes });
    const cleaned = result.value.replace(/\s+/g, " ").trim();
    return cleaned || null;
  } catch {
    return null;
  }
}

export type RegistrationUpload = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

export async function buildRegistrationAiPayload(uploads: RegistrationUpload[]) {
  const attachments: ChartDocumentAttachment[] = [];
  const textParts: string[] = [];
  const notes: string[] = [];

  for (const upload of uploads.slice(0, 12)) {
    const { fileName, mimeType, buffer } = upload;
    const imageFormat = mimeToImageFormat(mimeType, fileName);
    const docFormat = mimeToDocumentFormat(mimeType, fileName);

    if (imageFormat) {
      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        notes.push(`${fileName}: image too large for AI attach (max ~4.5MB).`);
        continue;
      }
      attachments.push({
        kind: "image",
        name: safeDocName(fileName),
        format: imageFormat,
        bytes: new Uint8Array(buffer),
      });
      continue;
    }

    if (docFormat === "pdf") {
      if (buffer.length <= MAX_ATTACHMENT_BYTES && attachments.length < 8) {
        attachments.push({
          kind: "document",
          name: safeDocName(fileName),
          format: "pdf",
          bytes: new Uint8Array(buffer),
        });
      } else {
        const extracted = await extractPdfText(buffer);
        if (extracted) {
          textParts.push(`=== ${fileName} (extracted PDF text) ===\n${extracted.slice(0, MAX_TEXT_CHARS)}`);
        } else {
          notes.push(`${fileName}: could not extract PDF text.`);
        }
      }
      continue;
    }

    if (docFormat === "docx") {
      const extracted = await extractDocxText(buffer);
      if (extracted) {
        textParts.push(`=== ${fileName} (extracted DOCX text) ===\n${extracted.slice(0, MAX_TEXT_CHARS)}`);
      } else {
        notes.push(`${fileName}: could not extract Word text.`);
      }
      continue;
    }

    if (docFormat === "txt" || docFormat === "md" || docFormat === "html") {
      let text = buffer.toString("utf8");
      if (docFormat === "html") {
        text = text
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ");
      }
      textParts.push(`=== ${fileName} ===\n${text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS)}`);
      continue;
    }

    notes.push(`${fileName}: unsupported type for AI fill (${mimeType || "unknown"}).`);
  }

  return { attachments, textParts, notes };
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1]?.trim() || text;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI returned no JSON registration payload");
  return JSON.parse(match[0]);
}

function normalizeSex(value: string): CreatePatientInput["sexAtBirth"] | undefined {
  const v = value.trim().toUpperCase();
  if ((SEX_AT_BIRTH_OPTIONS.map((o) => o.value) as string[]).includes(v)) {
    return v as CreatePatientInput["sexAtBirth"];
  }
  if (v === "M" || v === "MALE" || v.startsWith("MALE")) return "MALE";
  if (v === "F" || v === "FEMALE" || v.startsWith("FEMALE")) return "FEMALE";
  if (v.includes("OTHER") || v === "X" || v === "INTERSEX") return "OTHER";
  if (v.includes("UNKNOWN") || v === "U" || v === "UNK") return "UNKNOWN";
  return undefined;
}

function normalizeDob(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !Number.isNaN(Date.parse(trimmed))) {
    return trimmed;
  }
  const mdy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += year >= 30 ? 1900 : 2000;
    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!Number.isNaN(Date.parse(iso))) return iso;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return undefined;
}

function normalizeState(value: string): string | undefined {
  const v = value.trim().toUpperCase();
  if ((US_STATES as readonly string[]).includes(v)) return v;
  return undefined;
}

function normalizeField(
  key: keyof CreatePatientInput,
  raw: unknown
): string | CreatePatientInput["sexAtBirth"] | undefined {
  if (raw == null) return undefined;
  const text = String(raw).trim();
  if (!text) return undefined;
  if (key === "sexAtBirth") return normalizeSex(text);
  if (key === "dateOfBirth") return normalizeDob(text);
  if (key === "state" || key === "primaryInsuranceClaimState" || key === "secondaryInsuranceClaimState") {
    return normalizeState(text) ?? text.slice(0, 2).toUpperCase();
  }
  return text;
}

function parseAiPayload(raw: unknown): RegistrationExtractResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid AI registration payload");
  }
  const obj = raw as Record<string, unknown>;
  const fieldsRaw =
    obj.fields && typeof obj.fields === "object" && !Array.isArray(obj.fields)
      ? (obj.fields as Record<string, unknown>)
      : obj;

  const fields: Partial<CreatePatientInput> = {};
  for (const key of EXTRACTABLE_KEYS) {
    const next = normalizeField(key, fieldsRaw[key]);
    if (next !== undefined) {
      (fields as Record<string, unknown>)[key] = next;
    }
  }

  const conflicts: RegistrationFieldConflict[] = [];
  const conflictList = Array.isArray(obj.conflicts) ? obj.conflicts : [];
  for (const item of conflictList) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const field = String(c.field ?? "").trim() as keyof CreatePatientInput;
    if (!EXTRACTABLE_KEYS.includes(field)) continue;
    const values = Array.isArray(c.values)
      ? c.values.map((v) => String(v).trim()).filter(Boolean).slice(0, 6)
      : [];
    const message =
      typeof c.message === "string" && c.message.trim()
        ? c.message.trim()
        : values.length
          ? `Conflicting values for ${FIELD_LABELS[field] ?? field}: ${values.join(" vs ")}`
          : `Conflict detected for ${FIELD_LABELS[field] ?? field}`;
    conflicts.push({
      field,
      label: FIELD_LABELS[field] ?? field,
      values,
      message: message.slice(0, 500),
    });
  }

  const notes = Array.isArray(obj.notes)
    ? obj.notes.map((n) => String(n).trim()).filter(Boolean).slice(0, 12)
    : [];

  return { fields, conflicts, notes, provider: "bedrock" };
}

function bedrockContentFromAttachments(
  attachments: ChartDocumentAttachment[],
  userText: string
): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const usedNames = new Set<string>();
  for (const [index, att] of attachments.entries()) {
    if (att.kind === "document") {
      let name = att.name || "document";
      if (usedNames.has(name)) name = `${name} (${index + 1})`.slice(0, 200);
      usedNames.add(name);
      blocks.push({
        document: {
          name,
          format: att.format,
          source: { bytes: att.bytes },
        },
      });
    } else {
      blocks.push({
        image: {
          format: att.format,
          source: { bytes: att.bytes },
        },
      });
    }
  }
  blocks.push({ text: userText });
  return blocks;
}

const SYSTEM_PROMPT = `You extract patient registration demographics from intake documents (IDs, insurance cards, referral packets, intake forms, photos/scans).

Return ONLY valid JSON with this shape:
{
  "fields": {
    "firstName": "",
    "lastName": "",
    "middleName": "",
    "dateOfBirth": "YYYY-MM-DD",
    "sexAtBirth": "MALE|FEMALE|OTHER|UNKNOWN",
    "phone": "",
    "email": "",
    "addressLine1": "",
    "addressLine2": "",
    "city": "",
    "state": "US 2-letter",
    "zip": "",
    "emergencyContactName": "",
    "emergencyContactPhone": "",
    "emergencyContactRelation": "",
    "primaryInsuranceCarrier": "",
    "primaryInsuranceMemberId": "",
    "primaryInsuranceGroupNumber": "",
    "primaryInsurancePayerId": "",
    "primaryInsuranceClaimAddressLine1": "",
    "primaryInsuranceClaimAddressLine2": "",
    "primaryInsuranceClaimCity": "",
    "primaryInsuranceClaimState": "",
    "primaryInsuranceClaimZip": "",
    "secondaryInsuranceCarrier": "",
    "secondaryInsuranceMemberId": "",
    "secondaryInsuranceGroupNumber": "",
    "secondaryInsurancePayerId": "",
    "secondaryInsuranceClaimAddressLine1": "",
    "secondaryInsuranceClaimAddressLine2": "",
    "secondaryInsuranceClaimCity": "",
    "secondaryInsuranceClaimState": "",
    "secondaryInsuranceClaimZip": "",
    "allergies": "",
    "currentMedications": ""
  },
  "conflicts": [
    { "field": "firstName", "values": ["A", "B"], "message": "Short explanation of the conflict" }
  ],
  "notes": ["Optional short notes about missing info or low confidence"]
}

Rules:
- Only fill fields you can support from the documents. Omit unknown fields or use "".
- Prefer the clearest / most recent source when values agree closely (ignore trivial formatting differences).
- If two or more sources clearly disagree on the SAME field (different DOB, different member ID, different legal name spelling that is not just case), put the best guess in fields AND add a conflicts entry explaining it.
- dateOfBirth must be YYYY-MM-DD when known.
- state must be a US 2-letter code when known.
- allergies: use NKDA only if documents state no known allergies; otherwise extract listed allergies.
- Do not invent insurance, phone, or address data.`;

export async function extractRegistrationFromUploads(
  uploads: RegistrationUpload[]
): Promise<RegistrationExtractResult> {
  if (!isBedrockConfigured()) {
    throw new Error(
      "AWS Bedrock is not configured. Set AWS credentials/role and BEDROCK_MODEL_ID."
    );
  }
  if (uploads.length === 0) {
    throw new Error("Upload at least one document first.");
  }

  const { attachments, textParts, notes: prepNotes } = await buildRegistrationAiPayload(uploads);
  if (attachments.length === 0 && textParts.length === 0) {
    throw new Error(
      prepNotes[0] ||
        "Could not read any of the uploaded files for AI fill. Try PDF, Word, text, or clear photos."
    );
  }

  const userText = `Extract registration fields from these intake uploads.

${textParts.length ? textParts.join("\n\n") : "(Document/image content is attached.)"}

Respond with JSON only.`;

  const messages: Message[] = [
    {
      role: "user",
      content: bedrockContentFromAttachments(attachments, userText),
    },
  ];

  const client = new BedrockRuntimeClient({ region: getBedrockRegion() });
  const response = await client.send(
    new ConverseCommand({
      modelId: DEFAULT_BEDROCK_MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages,
      inferenceConfig: {
        temperature: 0.1,
        maxTokens: 3500,
      },
    })
  );

  const text =
    response.output?.message?.content
      ?.map((block) => ("text" in block && block.text ? block.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim() || "";

  const parsed = parseAiPayload(extractJsonObject(text));
  return {
    ...parsed,
    notes: [...prepNotes, ...parsed.notes].slice(0, 16),
  };
}

export function registrationFieldLabel(field: keyof CreatePatientInput) {
  return FIELD_LABELS[field] ?? field;
}
