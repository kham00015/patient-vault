import type { OrderCategory } from "@prisma/client";

export type CuratedOrderCatalogItem = {
  code: string;
  name: string;
  category: Extract<OrderCategory, "LAB" | "IMAGING">;
  /** Lowercase clinician terms that should resolve to this order. */
  aliases: string[];
};

/**
 * Clinician-friendly lab/imaging names mapped to LOINC codes from the Universal Lab Orders
 * value set. LOINC uses formal names (e.g. "Thyrotropin") — these aliases make search feel
 * like a real order set (BMP, TSH, ANA, etc.).
 */
export const CURATED_ORDER_CATALOG: CuratedOrderCatalogItem[] = [
  { code: "24321-2", name: "BMP (Basic metabolic panel)", category: "LAB", aliases: ["bmp", "basic metabolic", "basic metabolic panel"] },
  { code: "24323-8", name: "CMP (Comprehensive metabolic panel)", category: "LAB", aliases: ["cmp", "comprehensive metabolic", "comprehensive metabolic panel"] },
  { code: "58410-2", name: "CBC (Complete blood count)", category: "LAB", aliases: ["cbc", "complete blood count", "cbc no diff"] },
  { code: "57021-8", name: "CBC with differential", category: "LAB", aliases: ["cbc w diff", "cbc with diff", "cbc differential"] },
  { code: "3016-3", name: "TSH", category: "LAB", aliases: ["tsh", "thyroid stimulating hormone", "thyrotropin"] },
  { code: "11580-8", name: "TSH (high sensitivity)", category: "LAB", aliases: ["tsh sensitive", "tsh hs", "high sensitivity tsh"] },
  { code: "3024-7", name: "Free T4", category: "LAB", aliases: ["free t4", "ft4", "thyroxine free"] },
  { code: "3051-0", name: "Free T3", category: "LAB", aliases: ["free t3", "ft3"] },
  { code: "24348-5", name: "TSH + Free T4 panel", category: "LAB", aliases: ["tsh t4", "thyroid panel", "tsh and free t4"] },
  { code: "17856-6", name: "Hemoglobin A1c", category: "LAB", aliases: ["a1c", "hba1c", "hemoglobin a1c", "hgb a1c"] },
  { code: "24331-1", name: "Lipid panel", category: "LAB", aliases: ["lipid", "lipid panel", "fasting lipid"] },
  { code: "57698-3", name: "Lipid panel with direct LDL", category: "LAB", aliases: ["lipid direct ldl", "ldl direct"] },
  { code: "24325-3", name: "Hepatic function panel (LFTs)", category: "LAB", aliases: ["lft", "lfts", "hepatic function", "liver panel", "liver function"] },
  { code: "4537-7", name: "ESR (Erythrocyte sedimentation rate)", category: "LAB", aliases: ["esr", "sed rate", "sedimentation rate"] },
  { code: "1988-5", name: "CRP", category: "LAB", aliases: ["crp", "c reactive protein"] },
  { code: "30522-7", name: "CRP (high sensitivity)", category: "LAB", aliases: ["hs crp", "hscrp", "crp high sensitivity"] },
  { code: "5048-4", name: "ANA (Antinuclear antibody)", category: "LAB", aliases: ["ana", "antinuclear", "antinuclear antibody", "nuclear antibody"] },
  { code: "33910-1", name: "Rheumatoid factor", category: "LAB", aliases: ["rf", "rheumatoid factor"] },
  { code: "50190-8", name: "Iron panel (Iron + TIBC)", category: "LAB", aliases: ["iron tibc", "iron panel", "iron studies"] },
  { code: "2276-4", name: "Ferritin", category: "LAB", aliases: ["ferritin"] },
  { code: "62292-8", name: "Vitamin D, 25-hydroxy", category: "LAB", aliases: ["vitamin d", "vit d", "25 oh vitamin d", "25-hydroxyvitamin d"] },
  { code: "2132-9", name: "Vitamin B12", category: "LAB", aliases: ["b12", "vitamin b12", "cobalamin"] },
  { code: "30934-4", name: "BNP", category: "LAB", aliases: ["bnp", "brain natriuretic peptide"] },
  { code: "33762-6", name: "NT-proBNP", category: "LAB", aliases: ["nt probnp", "nt-probnp", "pro bnp"] },
  { code: "48065-7", name: "D-dimer", category: "LAB", aliases: ["d-dimer", "ddimer", "d dimer"] },
  { code: "2857-1", name: "PSA", category: "LAB", aliases: ["psa", "prostate specific antigen"] },
  { code: "24356-8", name: "Urinalysis (complete)", category: "LAB", aliases: ["ua", "urinalysis", "urine analysis"] },
  { code: "24357-6", name: "Urinalysis (dipstick)", category: "LAB", aliases: ["ua dipstick", "urinalysis dipstick"] },
  { code: "34528-0", name: "PT/INR panel", category: "LAB", aliases: ["pt inr", "inr", "prothrombin time"] },
  {
    code: "94500-6",
    name: "COVID-19 PCR (SARS-CoV-2 RNA)",
    category: "LAB",
    aliases: [
      "covid",
      "covid test",
      "covid-19",
      "covid19",
      "covid pcr",
      "covid-19 pcr",
      "sars-cov-2",
      "sars cov 2",
      "coronavirus",
      "94500-6",
    ],
  },
  {
    code: "94558-4",
    name: "COVID-19 antigen",
    category: "LAB",
    aliases: ["covid antigen", "covid ag", "covid rapid", "covid rapid antigen", "94558-4"],
  },
  {
    code: "95422-2",
    name: "COVID-19 + Flu A/B PCR panel",
    category: "LAB",
    aliases: ["covid flu", "covid and flu", "flu covid", "respiratory viral pcr", "95422-2"],
  },
  {
    code: "88883-4",
    name: "Autoimmune / Connective tissue Ab panel",
    category: "LAB",
    aliases: [
      "autoimmune panel",
      "autoimmune workup",
      "connective tissue panel",
      "connective tissue autoimmune",
      "ena panel",
      "88883-4",
    ],
  },
  {
    code: "103139-2",
    name: "SLE Ab panel (Systemic lupus Ab panel)",
    category: "LAB",
    aliases: [
      "lupus panel",
      "sle panel",
      "systemic lupus",
      "103139-2",
    ],
  },
  { code: "24635-5", name: "Chest X-ray (PA)", category: "IMAGING", aliases: ["cxr", "chest xray", "chest x-ray", "chest radiograph"] },
  { code: "24627-2", name: "CT Chest", category: "IMAGING", aliases: ["ct chest", "ct chest wo", "chest ct"] },
];

