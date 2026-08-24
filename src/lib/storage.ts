import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { Readable } from "stream";

const LOCAL_PATH = process.env.STORAGE_LOCAL_PATH ?? "./storage";

function getS3Client() {
  const region = process.env.AWS_REGION ?? "us-east-1";
  return new S3Client({ region });
}

function getBucket() {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error("AWS_S3_BUCKET is not set");
  return bucket;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function streamToBuffer(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function guessContentType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  return "application/octet-stream";
}

export async function saveDocument(
  patientId: string,
  fileName: string,
  buffer: Buffer,
  mimeType?: string
): Promise<string> {
  const storageType = process.env.STORAGE_TYPE ?? "local";
  const key = `patients/${patientId}/${randomBytes(8).toString("hex")}_${sanitizeFileName(fileName)}`;
  const contentType = mimeType || guessContentType(fileName);

  if (storageType === "s3") {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: buffer,
        ServerSideEncryption: process.env.AWS_KMS_KEY_ID ? "aws:kms" : "AES256",
        ...(process.env.AWS_KMS_KEY_ID
          ? { SSEKMSKeyId: process.env.AWS_KMS_KEY_ID }
          : {}),
        ContentType: contentType,
      })
    );
    return `s3:${key}`;
  }

  const dir = path.join(LOCAL_PATH, "patients", patientId);
  await mkdir(dir, { recursive: true });
  const localKey = key.split("/").pop()!;
  const fullPath = path.join(dir, localKey);
  await writeFile(fullPath, buffer);
  return `local:patients/${patientId}/${localKey}`;
}

/** Referral intake uploads (not yet on a patient chart).
 * S3 keys stay under `patients/*` so existing IAM PutObject policies apply.
 */
export async function saveReferralDocument(
  referralId: string,
  fileName: string,
  buffer: Buffer,
  mimeType?: string
): Promise<string> {
  const storageType = process.env.STORAGE_TYPE ?? "local";
  const key = `patients/_referrals/${referralId}/${randomBytes(8).toString("hex")}_${sanitizeFileName(fileName)}`;
  const contentType = mimeType || guessContentType(fileName);

  if (storageType === "s3") {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: buffer,
        ServerSideEncryption: process.env.AWS_KMS_KEY_ID ? "aws:kms" : "AES256",
        ...(process.env.AWS_KMS_KEY_ID
          ? { SSEKMSKeyId: process.env.AWS_KMS_KEY_ID }
          : {}),
        ContentType: contentType,
      })
    );
    return `s3:${key}`;
  }

  const dir = path.join(LOCAL_PATH, "patients", "_referrals", referralId);
  await mkdir(dir, { recursive: true });
  const localKey = key.split("/").pop()!;
  const fullPath = path.join(dir, localKey);
  await writeFile(fullPath, buffer);
  return `local:patients/_referrals/${referralId}/${localKey}`;
}

/** My Brain document uploads (per-user knowledge base, not patient PHI). */
export async function saveMyBrainDocument(
  userId: string,
  fileName: string,
  buffer: Buffer,
  mimeType?: string
): Promise<string> {
  const storageType = process.env.STORAGE_TYPE ?? "local";
  const key = `my-brain/${userId}/${randomBytes(8).toString("hex")}_${sanitizeFileName(fileName)}`;
  const contentType = mimeType || guessContentType(fileName);

  if (storageType === "s3") {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: buffer,
        ServerSideEncryption: process.env.AWS_KMS_KEY_ID ? "aws:kms" : "AES256",
        ...(process.env.AWS_KMS_KEY_ID
          ? { SSEKMSKeyId: process.env.AWS_KMS_KEY_ID }
          : {}),
        ContentType: contentType,
      })
    );
    return `s3:${key}`;
  }

  const dir = path.join(LOCAL_PATH, "my-brain", userId);
  await mkdir(dir, { recursive: true });
  const localKey = key.split("/").pop()!;
  const fullPath = path.join(dir, localKey);
  await writeFile(fullPath, buffer);
  return `local:my-brain/${userId}/${localKey}`;
}

export async function readDocument(storageKey: string): Promise<Buffer> {
  if (storageKey.startsWith("local:")) {
    const relative = storageKey.replace("local:", "");
    // New keys: patients/... or referrals/... ; legacy: patientId/file under patients/
    if (relative.startsWith("patients/") || relative.startsWith("referrals/") || relative.startsWith("my-brain/")) {
      return readFile(path.join(LOCAL_PATH, relative));
    }
    return readFile(path.join(LOCAL_PATH, "patients", relative));
  }

  if (storageKey.startsWith("s3:")) {
    const key = storageKey.replace("s3:", "");
    const client = getS3Client();
    const response = await client.send(
      new GetObjectCommand({ Bucket: getBucket(), Key: key })
    );
    if (!response.Body) throw new Error("Empty S3 object");
    return streamToBuffer(response.Body as Readable);
  }

  throw new Error(`Unknown storage key: ${storageKey}`);
}

export async function writeDocument(storageKey: string, buffer: Buffer): Promise<void> {
  if (storageKey.startsWith("local:")) {
    const relative = storageKey.replace("local:", "");
    const fullPath = path.join(LOCAL_PATH, "patients", relative);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    return;
  }

  if (storageKey.startsWith("s3:")) {
    const key = storageKey.replace("s3:", "");
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: buffer,
        ServerSideEncryption: process.env.AWS_KMS_KEY_ID ? "aws:kms" : "AES256",
        ...(process.env.AWS_KMS_KEY_ID
          ? { SSEKMSKeyId: process.env.AWS_KMS_KEY_ID }
          : {}),
        ContentType: "text/plain; charset=utf-8",
      })
    );
    return;
  }

  throw new Error(`Unknown storage key: ${storageKey}`);
}

export async function deleteDocument(storageKey: string) {
  if (storageKey.startsWith("local:")) {
    const relative = storageKey.replace("local:", "");
    const fullPath =
      relative.startsWith("patients/") ||
      relative.startsWith("referrals/") ||
      relative.startsWith("my-brain/")
        ? path.join(LOCAL_PATH, relative)
        : path.join(LOCAL_PATH, "patients", relative);
    await unlink(fullPath).catch(() => undefined);
    return;
  }

  if (storageKey.startsWith("s3:")) {
    const key = storageKey.replace("s3:", "");
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
    );
    return;
  }

  throw new Error(`Unknown storage key: ${storageKey}`);
}
