import type { NoteType } from "./notes";
import type { NoteSectionKey } from "./note-content";

export type NoteFieldDef = {
  key: NoteSectionKey;
  label: string;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
};

export type NoteTabDef = {
  id: string;
  label: string;
  fields: NoteFieldDef[];
};

const CLINICAL_TABS: NoteTabDef[] = [
  {
    id: "cc_hpi",
    label: "Chief Complaint & HPI",
    fields: [
      { key: "chiefComplaint", label: "Chief Complaint", placeholder: "Reason for visit...", size: "sm" },
      { key: "hpi", label: "History of Present Illness", placeholder: "Describe the present illness...", size: "lg" },
    ],
  },
  {
    id: "history",
    label: "History",
    fields: [
      { key: "pastMedicalHistory", label: "Past Medical History", placeholder: "PMH...", size: "md" },
      { key: "socialHistory", label: "Social History", placeholder: "Social history...", size: "md" },
      { key: "familyHistory", label: "Family History", placeholder: "Family history...", size: "md" },
    ],
  },
  {
    id: "ros",
    label: "Review of Systems",
    fields: [
      {
        key: "reviewOfSystems",
        label: "Review of Systems",
        placeholder:
          "Constitutional:\nEyes:\nENT:\nCardiovascular:\nRespiratory:\nGastrointestinal:\nGenitourinary:\nMusculoskeletal:\nSkin:\nNeurological:\nPsychiatric:\nEndocrine:\nHematologic/Lymphatic:\nAllergic/Immunologic:",
        size: "lg",
      },
    ],
  },
  {
    id: "physical_exam",
    label: "Physical Exam",
    fields: [{ key: "physicalExam", label: "Exam Findings", placeholder: "Additional exam findings...", size: "lg" }],
  },
  {
    id: "medications",
    label: "Current Medications",
    fields: [{ key: "currentMedications", label: "Current Medications", placeholder: "Medications and doses...", size: "lg" }],
  },
  {
    id: "studies",
    label: "Studies",
    fields: [
      { key: "labs", label: "Labs", placeholder: "Lab results...", size: "md" },
      { key: "imaging", label: "Imaging", placeholder: "Imaging results...", size: "md" },
    ],
  },
  {
    id: "assessment_plan",
    label: "Assessment & Plan",
    fields: [
      { key: "assessment", label: "Assessment", placeholder: "Clinical assessment...", size: "md" },
      { key: "plan", label: "Plan", placeholder: "Treatment plan...", size: "md" },
    ],
  },
];

const SIMPLE_TAB: NoteTabDef[] = [
  {
    id: "content",
    label: "Note",
    fields: [{ key: "content", label: "Note Content", placeholder: "Enter note...", size: "lg" }],
  },
];

const PHONE_TABS: NoteTabDef[] = [
  {
    id: "phone",
    label: "Phone Encounter",
    fields: [
      { key: "chiefComplaint", label: "Reason for Call", size: "sm" },
      { key: "hpi", label: "Discussion", size: "lg" },
      { key: "plan", label: "Plan / Follow-up", size: "md" },
    ],
  },
];

const LETTER_TABS: NoteTabDef[] = [
  {
    id: "letter",
    label: "Patient Letter",
    fields: [
      { key: "chiefComplaint", label: "Subject / Re", placeholder: "Regarding your recent visit...", size: "sm" },
      { key: "hpi", label: "Letter Body", placeholder: "Dear [Patient],\n\n...", size: "lg" },
      {
        key: "plan",
        label: "Delivery & Follow-up",
        placeholder: "Sent via: (mail / portal / fax)\n\nCopies to:\n\nFollow-up:",
        size: "md",
      },
    ],
  },
];

const STRUCTURED_NOTE_TYPES: NoteType[] = ["NEW_PATIENT", "PROGRESS_NOTE", "FOLLOW_UP"];

export function usesStructuredNote(type: NoteType): boolean {
  return STRUCTURED_NOTE_TYPES.includes(type);
}

export function getNoteTabs(type: NoteType): NoteTabDef[] {
  if (STRUCTURED_NOTE_TYPES.includes(type)) return CLINICAL_TABS;
  if (type === "PHONE_CALL") return PHONE_TABS;
  if (type === "PATIENT_LETTER") return LETTER_TABS;
  return SIMPLE_TAB;
}

export function getAllNoteTabs(type: NoteType): NoteTabDef[] {
  return [...getNoteTabs(type), { id: "pdf", label: "PDF", fields: [] }];
}