/** Abbreviation → LOINC formal search phrase (when we still need to search the CSV). */
export const ORDER_SEARCH_ALIASES: Record<string, string> = {
  bmp: "basic metabolic panel",
  cmp: "comprehensive metabolic panel",
  tsh: "thyrotropin",
  ft4: "thyroxine free",
  ft3: "triiodothyronine free",
  a1c: "hemoglobin a1c",
  hba1c: "hemoglobin a1c",
  lft: "hepatic function panel",
  lfts: "hepatic function panel",
  esr: "erythrocyte sedimentation",
  crp: "c reactive protein",
  ana: "nuclear antibody",
  rf: "rheumatoid factor",
  ua: "urinalysis",
  psa: "prostate specific",
  bnp: "natriuretic peptide b",
  cxr: "chest",
  covid: "sars-cov-2",
  "covid-19": "sars-cov-2",
  covid19: "sars-cov-2",
  coronavirus: "sars-cov-2",
  autoimmune: "connective tissue autoimmune ab panel",
  "autoimmune panel": "connective tissue autoimmune ab panel",
  "connective tissue": "connective tissue autoimmune ab panel",
  "lupus panel": "systemic lupus ab panel",
  sle: "systemic lupus ab panel",
};

export function expandOrderSearchTerms(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const key = trimmed.toLowerCase();
  const alias = ORDER_SEARCH_ALIASES[key];
  const terms = [trimmed];
  if (alias && alias.toLowerCase() !== key) {
    terms.push(alias);
  }
  return [...new Set(terms)];
}

export function getOrderSearchAliasHint(query: string): string | null {
  const key = query.trim().toLowerCase();
  return ORDER_SEARCH_ALIASES[key] ?? null;
}

function aliasContainsToken(alias: string, token: string): boolean {
  if (!alias.includes(token)) return false;
  if (token.length <= 3 && !/^\d/.test(token)) {
    return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(alias);
  }
  return true;
}

export function matchCuratedOrders(
  query: string,
  category: "LAB" | "IMAGING" | "ALL" = "ALL"
): { item: CuratedOrderCatalogItem; score: number }[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const pool =
    category === "LAB"
      ? CURATED_ORDER_CATALOG.filter((item) => item.category === "LAB")
      : category === "IMAGING"
        ? CURATED_ORDER_CATALOG.filter((item) => item.category === "IMAGING")
        : CURATED_ORDER_CATALOG;

  type Scored = { item: CuratedOrderCatalogItem; score: number };
  const scored: Scored[] = [];

  for (const item of pool) {
    let score = -1;
    for (const alias of item.aliases) {
      if (alias === q) score = Math.max(score, 120);
      else if (alias.startsWith(q)) score = Math.max(score, 90);
      else if (q.startsWith(alias)) score = Math.max(score, 80);
      else if (q.length >= 4 && alias.includes(q)) score = Math.max(score, 70);
      else if (q.split(/\s+/).every((token) => aliasContainsToken(alias, token))) score = Math.max(score, 65);
    }
    const nameHay = item.name.toLowerCase();
    if (nameHay.includes(q)) {
      const nameScore =
        q.length <= 3
          ? new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(item.name)
            ? 55
            : -1
          : 50;
      if (nameScore >= 0) score = Math.max(score, nameScore);
    }
    if (score >= 0) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

  const seen = new Set<string>();
  const results: { item: CuratedOrderCatalogItem; score: number }[] = [];
  for (const entry of scored) {
    const key = `${entry.item.category}:${entry.item.code}:${entry.item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(entry);
  }
  return results;
}
