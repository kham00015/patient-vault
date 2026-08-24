import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import {
  AI_ASSESSMENT_RULES,
  AI_CHART_CHAT_RULES,
  AI_GUIDELINES_CLINIC_RULES,
  AI_GUIDELINES_RULES,
  AI_HPI_CHART_RULES,
  AI_HPI_FOLLOWUP_RULES,
  AI_HPI_NEW_RULES,
  AI_ORGANIZE_RULES,
  AI_PLAN_RULES,
} from "@/lib/ai-rules";
import type { HpiVisitKind } from "@/lib/hpi-visit-context";
import type { ChartDocumentAttachment } from "@/lib/ai-chart-context";
import { appendMyBrainToPrompt } from "@/lib/my-brain";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const DEFAULT_BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID?.trim() ||
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

function getBedrockRegion() {
  return (
    process.env.BEDROCK_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    "us-east-1"
  );
}

export function isBedrockConfigured() {
  // IAM role on Lightsail/EC2 is enough; local needs access key or SSO profile.
  // Treat as configured when model id is present (default always is).
  // Soft-check: require either explicit keys OR assume role in production.
  if (process.env.BEDROCK_DISABLED === "1") return false;
  const hasKeys = Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim()
  );
  const assumeRoleOk =
    process.env.NODE_ENV === "production" || process.env.AWS_USE_INSTANCE_ROLE === "1";
  return hasKeys || assumeRoleOk || Boolean(process.env.AWS_PROFILE?.trim());
}

function getBedrockClient() {
  return new BedrockRuntimeClient({ region: getBedrockRegion() });
}

const CLINICAL_SYSTEM = AI_CHART_CHAT_RULES;

function toBedrockMessages(
  messages: ChatMessage[],
  attachments: ChartDocumentAttachment[] = []
): Message[] {
  const filtered = messages.filter(
    (m) => (m.role === "user" || m.role === "assistant") && m.content.trim()
  );

  const out: Message[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const msg = filtered[i]!;
    const isLastUser =
      msg.role === "user" && i === filtered.length - 1 && attachments.length > 0;

    if (!isLastUser) {
      out.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: [{ text: msg.content }],
      });
      continue;
    }

    const blocks: ContentBlock[] = [];
    const usedNames = new Set<string>();
    for (const [index, att] of attachments.entries()) {
      if (att.kind === "document") {
        let name = att.name.replace(/\.[^.]+$/, "").trim() || "document";
        name = name
          .replace(/[^a-zA-Z0-9 \-()[\]]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180);
        if (!name) name = "document";
        if (usedNames.has(name)) {
          name = `${name} (${index + 1})`.slice(0, 200);
        }
        usedNames.add(name);
        blocks.push({
          document: {
            name,
            format: att.format,
            source: { bytes: att.bytes },
          },
        });
      } else {
        blocks.push({
          image: {
            format: att.format,
            source: { bytes: att.bytes },
          },
        });
      }
    }
    blocks.push({ text: msg.content });
    out.push({ role: "user", content: blocks });
  }

  return out;
}

