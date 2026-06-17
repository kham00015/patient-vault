import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.includes("change-me")) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY must be set in production");
    }
    return createHash("sha256").update("dev-only-encryption-key").digest();
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    return createHash("sha256").update(raw).digest();
  }
  return key;
}

/** Encrypt PHI fields at application layer before DB write */
export function encryptField(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptField(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  try {
    const key = getKey();
    const data = Buffer.from(ciphertext, "base64");
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = data.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return ciphertext;
  }
}

const PHI_FIELDS = [
  "noteDraft",
  "diagnosis",
  "pmh",
  "echo",
  "pft",
  "sleep",
  "labs",
  "imaging",
  "medications",
  "social",
] as const;

export function encryptPatientFields<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data };
  for (const field of PHI_FIELDS) {
    if (field in out && typeof out[field] === "string") {
      (out as Record<string, unknown>)[field] = encryptField(out[field] as string);
    }
  }
  return out;
}

export function decryptPatientFields<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data };
  for (const field of PHI_FIELDS) {
    if (field in out && typeof out[field] === "string") {
      (out as Record<string, unknown>)[field] = decryptField(out[field] as string);
    }
  }
  return out;
}

export function encryptNoteContent(content: string) {
  return encryptField(content) ?? "";
}

export function decryptNoteContent(content: string) {
  return decryptField(content) ?? "";
}
