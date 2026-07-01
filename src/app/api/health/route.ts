import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "patient-vault" });
  } catch {
    return NextResponse.json({ ok: false, service: "patient-vault" }, { status: 503 });
  }
}
