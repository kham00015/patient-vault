import { PrismaClient } from "@prisma/client";
import { applyDatabaseUrl } from "./database-url";

// Ensure passwords with # ? @ etc. never produce an invalid Prisma URL.
applyDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
