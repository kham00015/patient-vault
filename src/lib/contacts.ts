import type { Contact, ContactType } from "@prisma/client";

export const CONTACT_TYPES = [
  {
    value: "REFERRAL_SPECIALIST",
    label: "Referral Specialist",
    description: "Consultants and specialists you refer to",
    color: "text-violet-300",
    badge: "bg-violet-500/15 text-violet-200 ring-violet-500/30",
  },
  {
    value: "PHARMA_REP",
    label: "Pharma Rep",
    description: "Drug and device company representatives",
    color: "text-rose-300",
    badge: "bg-rose-500/15 text-rose-200 ring-rose-500/30",
  },
  {
    value: "LAB",
    label: "Lab",
    description: "Laboratory contacts",
    color: "text-amber-300",
    badge: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
  },
  {
    value: "IMAGING",
    label: "Imaging",
    description: "Radiology and imaging centers",
    color: "text-sky-300",
    badge: "bg-sky-500/15 text-sky-200 ring-sky-500/30",
  },
  {
    value: "HOSPITAL",
    label: "Hospital",
    description: "Hospital and facility contacts",
    color: "text-emerald-300",
    badge: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30",
  },
  {
    value: "INSURANCE",
    label: "Insurance",
    description: "Payer and authorization contacts",
    color: "text-cyan-300",
    badge: "bg-cyan-500/15 text-cyan-200 ring-cyan-500/30",
  },
  {
    value: "OTHER",
    label: "Other",
    description: "Other clinic contacts",
    color: "text-[#8b9cb3]",
    badge: "bg-[#1a2330] text-[#b8c5d6] ring-[#2d3f57]",
  },
] as const;

export type ContactTypeValue = (typeof CONTACT_TYPES)[number]["value"];

export type ContactDTO = {
  id: string;
  name: string;
  type: ContactType;
  location: string | null;
  phone: string | null;
  notes: string | null;
  company: string | null;
  drug: string | null;
  createdAt: string;
  updatedAt: string;
};

export function getContactTypeLabel(type: string) {
  return CONTACT_TYPES.find((item) => item.value === type)?.label ?? type;
}

export function getContactTypeBadge(type: string) {
  return CONTACT_TYPES.find((item) => item.value === type)?.badge ?? CONTACT_TYPES.at(-1)!.badge;
}

export function showsCompanyDrugFields(type: string) {
  return type === "PHARMA_REP" || type === "REFERRAL_SPECIALIST";
}

export function toContactDTO(contact: Contact): ContactDTO {
  return {
    id: contact.id,
    name: contact.name,
    type: contact.type,
    location: contact.location,
    phone: contact.phone,
    notes: contact.notes,
    company: contact.company,
    drug: contact.drug,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}
