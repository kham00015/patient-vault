/**
 * Migrate local document files to S3. Run on production server inside app container.
 * Usage: node scripts/migrate-local-docs-to-s3.js
 * Requires: STORAGE_TYPE=s3, AWS_S3_BUCKET, AWS credentials in env
 */
const { PrismaClient } = require("@prisma/client");
const { readFile, unlink } = require("fs/promises");
const path = require("path");
const {
  S3Client,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { randomBytes } = require("crypto");

const prisma = new PrismaClient();
const LOCAL_PATH = process.env.STORAGE_LOCAL_PATH ?? "./storage";
const bucket = process.env.AWS_S3_BUCKET;
const region = process.env.AWS_REGION ?? "us-east-1";

if (!bucket) {
  console.error("AWS_S3_BUCKET not set");
  process.exit(1);
}

const s3 = new S3Client({ region });

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function uploadLocalKey(patientId, localRelative, fileName) {
  const fullPath = path.join(LOCAL_PATH, "patients", localRelative);
  const buffer = await readFile(fullPath);
  const key = `patients/${patientId}/${randomBytes(8).toString("hex")}_${sanitize(fileName)}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ServerSideEncryption: "AES256",
      ContentType: "application/octet-stream",
    })
  );
  return `s3:${key}`;
}

async function main() {
  const docs = await prisma.document.findMany({
    where: { storageKey: { startsWith: "local:" } },
  });
  console.log(`Found ${docs.length} local documents to migrate`);
  let ok = 0;
  for (const doc of docs) {
    try {
      const relative = doc.storageKey.replace("local:", "");
      const newKey = await uploadLocalKey(doc.patientId, relative, doc.fileName);
      await prisma.document.update({
        where: { id: doc.id },
        data: { storageKey: newKey },
      });
      const fullPath = path.join(LOCAL_PATH, "patients", relative);
      await unlink(fullPath).catch(() => undefined);
      ok++;
      console.log(`  OK ${doc.id} -> ${newKey}`);
    } catch (err) {
      console.error(`  FAIL ${doc.id}:`, err.message);
    }
  }
  console.log(`Migrated ${ok}/${docs.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
