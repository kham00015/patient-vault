import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "patient-vault",
    timestamp: new Date().toISOString(),
  });
}
