import type { Encounter, Order, OrderCategory, OrderPriority, OrderStatus, User } from "@prisma/client";

export const ORDER_CATEGORIES: { value: OrderCategory; label: string }[] = [
  { value: "LAB", label: "Lab" },
  { value: "IMAGING", label: "Imaging" },
  { value: "PROCEDURE", label: "Procedure" },
  { value: "REFERRAL", label: "Referral" },
  { value: "OTHER", label: "Other" },
];

export const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: "ORDERED", label: "Ordered" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REVIEWED", label: "Reviewed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const ORDER_PRIORITIES: { value: OrderPriority; label: string }[] = [
  { value: "ROUTINE", label: "Routine" },
  { value: "URGENT", label: "Urgent" },
  { value: "STAT", label: "STAT" },
];

export const COMMON_ORDER_PRESETS: { category: OrderCategory; name: string; code?: string }[] = [
  { category: "LAB", name: "CBC with differential", code: "57021-8" },
  { category: "LAB", name: "CMP", code: "24323-8" },
  { category: "LAB", name: "BMP", code: "24321-2" },
  { category: "LAB", name: "Hemoglobin A1c", code: "17856-6" },
  { category: "LAB", name: "Lipid panel", code: "24331-1" },
  { category: "LAB", name: "TSH", code: "3016-3" },
  { category: "LAB", name: "Free T4", code: "3024-7" },
  { category: "LAB", name: "Vitamin D", code: "62292-8" },
  { category: "LAB", name: "Ferritin", code: "2276-4" },
  { category: "LAB", name: "Iron/TIBC", code: "50190-8" },
  { category: "LAB", name: "ESR", code: "4537-7" },
  { category: "LAB", name: "CRP", code: "1988-5" },
  { category: "LAB", name: "ANA", code: "5048-4" },
  { category: "LAB", name: "COVID-19 PCR", code: "94500-6" },
  { category: "LAB", name: "COVID-19 antigen", code: "94558-4" },
  { category: "LAB", name: "Autoimmune / Connective tissue Ab panel", code: "88883-4" },
  { category: "LAB", name: "SLE Ab panel", code: "103139-2" },
  { category: "LAB", name: "BNP", code: "30934-4" },
  { category: "LAB", name: "D-dimer", code: "48065-7" },
  { category: "LAB", name: "Urinalysis", code: "24356-8" },
  { category: "IMAGING", name: "Chest X-ray", code: "24635-5" },
  { category: "IMAGING", name: "CT chest without contrast" },
  { category: "IMAGING", name: "CT chest with contrast" },
  { category: "IMAGING", name: "CTA chest PE protocol" },
  { category: "IMAGING", name: "CT abdomen/pelvis" },
  { category: "IMAGING", name: "Echocardiogram" },
  { category: "IMAGING", name: "Lower extremity venous ultrasound" },
  { category: "PROCEDURE", name: "Pulmonary function test" },
  { category: "PROCEDURE", name: "Home sleep study" },
  { category: "PROCEDURE", name: "In-lab polysomnography" },
  { category: "PROCEDURE", name: "6-minute walk test" },
  { category: "REFERRAL", name: "Pulmonology referral" },
  { category: "REFERRAL", name: "Cardiology referral" },
  { category: "REFERRAL", name: "Sleep medicine referral" },
];

export type OrderDTO = {
  id: string;
  patientId: string;
  encounterId: string | null;
  category: OrderCategory;
  name: string;
  code: string | null;
  status: OrderStatus;
  priority: OrderPriority;
  orderedAt: string;
  expectedAt: string | null;
  completedAt: string | null;
  reviewedAt: string | null;
  notes: string | null;
  createdByName: string | null;
  reviewedByName: string | null;
  encounter: { id: string; visitCategory: string; modality: string; date: string } | null;
  createdAt: string;
  updatedAt: string;
};

export function toOrderDTO(
  order: Order & {
    createdBy?: Pick<User, "name" | "email"> | null;
    reviewedBy?: Pick<User, "name" | "email"> | null;
    encounter?: Pick<Encounter, "id" | "visitCategory" | "modality" | "date"> | null;
  }
): OrderDTO {
  return {
    id: order.id,
    patientId: order.patientId,
    encounterId: order.encounterId,
    category: order.category,
    name: order.name,
    code: order.code,
    status: order.status,
    priority: order.priority,
    orderedAt: order.orderedAt.toISOString(),
    expectedAt: order.expectedAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    reviewedAt: order.reviewedAt?.toISOString() ?? null,
    notes: order.notes,
    createdByName: order.createdBy?.name ?? order.createdBy?.email ?? null,
    reviewedByName: order.reviewedBy?.name ?? order.reviewedBy?.email ?? null,
    encounter: order.encounter
      ? {
          id: order.encounter.id,
          visitCategory: order.encounter.visitCategory,
          modality: order.encounter.modality,
          date: order.encounter.date.toISOString(),
        }
      : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
