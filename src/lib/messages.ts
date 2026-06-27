export const MESSAGE_PRIORITIES = [
  { value: "ROUTINE", label: "Routine" },
  { value: "URGENT", label: "Urgent" },
] as const;

export const MESSAGE_CATEGORIES = [
  { value: "GENERAL", label: "General", description: "Staff communication" },
  { value: "PATIENT", label: "Patient Question", description: "Clinical question about a patient" },
  { value: "REFILL", label: "Medication Refill", description: "Prescription refill request" },
  { value: "LAB_RESULT", label: "Lab / Results", description: "Result review or notification" },
  { value: "CALLBACK", label: "Patient Callback", description: "Return call needed" },
  { value: "REFERRAL", label: "Referral", description: "Consult or referral coordination" },
] as const;

export type MessagePriority = (typeof MESSAGE_PRIORITIES)[number]["value"];
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number]["value"];

export function getMessagePriorityLabel(priority: string) {
  return MESSAGE_PRIORITIES.find((p) => p.value === priority)?.label ?? priority;
}

export function getMessageCategoryLabel(category: string) {
  return MESSAGE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function getMessageCategoryDescription(category: string) {
  return MESSAGE_CATEGORIES.find((c) => c.value === category)?.description ?? "";
}
