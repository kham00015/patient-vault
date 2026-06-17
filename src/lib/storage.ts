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

export async function saveDocument(
  patientId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  const storageType = process.env.STORAGE_TYPE ?? "local";
  const key = `patients/${patientId}/${randomBytes(8).toString("hex")}_${sanitizeFileName(fileName)}`;

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
        ContentType: "application/octet-stream",
      })
    );
    return `s3:${key}`;
  }

  const dir = path.join(LOCAL_PATH, "patients", patientId);
  await mkdir(dir, { recursive: true });
  const localKey = key.split("/").pop()!;
  const fullPath = path.join(dir, localKey);
  await writeFile(fullPath, buffer);
  return `local:${patientId}/${localKey}`;
}

export async function readDocument(storageKey: string): Promise<Buffer> {
  if (storageKey.startsWith("local:")) {
    const relative = storageKey.replace("local:", "");
    const fullPath = path.join(LOCAL_PATH, "patients", relative);
    return readFile(fullPath);
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

export async function deleteDocument(storageKey: string) {
  if (storageKey.startsWith("local:")) {
    const relative = storageKey.replace("local:", "");
    const fullPath = path.join(LOCAL_PATH, "patients", relative);
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
