import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { searchIcd10Diagnoses } from "@/lib/icd10";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const count = Math.min(Number(searchParams.get("count") ?? 20), 50);

  if (q.length < 2) {
    return NextResponse.json({ total: 0, results: [] });
  }

  try {
    const data = await searchIcd10Diagnoses(q, count);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "ICD-10 search failed" }, { status: 502 });
  }
}
