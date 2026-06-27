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
};

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
    patient: { name: string };
  },
  now = new Date()
): ReminderDTO {
  const due = reminder.dueDate;
  const isOverdue =
    reminder.status === "PENDING" &&
    due.toISOString().slice(0, 10) < now.toISOString().slice(0, 10);

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
  };
}
