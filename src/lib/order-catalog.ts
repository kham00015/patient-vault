import { createReadStream, existsSync } from "fs";
import { createInterface } from "readline";
import path from "path";
import type { OrderCategory } from "@prisma/client";
import {
  expandOrderSearchTerms,
  getOrderSearchAliasHint,
  matchCuratedOrders,
} from "@/lib/order-catalog-aliases";

export type OrderCatalogItem = {
  code: string;
  name: string;
  category: Extract<OrderCategory, "LAB" | "IMAGING">;
};

type CatalogCache = {
  labs: OrderCatalogItem[];
  imaging: OrderCatalogItem[];
};

let cache: CatalogCache | null = null;
let loading: Promise<CatalogCache> | null = null;

function catalogDir() {
  return path.join(process.cwd(), "data", "orders");
}

async function readCsvRows(filePath: string): Promise<string[][]> {
  if (!existsSync(filePath)) return [];

  const rows: string[][] = [];
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.replace(/^\uFEFF/, "").trim();
    if (!trimmed) continue;
    rows.push(parseCsvLine(trimmed));
  }

  return rows;
}

/** Minimal CSV parser for LOINC accessory files (quoted fields supported). */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

async function loadCatalog(): Promise<CatalogCache> {
  if (cache) return cache;
  if (loading) return loading;

  loading = (async () => {
    const dir = catalogDir();
    const labRows = await readCsvRows(path.join(dir, "LoincUniversalLabOrdersValueSet.csv"));
    const imagingRows = await readCsvRows(path.join(dir, "ImagingDocumentCodes.csv"));

    const labs: OrderCatalogItem[] = [];
    for (let i = 1; i < labRows.length; i++) {
      const [code, name] = labRows[i];
      if (!code || !name) continue;
      labs.push({ code: code.trim(), name: name.trim(), category: "LAB" });
    }

    const imaging: OrderCatalogItem[] = [];
    const seen = new Set<string>();
    for (let i = 1; i < imagingRows.length; i++) {
      const [code, name] = imagingRows[i];
      if (!code || !name) continue;
      const key = code.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      imaging.push({ code: key, name: name.trim(), category: "IMAGING" });
    }

    cache = { labs, imaging };
    return cache;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

function tokenMatchesHaystack(token: string, hay: string): boolean {
  if (hay.includes(token)) {
    // Short tokens like "ana" must match as a word, not inside "anabasine".
    if (token.length <= 3 && !/^\d/.test(token)) {
      return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay);
    }
    return true;
  }
  return false;
}

function scoreMatch(item: OrderCatalogItem, tokens: string[], raw: string): number {
  const hay = `${item.code} ${item.name}`.toLowerCase();
  if (!tokens.every((t) => tokenMatchesHaystack(t, hay))) return -1;

  let score = 0;
  if (item.code.toLowerCase() === raw) score += 100;
  if (item.code.toLowerCase().startsWith(raw)) score += 40;
  if (item.name.toLowerCase().startsWith(raw)) score += 30;
  if (item.name.toLowerCase().includes(raw)) score += 15;
  for (const token of tokens) {
    if (tokenMatchesHaystack(token, item.name.toLowerCase())) score += 5;
  }
  return score;
}

export async function searchOrderCatalog(
  query: string,
  category: "LAB" | "IMAGING" | "ALL" = "ALL",
  limit = 25
): Promise<{ total: number; results: OrderCatalogItem[]; source: string; expandedQuery?: string }> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { total: 0, results: [], source: "loinc" };

  const catalog = await loadCatalog();
  const pool =
    category === "LAB"
      ? catalog.labs
      : category === "IMAGING"
        ? catalog.imaging
        : [...catalog.labs, ...catalog.imaging];

  const curated = matchCuratedOrders(query, category);
  const searchTerms = expandOrderSearchTerms(query);
  const aliasHint = getOrderSearchAliasHint(query);
  let expandedQuery: string | undefined;
  if (aliasHint && aliasHint.toLowerCase() !== q) {
    expandedQuery = aliasHint;
  }

  const merged = new Map<string, { item: OrderCatalogItem; score: number }>();

  for (const { item, score } of curated) {
    merged.set(`${item.category}:${item.code}:${item.name}`, {
      item: { code: item.code, name: item.name, category: item.category },
      score: 100 + score,
    });
  }

  for (const term of searchTerms) {
    const raw = term.toLowerCase();
    const tokens = raw.split(/\s+/).filter(Boolean);

    for (const item of pool) {
      const score = scoreMatch(item, tokens, raw);
      if (score < 0) continue;
      const key = `${item.category}:${item.code}`;
      const existing = merged.get(key);
      if (!existing || score + 10 > existing.score) {
        merged.set(key, { item, score: score + (term === q ? 10 : 0) });
      }
    }
  }

  const scored = Array.from(merged.values());
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  const results = scored.slice(0, limit).map((s) => s.item);

  return {
    total: scored.length,
    results,
    source: "loinc",
    expandedQuery,
  };
}

export async function getOrderCatalogCounts() {
  const catalog = await loadCatalog();
  return {
    labs: catalog.labs.length,
    imaging: catalog.imaging.length,
  };
}
