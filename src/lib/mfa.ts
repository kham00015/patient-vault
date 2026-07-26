import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { randomBytes, createHash } from "crypto";
import { encryptField, decryptField } from "./encryption";
import { CLINIC_NAME } from "./branding";

const BACKUP_CODE_COUNT = 8;

function hashBackupCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function generateMfaSecret() {
  return generateSecret();
}

export function buildOtpAuthUri(email: string, secret: string) {
  return generateURI({
    issuer: CLINIC_NAME,
    label: email,
    secret,
  });
}

export async function generateMfaQrDataUrl(email: string, secret: string) {
  return QRCode.toDataURL(buildOtpAuthUri(email, secret));
}

export function verifyTotpCode(secret: string, code: string) {
  const result = verifySync({ secret, token: code.replace(/\s/g, "") });
  return result.valid;
}

export function encryptMfaSecret(secret: string) {
  return encryptField(secret) ?? "";
}

export function decryptMfaSecret(stored: string | null | undefined) {
  if (!stored) return null;
  return decryptField(stored);
}

export function generateBackupCodes() {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    plain.push(code);
    hashed.push(hashBackupCode(code));
  }
  return { plain, hashedJson: JSON.stringify(hashed) };
}

export async function verifyBackupCode(
  storedJson: string | null | undefined,
  code: string,
  userId: string
): Promise<boolean> {
  if (!storedJson) return false;
  let hashes: string[];
  try {
    hashes = JSON.parse(storedJson) as string[];
  } catch {
    return false;
  }
  const normalized = code.replace(/\s/g, "").toUpperCase();
  const target = hashBackupCode(normalized);
  const index = hashes.findIndex((h) => h === target);
  if (index === -1) return false;

  hashes.splice(index, 1);
  const { prisma } = await import("./prisma");
  await prisma.user.update({
    where: { id: userId },
    data: { mfaBackupCodes: JSON.stringify(hashes) },
  });
  return true;
}
