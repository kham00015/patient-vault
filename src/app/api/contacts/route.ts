import { NextResponse } from "next/server";
import { z } from "zod";
import type { ContactType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, forbidden } from "@/lib/api";
import { canWrite } from "@/lib/auth";
import { CONTACT_TYPES, toContactDTO } from "@/lib/contacts";

const contactTypeSchema = z.enum(
  CONTACT_TYPES.map((item) => item.value) as [ContactType, ...ContactType[]]
);

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type")?.trim() || undefined;
  const q = searchParams.get("q")?.trim().toLowerCase() || "";

  const contacts = await prisma.contact.findMany({
    where: {
      ...(type && contactTypeSchema.safeParse(type).success ? { type: type as ContactType } : {}),
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  const filtered = q
    ? contacts.filter((contact) => {
        const haystack = [
          contact.name,
          contact.location,
          contact.phone,
          contact.notes,
          contact.company,
          contact.drug,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    : contacts;

  return NextResponse.json({
    contacts: filtered.map(toContactDTO),
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  type: contactTypeSchema.default("OTHER"),
  location: z.string().max(300).optional(),
  phone: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
  company: z.string().max(200).optional(),
  drug: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!canWrite(auth.user.role)) return forbidden();

  try {
    const body = createSchema.parse(await request.json());

    const contact = await prisma.contact.create({
      data: {
        name: body.name.trim(),
        type: body.type,
        location: body.location?.trim() || null,
        phone: body.phone?.trim() || null,
        notes: body.notes?.trim() || null,
        company: body.company?.trim() || null,
        drug: body.drug?.trim() || null,
        createdById: auth.user.id,
      },
    });

    return NextResponse.json({ contact: toContactDTO(contact) }, { status: 201 });
  } catch {
    return badRequest("Invalid request");
  }
}
