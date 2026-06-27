import { expandIcd10SearchTerms, getIcd10AliasHint } from "./icd10-aliases";

export type Icd10Diagnosis = {
  code: string;
  description: string;
};

export type Icd10SearchResult = {
  total: number;
  results: Icd10Diagnosis[];
  /** Set when an abbreviation was expanded to a full-text search. */
  expandedQuery?: string;
};

/** NLM Clinical Table Search Service — ICD-10-CM (US clinical standard). */
const ICD10_API =
  "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?sf=code,name";

type NlmIcd10Response = [number, string[], unknown, [string, string][]];

export function formatDiagnosisLine(code: string, description: string) {
  return `${code} — ${description}`;
}

export function diagnosisListHasCode(content: string, code: string): boolean {
  const escaped = code.replace(/\./g, "\\.");
  return new RegExp(`^${escaped}(\\s|—|-|$)`, "m").test(content);
}

export function appendDiagnosis(content: string, code: string, description: string): string {
  if (diagnosisListHasCode(content, code)) return content;
  const line = formatDiagnosisLine(code, description);
  const trimmed = content.trim();
  return trimmed ? `${trimmed}\n${line}` : line;
}

async function searchIcd10Term(
  term: string,
  count: number
): Promise<{ total: number; results: Icd10Diagnosis[] }> {
  const url = `${ICD10_API}&terms=${encodeURIComponent(term)}&count=${count}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error("ICD-10 search unavailable");
  }

  const data = (await res.json()) as NlmIcd10Response;
  const total = data[0] ?? 0;
  const rows = data[3] ?? [];

  return {
    total,
    results: rows.map(([code, description]) => ({ code, description })),
  };
}

export async function searchIcd10Diagnoses(
  query: string,
  count = 20
): Promise<Icd10SearchResult> {
  const terms = expandIcd10SearchTerms(query);
  if (terms.length === 0 || query.trim().length < 2) {
    return { total: 0, results: [] };
  }

  const merged = new Map<string, Icd10Diagnosis>();
  let bestTotal = 0;
  let expandedQuery: string | undefined;
  const aliasHint = getIcd10AliasHint(query);

  for (const term of terms) {
    const { total, results } = await searchIcd10Term(term, count);
    if (results.length > 0) {
      bestTotal = Math.max(bestTotal, total);
      if (term !== query.trim() && aliasHint && term === aliasHint) {
        expandedQuery = aliasHint;
      }
      for (const item of results) {
        merged.set(item.code, item);
      }
    }
  }

  const results = Array.from(merged.values()).slice(0, count);

  return {
    total: results.length > 0 ? bestTotal : 0,
    results,
    expandedQuery,
  };
}
