import { mkdir, readFile, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const LOCAL_PATH = process.env.STORAGE_LOCAL_PATH ?? "./storage";

export async function saveDocument(
  patientId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  const storageType = process.env.STORAGE_TYPE ?? "local";

  if (storageType === "local") {
    const dir = path.join(LOCAL_PATH, "patients", patientId);
    await mkdir(dir, { recursive: true });
    const key = `${randomBytes(8).toString("hex")}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const fullPath = path.join(dir, key);
    await writeFile(fullPath, buffer);
    return `local:${patientId}/${key}`;
  }

  // Production: implement S3 with SSE-KMS — see DEVELOPER_HANDOFF.md
  throw new Error("S3 storage not configured. Set STORAGE_TYPE=local for development.");
}

export async function readDocument(storageKey: string): Promise<Buffer> {
  if (storageKey.startsWith("local:")) {
    const relative = storageKey.replace("local:", "");
    const fullPath = path.join(LOCAL_PATH, "patients", relative);
    return readFile(fullPath);
  }
  throw new Error("S3 read not implemented");
}

export async function deleteDocument(storageKey: string) {
  if (storageKey.startsWith("local:")) {
    const relative = storageKey.replace("local:", "");
    const fullPath = path.join(LOCAL_PATH, "patients", relative);
    await unlink(fullPath).catch(() => undefined);
    return;
  }
  throw new Error("S3 delete not implemented");
}
