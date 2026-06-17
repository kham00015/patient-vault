import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const docs = await prisma.knowledgeBaseDocument.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      content: true,
      keywords: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    documents: docs.map((d) => ({
      ...d,
      keywords: JSON.parse(d.keywords || "[]") as string[],
    })),
  });
}

const docSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  id: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = docSchema.parse(await request.json());
    const keywords = extractKeywords(`${body.title} ${body.content}`);

    const doc = body.id
      ? await prisma.knowledgeBaseDocument.update({
          where: { id: body.id },
          data: {
            title: body.title,
            content: body.content,
            keywords: JSON.stringify(keywords),
          },
        })
      : await prisma.knowledgeBaseDocument.create({
          data: {
            title: body.title,
            content: body.content,
            keywords: JSON.stringify(keywords),
            createdById: auth.user.id,
          },
        });

    return NextResponse.json({
      document: { ...doc, keywords: JSON.parse(doc.keywords) },
    });
  } catch {
    return badRequest("Invalid request");
  }
}

function extractKeywords(text: string) {
  const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "have", "been"]);
  const words = text.toLowerCase().match(/\b\w{4,}\b/g) ?? [];
  return [...new Set(words.filter((w) => !stop.has(w)))].slice(0, 20);
}