function extractText(content: ContentBlock[] | undefined) {
  if (!content?.length) return "No response";
  return content
    .map((block) => ("text" in block && block.text ? block.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim() || "No response";
}

export async function chatWithAI(params: {
  messages: ChatMessage[];
  patientData?: string;
  attachments?: ChartDocumentAttachment[];
  brainAttachments?: ChartDocumentAttachment[];
  pastConversations?: string;
  brainData?: string;
}) {
  if (!isBedrockConfigured()) {
    return {
      response:
        "AI is not configured for AWS Bedrock. Set AWS credentials (or instance role), AWS_REGION, and optionally BEDROCK_MODEL_ID. Ensure the Bedrock model is enabled in this AWS account/region (BAA already covers Bedrock).",
      configured: false,
      provider: "bedrock" as const,
    };
  }

  const allAttachments = [
    ...(params.attachments ?? []),
    ...(params.brainAttachments ?? []),
  ].slice(0, 30);

  const systemBlocks: SystemContentBlock[] = [
    {
      text: `${appendMyBrainToPrompt(CLINICAL_SYSTEM, params.brainData)}${
        params.patientData ? `\n\n=== PATIENT CHART ===\n${params.patientData}` : ""
      }${
        params.pastConversations
          ? `\n\n=== PAST CONVERSATIONS ===\n${params.pastConversations}`
          : ""
      }`,
    },
  ];

  try {
    const client = getBedrockClient();
    const response = await client.send(
      new ConverseCommand({
        modelId: DEFAULT_BEDROCK_MODEL_ID,
        system: systemBlocks,
        messages: toBedrockMessages(params.messages, allAttachments),
        inferenceConfig: {
          temperature: 0.2,
          maxTokens: 4096,
        },
      })
    );

    return {
      response: extractText(response.output?.message?.content),
      configured: true,
      provider: "bedrock" as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "";
    if (
      /AccessDenied|is not authorized|could not resolve|ResourceNotFound|ValidationException|end of its life|ModelNotReady|not enabled|document file name/i.test(
        `${name} ${message}`
      )
    ) {
      return {
        response:
          `Bedrock request failed: ${message}`,
        configured: false,
        provider: "bedrock" as const,
      };
    }
    throw error;
  }
}

export async function organizeChartWithAI(chartText: string) {
  if (!isBedrockConfigured()) {
    throw new Error(
      "AWS Bedrock is not configured. Set AWS credentials/role and BEDROCK_MODEL_ID for production AI."
    );
  }

  const systemPrompt = AI_ORGANIZE_RULES;

  const client = getBedrockClient();
  const response = await client.send(
    new ConverseCommand({
      modelId: DEFAULT_BEDROCK_MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: [
        {
          role: "user",
          content: [{ text: chartText }],
        },
      ],
      inferenceConfig: {
        temperature: 0.1,
        maxTokens: 3000,
      },
    })
  );

  const text = extractText(response.output?.message?.content);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI organize returned no JSON");
  return JSON.parse(jsonMatch[0]) as Record<string, string>;
}

export async function draftNoteSectionWithAI(params: {
  target: "assessment" | "plan" | "hpi";
  noteContext: string;
  patientData?: string;
  attachments?: ChartDocumentAttachment[];
  brainData?: string;
}) {
  if (!isBedrockConfigured()) {
    throw new Error(
      "AWS Bedrock is not configured. Set AWS credentials/role and BEDROCK_MODEL_ID."
    );
  }

  const target = params.target;
  const systemRules =
    target === "assessment"
      ? AI_ASSESSMENT_RULES
      : target === "plan"
        ? AI_PLAN_RULES
        : AI_HPI_CHART_RULES;
  const systemPrompt = appendMyBrainToPrompt(systemRules, params.brainData);

  const chartBlock = params.patientData?.trim()
    ? `\n\n=== FULL PATIENT CHART (review thoroughly) ===\n${params.patientData.trim()}`
    : "";

  const sectionLabel =
    target === "assessment" ? "Assessment" : target === "plan" ? "Plan" : "complete HPI";

  const extraInstruction =
    target === "assessment"
      ? " Every assessment diagnosis line must start with an ICD-10-CM code, then the diagnosis (example: J45.51 Uncontrolled asthma with recent exacerbation)."
      : target === "hpi"
        ? " Write narrative prose suitable for the HPI box. Do not title it HPI. Use prior notes, PDFs, forms, and chart sections to produce a complete history focused on today's visit."
        : "";

  const userText = `Draft the ${sectionLabel} for this visit note after reviewing the FULL chart, PDFs/documents, forms, orders, prior notes, and the current visit note below.${extraInstruction} If there is a MAJOR conflict between sources, keep your best draft and add a parenthetical conflict note at the bottom after one blank line.

=== CURRENT VISIT NOTE ===
${params.noteContext}${chartBlock}`;

  const attachments = (params.attachments ?? []).slice(0, 30);
  const client = getBedrockClient();
  const command = new ConverseCommand({
    modelId: DEFAULT_BEDROCK_MODEL_ID,
    system: [{ text: systemPrompt }],
    messages: toBedrockMessages([{ role: "user", content: userText }], attachments),
    inferenceConfig: {
      temperature: 0.25,
      maxTokens: target === "hpi" ? 3200 : 2500,
    },
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.send(command);
      const raw = extractText(response.output?.message?.content);
      return {
        text:
          target === "hpi" ? normalizeHpiDraft(raw) : normalizeSectionList(raw),
        provider: "bedrock" as const,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (
        attempt === 0 &&
        /ECONNRESET|ETIMEDOUT|socket hang up|TimeoutError|ServiceUnavailable|throttl/i.test(message)
      ) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI draft failed");
}

export async function draftHpiFromTranscript(params: {
  transcript: string;
  visitKind: HpiVisitKind;
  visitReason?: string;
  brainData?: string;
}) {
  if (!isBedrockConfigured()) {
    throw new Error(
      "AWS Bedrock is not configured. Set AWS credentials/role and BEDROCK_MODEL_ID."
    );
  }

  const isNew = params.visitKind === "NEW_PATIENT";
  const systemPrompt = appendMyBrainToPrompt(
    isNew ? AI_HPI_NEW_RULES : AI_HPI_FOLLOWUP_RULES,
    params.brainData
  );

  const client = getBedrockClient();
  const response = await client.send(
    new ConverseCommand({
      modelId: DEFAULT_BEDROCK_MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: [
        {
          role: "user",
          content: [
            {
              text: `Visit type for this draft: ${isNew ? "NEW PATIENT (full HPI)" : "FOLLOW-UP (interval HPI)"}${
                params.visitReason ? `\nDetection note: ${params.visitReason}` : ""
              }\n\nConversation transcript (Amazon Transcribe Medical):\n\n${params.transcript}`,
            },
          ],
        },
      ],
      inferenceConfig: {
        temperature: 0.25,
        maxTokens: 2200,
      },
    })
  );

  return {
    text: extractText(response.output?.message?.content).replace(/^HPI:\s*/i, "").trim(),
    provider: "bedrock" as const,
  };
}

export async function reviewChartGuidelinesWithAI(params: {
  patientData: string;
  attachments?: ChartDocumentAttachment[];
  brainAttachments?: ChartDocumentAttachment[];
  brainData?: string;
}) {
  if (!isBedrockConfigured()) {
    return {
      response:
        "AI is not configured for AWS Bedrock. Set AWS credentials (or instance role), AWS_REGION, and optionally BEDROCK_MODEL_ID.",
      configured: false,
      provider: "bedrock" as const,
    };
  }

  const brainBlock = params.brainData?.trim()
    ? params.brainData.trim()
    : `=== CLINIC / PERSONAL GUIDELINES (PRIORITY — follow these first when they apply) ===
${AI_GUIDELINES_CLINIC_RULES.trim() || "(None added yet — use general guidelines.)"}`;

  const systemText = `${AI_GUIDELINES_RULES}

${brainBlock}

=== PATIENT CHART ===
${params.patientData}`;

  const allAttachments = [
    ...(params.attachments ?? []),
    ...(params.brainAttachments ?? []),
  ].slice(0, 30);

  try {
    const client = getBedrockClient();
    const response = await client.send(
      new ConverseCommand({
        modelId: DEFAULT_BEDROCK_MODEL_ID,
        system: [{ text: systemText }],
        messages: toBedrockMessages(
          [
            {
              role: "user",
              content:
                "Review this patient's chart against My Brain / guidelines (priority) and general guidelines. Produce the structured care recommendations now.",
            },
          ],
          allAttachments
        ),
        inferenceConfig: {
          temperature: 0.2,
          maxTokens: 4096,
        },
      })
    );

    return {
      response: normalizeGuidelinesText(extractText(response.output?.message?.content)),
      configured: true,
      provider: "bedrock" as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      response: `Bedrock guidelines review failed: ${message}`,
      configured: false,
      provider: "bedrock" as const,
    };
  }
}

/** Prefer plain diagnosis blocks + dash lines; strip markdown bold/headers. */
function normalizeGuidelinesText(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[*•]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Narrative HPI draft — keep paragraphs; strip title/markdown noise. */
function normalizeHpiDraft(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*HPI:\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One item per line, no blank lines between items; keep conflict footnotes at bottom. */
function normalizeSectionList(raw: string) {
  const sourceLines = raw.replace(/\r\n/g, "\n").split("\n");
  const items: string[] = [];
  const conflicts: string[] = [];

  for (const sourceLine of sourceLines) {
    const trimmed = sourceLine.trim();
    if (!trimmed) continue;
    const cleaned = trimmed.replace(/^[\s*\-•\d.]+/, "").trim();
    if (!cleaned) continue;

    const normalized = cleaned
      .replace(/\b6\s*MWT\b/gi, "six minute walk")
      .replace(
        /\b(?:(?:6|six)[\s\-]*)?(?:min(?:ute|tue)?s?|mintue)\s+walk\b/gi,
        "six minute walk"
      )
      .replace(/\b(?:six\s+){2,}minute walk\b/gi, "six minute walk");

    if (/^\(.*\)$/.test(normalized) || /^conflict\b/i.test(normalized)) {
      const note = normalized.startsWith("(") ? normalized : `(${normalized})`;
      conflicts.push(note);
      continue;
    }

    items.push(normalized);
  }

  if (items.length === 0 && conflicts.length === 0) return raw.trim();
  if (conflicts.length === 0) return items.join("\n");
  return `${items.join("\n")}\n\n${conflicts.join("\n")}`.trim();
}

