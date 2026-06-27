import { PrismaClient } from "@prisma/client";
import { formatPatientName } from "../src/lib/patient-registration";

const prisma = new PrismaClient();

async function main() {
  const patients = await prisma.patient.findMany({ orderBy: { createdAt: "asc" } });
  let n = 1;

  for (const patient of patients) {
    const updates: Record<string, string> = {};

    if (!patient.mrn) {
      updates.mrn = `MRN${String(n).padStart(6, "0")}`;
      n++;
    }

    if (!patient.firstName || !patient.lastName) {
      const parts = patient.name.split(/,\s*/);
      if (parts.length >= 2) {
        updates.lastName = patient.lastName ?? parts[0];
        const firstParts = parts[1].split(" ");
        updates.firstName = patient.firstName ?? firstParts[0];
        if (!patient.middleName && firstParts.length > 1) {
          updates.middleName = firstParts.slice(1).join(" ");
        }
      } else {
        const nameParts = patient.name.trim().split(/\s+/);
        updates.firstName = patient.firstName ?? nameParts[0] ?? "Unknown";
        updates.lastName = patient.lastName ?? (nameParts.slice(1).join(" ") || "Unknown");
      }
    }

    if (!patient.allergies) {
      updates.allergies = "NKDA";
    }

    if (Object.keys(updates).length > 0) {
      await prisma.patient.update({ where: { id: patient.id }, data: updates });
      console.log(`Updated ${patient.name}`);
    }
  }

  console.log("Backfill complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
