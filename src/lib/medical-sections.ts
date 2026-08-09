/** Client-safe chart section labels (no server/Prisma deps). */
export const MEDICAL_SECTIONS = [
  { key: "diagnosis", label: "Diagnosis", icon: "🩺" },
  { key: "echo", label: "Echo", icon: "💓" },
  { key: "pft", label: "PFTs", icon: "🫁" },
  { key: "sleep", label: "Sleep Study", icon: "😴" },
  { key: "labs", label: "Labs", icon: "🧪" },
  { key: "imaging", label: "Imaging", icon: "📷" },
  { key: "medications", label: "Medications", icon: "💊" },
  { key: "social", label: "Social History", icon: "👥" },
] as const;

export type MedicalSectionKey = (typeof MEDICAL_SECTIONS)[number]["key"];
