import "server-only";

import { prisma } from "@/lib/prisma";
import { AI_BRAIN_TYPE_LABELS } from "@/lib/ai-brain-types";
import type { ChartDocumentAttachment } from "@/lib/ai-chart-context-types";
import { MY_BRAIN_PRIORITY_RULES } from "@/lib/my-brain-rules";
import {
  absorbedDocumentText,
  type MyBrainDocumentRecord,
} from "@/lib/my-brain-extract";
import {
  fingerprintMyBrainData,
  getCachedMyBrainContext,
  invalidateMyBrainCache,
  setCachedMyBrainContext,
} from "@/lib/my-brain-cache";

export { AI_BRAIN_TYPE_LABELS, AI_BRAIN_TYPES } from "@/lib/ai-brain-types";
export type { AiBrainSourceTypeValue } from "@/lib/ai-brain-types";
export { MY_BRAIN_PRIORITY_RULES } from "@/lib/my-brain-rules";
export { invalidateMyBrainCache } from "@/lib/my-brain-cache";

/** Loaded My Brain context — provider-agnostic; pass to any LLM API. */
export type MyBrainContext = {
  text: string;
  /** Always empty — documents are text-absorbed at upload, not re-attached per request. */
  attachments: ChartDocumentAttachment[];
  sourceCount: number;
  documentCount: number;
  truncated: boolean;
  titles: string[];
  /** True when served from in-memory cache (same content since last edit/upload). */
  cached?: boolean;
};

/**
 * Load this user's active My Brain as prompt text.
 * Document content is absorbed once at upload; AI calls reuse stored text only.
 */
export async function buildMyBrainContext(
  userId: string,
  options?: { maxChars?: number; skipCache?: boolean }
): Promise<MyBrainContext> {
  const maxChars = options?.maxChars ?? 120_000;

  type BrainDocRow = MyBrainDocumentRecord & { updatedAt: Date };

  // Documents model may be missing until `prisma generate` + `db push` after a schema update.
  // Never block AI generation on that — fall back to written directives only.
  const documentsDelegate = (
    prisma as unknown as {
      aiBrainDocument?: {
        findMany: (args: unknown) => Promise<BrainDocRow[]>;
      };
    }
  ).aiBrainDocument;

  const sourcesPromise = prisma.aiBrainSource.findMany({
    where: { active: true, createdById: userId },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      type: true,
      content: true,
      priority: true,
      updatedAt: true,
    },
  });

  const documentsPromise: Promise<BrainDocRow[]> = documentsDelegate
    ? documentsDelegate
        .findMany({
          where: { active: true, createdById: userId },
          orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
          select: {
            id: true,
            sourceId: true,
            title: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            storageKey: true,
            extractedText: true,
            extractionStatus: true,
            priority: true,
            updatedAt: true,
          },
        })
        .catch((err: unknown) => {
          console.warn("[my-brain] documents unavailable; using written directives only", err);
          return [] as BrainDocRow[];
        })
    : Promise.resolve([] as BrainDocRow[]);

  const [sources, documents] = await Promise.all([sourcesPromise, documentsPromise]);

  if (!options?.skipCache && !options?.maxChars) {
    const fingerprint = fingerprintMyBrainData(sources, documents);
    const cached = getCachedMyBrainContext(userId, fingerprint);
    if (cached) return { ...cached, cached: true };
  }

  if (sources.length === 0 && documents.length === 0) {
    return {
      text: "",
      attachments: [],
      sourceCount: 0,
      documentCount: 0,
      truncated: false,
      titles: [],
    };
  }

  const lines: string[] = [
    MY_BRAIN_PRIORITY_RULES,
    "",
    "Note: Uploaded document text was absorbed at upload and is reused here — not re-parsed each request.",
    "",
  ];
  const titles: string[] = [];
  let truncated = false;

  const appendBlock = (block: string, title: string) => {
    if (truncated) return false;
    if (lines.join("\n").length + block.length > maxChars) {
      truncated = true;
      lines.push("\n...[My Brain content truncated for size]");
      return false;
    }
    lines.push(block);
    titles.push(title);
    return true;
  };

  const writtenSources = sources.filter((s) => s.content.trim());
  if (writtenSources.length > 0) {
    lines.push("=== TIER 1: WRITTEN DIRECTIVES ===");
    for (const source of writtenSources) {
      const block = [
        `--- [${AI_BRAIN_TYPE_LABELS[source.type]}] ${source.title} (priority ${source.priority}) ---`,
        source.content.trim(),
        "",
      ].join("\n");
      if (!appendBlock(block, source.title)) break;
    }
    lines.push("");
  }

  const docsBySource = new Map<string, MyBrainDocumentRecord[]>();
  const standaloneDocs: MyBrainDocumentRecord[] = [];
  for (const doc of documents) {
    const record: MyBrainDocumentRecord = doc;
    if (doc.sourceId) {
      const list = docsBySource.get(doc.sourceId) ?? [];
      list.push(record);
      docsBySource.set(doc.sourceId, list);
    } else {
      standaloneDocs.push(record);
    }
  }

  if (standaloneDocs.length > 0 || documents.length > 0) {
    lines.push("=== TIER 2: UPLOADED DOCUMENTS (pre-absorbed text) ===");
  }

  for (const doc of standaloneDocs) {
    const body = absorbedDocumentText(doc);
    const block = `--- Document: ${doc.title} (${doc.fileName}, priority ${doc.priority}) ---\n${body}\n`;
    if (!appendBlock(block, doc.title)) break;
  }

  for (const source of sources) {
    const linked = docsBySource.get(source.id);
    if (!linked?.length) continue;
    if (!appendBlock(`--- Documents linked to "${source.title}" ---`, source.title)) break;
    for (const doc of linked) {
      const body = absorbedDocumentText(doc);
      const block = `  · ${doc.title} (${doc.fileName}, priority ${doc.priority})\n${body}\n`;
      if (!appendBlock(block, doc.title)) break;
    }
  }

  const context: MyBrainContext = {
    text: lines.join("\n").trim(),
    attachments: [],
    sourceCount: writtenSources.length,
    documentCount: documents.length,
    truncated,
    titles,
  };

  if (!options?.skipCache && !options?.maxChars) {
    const fingerprint = fingerprintMyBrainData(sources, documents);
    setCachedMyBrainContext(userId, fingerprint, context);
  }

  return context;
}

/** Shorthand when you only need the prompt block. */
export async function loadMyBrainText(userId: string, options?: { maxChars?: number }) {
  const brain = await buildMyBrainContext(userId, options);
  return brain.text;
}

/** Append My Brain to any system prompt — works with Bedrock, OpenAI, or other APIs. */
export function appendMyBrainToPrompt(basePrompt: string, brain?: MyBrainContext | string) {
  const text = typeof brain === "string" ? brain : brain?.text;
  return text?.trim() ? `${basePrompt.trim()}\n\n${text.trim()}` : basePrompt.trim();
}

/** @deprecated Use buildMyBrainContext */
export const buildAiBrainContext = buildMyBrainContext;
