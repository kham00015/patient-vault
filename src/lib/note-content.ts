import type { NoteType } from "./notes";
import { usesStructuredNote } from "./note-templates";
import { createEmptyVitals, formatVitalsForDisplay, vitalsHasContent, type VitalsData } from "./vitals";

export type NoteSectionKey =
  | "chiefComplaint"
  | "hpi"
  | "pastMedicalHistory"
  | "socialHistory"
  | "familyHistory"
  | "reviewOfSystems"
  | "physicalExam"
  | "currentMedications"
  | "labs"
  | "imaging"
  | "assessment"
  | "plan"
  | "content";

export type NoteSections = Partial<Record<NoteSectionKey, string>>;

export type StructuredNotePayload = {
  v: 1 | 2;
  sections: NoteSections;
  vitals?: VitalsData;
};

export function createEmptySections(_type?: NoteType): NoteSections {
  return {
    chiefComplaint: "",
    hpi: "",
    pastMedicalHistory: "",
    socialHistory: "",
    familyHistory: "",
    reviewOfSystems: "",
    physicalExam: "",
    currentMedications: "",
    labs: "",
    imaging: "",
    assessment: "",
    plan: "",
    content: "",
  };
}

export function serializeNoteContent(
  type: NoteType,
  sections: NoteSections,
  vitals?: VitalsData
): string {
  if (!usesStructuredNote(type)) {
    return sections.content?.trim() || sections.hpi?.trim() || "";
  }
  const payload: StructuredNotePayload = {
    v: 2,
    sections,
    vitals: vitals ?? createEmptyVitals(),
  };
  return JSON.stringify(payload);
}

export function parseNotePayload(
  type: NoteType,
  raw: string
): { sections: NoteSections; vitals: VitalsData } {
  const base = createEmptySections(type);
  const emptyVitals = createEmptyVitals();
  if (!raw?.trim()) return { sections: base, vitals: emptyVitals };

  if (usesStructuredNote(type)) {
    try {
      const parsed = JSON.parse(raw) as StructuredNotePayload;
      if (parsed?.sections) {
        return {
          sections: { ...base, ...parsed.sections },
          vitals: parsed.vitals ? { ...emptyVitals, ...parsed.vitals } : emptyVitals,
        };
      }
    } catch {
      return { sections: { ...base, hpi: raw, content: raw }, vitals: emptyVitals };
    }
  }

  return { sections: { ...base, content: raw }, vitals: emptyVitals };
}

export function parseNoteContent(type: NoteType, raw: string): NoteSections {
  return parseNotePayload(type, raw).sections;
}

export function noteHasContent(
  sections: NoteSections,
  type: NoteType,
  vitals?: VitalsData
): boolean {
  if (!usesStructuredNote(type)) {
    return Boolean(sections.content?.trim());
  }
  if (vitals && vitalsHasContent(vitals)) return true;
  return Object.entries(sections).some(([key, value]) => key !== "content" && Boolean(value?.trim()));
}

export function flattenNoteForDisplay(
  type: NoteType,
  sections: NoteSections,
  vitals?: VitalsData
): string {
  if (!usesStructuredNote(type)) return sections.content?.trim() || "";
  const parts: string[] = [];
  if (vitals && vitalsHasContent(vitals)) {
    parts.push(`Vitals:\n${formatVitalsForDisplay(vitals)}`);
  }
  const labels: Record<string, string> = {
    chiefComplaint: "Chief Complaint",
    hpi: "HPI",
    pastMedicalHistory: "Past Medical History",
    socialHistory: "Social History",
    familyHistory: "Family History",
    reviewOfSystems: "Review of Systems",
    physicalExam: "Physical Exam Findings",
    currentMedications: "Current Medications",
    labs: "Labs",
    imaging: "Imaging",
    assessment: "Assessment",
    plan: "Plan",
  };
  for (const [key, label] of Object.entries(labels)) {
    const val = sections[key as NoteSectionKey]?.trim();
    if (val) parts.push(`${label}:\n${val}`);
  }
  return parts.join("\n\n");
}
