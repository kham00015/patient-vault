import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, serverError } from "@/lib/api";

export const dynamic = "force-dynamic";

const MAX_SIGNATURE_CHARS = 400_000;

const patchSchema = z.object({
  signatureImage: z.string().nullable(),
});

function isValidSignatureDataUrl(value: string) {
  if (!value.startsWith("data:image/png;base64,")) return false;
  if (value.length > MAX_SIGNATURE_CHARS) return false;
  return true;
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const row = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { signatureImage: true },
  });

  return NextResponse.json({
    signatureImage: row?.signatureImage ?? null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return badRequest("Invalid signature payload");
  }

  const next = body.signatureImage?.trim() || null;
  if (next && !isValidSignatureDataUrl(next)) {
    return badRequest("Signature must be a PNG image");
  }

  try {
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { signatureImage: next },
    });
    return NextResponse.json({ signatureImage: next });
  } catch (error) {
    console.error("[me/signature PATCH]", error);
    return serverError("Could not save signature");
  }
}
