import { NextResponse } from "next/server";
import { listClinicalFormTemplates, suggestFormTemplates } from "@/lib/clinical-forms";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const diagnosis = searchParams.get("diagnosis")?.trim() || undefined;
  const suggest = searchParams.get("suggest") === "1" || Boolean(diagnosis);

  const templates = suggest
    ? suggestFormTemplates({ diagnosis }).map(({ scoreResponses: _, ...rest }) => rest)
    : listClinicalFormTemplates();

  return NextResponse.json({ templates });
}
