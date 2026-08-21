export type ReminderDTO = {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  body: string | null;
  dueDate: string;
  status: "PENDING" | "COMPLETED";
  completedAt: string | null;
  createdAt: string;
  isOverdue: boolean;
  createdById: string;
  createdByName: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  documentId: string | null;
  reviewTargetId: string | null;
  reviewTargetName: string | null;
  isDocumentReview: boolean;
};

function personLabel(user?: { name: string | null; email: string } | null) {
  if (!user) return null;
  const name = user.name?.trim();
  return name || user.email || null;
}

export function toReminderDTO(
  reminder: {
    id: string;
    patientId: string;
    title: string;
    body: string | null;
    dueDate: Date;
    status: string;
    completedAt: Date | null;
    createdAt: Date;
    createdById: string;
    assignedToId?: string | null;
    documentId?: string | null;
    reviewTargetId?: string | null;
    reviewTargetName?: string | null;
    patient: { name: string };
    createdBy?: { name: string | null; email: string } | null;
    assignedTo?: { name: string | null; email: string } | null;
  },
  now = new Date()
): ReminderDTO {
  const due = reminder.dueDate;
  const isOverdue =
    reminder.status === "PENDING" &&
    due.toISOString().slice(0, 10) < now.toISOString().slice(0, 10);
  const reviewTargetId = reminder.reviewTargetId ?? reminder.documentId ?? null;

  return {
    id: reminder.id,
    patientId: reminder.patientId,
    patientName: reminder.patient.name,
    title: reminder.title,
    body: reminder.body,
    dueDate: reminder.dueDate.toISOString(),
    status: reminder.status as ReminderDTO["status"],
    completedAt: reminder.completedAt?.toISOString() ?? null,
    createdAt: reminder.createdAt.toISOString(),
    isOverdue,
    createdById: reminder.createdById,
    createdByName: personLabel(reminder.createdBy),
    assignedToId: reminder.assignedToId ?? null,
    assignedToName: personLabel(reminder.assignedTo),
    documentId: reminder.documentId ?? null,
    reviewTargetId,
    reviewTargetName: reminder.reviewTargetName ?? null,
    isDocumentReview: Boolean(reviewTargetId),
  };
}
