import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { searchOrderCatalog } from "@/lib/order-catalog";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const categoryParam = (searchParams.get("category") ?? "ALL").toUpperCase();
  const category =
    categoryParam === "LAB" || categoryParam === "IMAGING" ? categoryParam : "ALL";
  const count = Math.min(Number(searchParams.get("count") ?? 25), 50);

  if (q.length < 2) {
    return NextResponse.json({ total: 0, results: [], source: "loinc" });
  }

  try {
    const data = await searchOrderCatalog(q, category, count);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Order catalog search failed" }, { status: 500 });
  }
}
