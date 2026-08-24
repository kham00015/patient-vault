"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import {
  parseNotePayload,
  type NoteSectionKey,
  type NoteSections,
} from "@/lib/note-content";
import { VitalsPanel } from "@/components/app/vitals-panel";
import { type VitalsData } from "@/lib/vitals";
import {
  canInsertFromChart,
  getChartInsertText,
  type PatientChartInsertSnapshot,
} from "@/lib/note-chart-map";
import { getNoteTabs, type NoteFieldDef, usesStructuredNote } from "@/lib/note-templates";
import { getNormalNoteText } from "@/lib/normal-note-text";
import { parseFixedNoteSections, type FixedNoteSections } from "@/lib/fixed-note-sections";
import { getNoteTypeLabel, type NoteType } from "@/lib/notes";
import { getNoteAuthorLabel, getNoteStatusLabel } from "@/lib/note-authors";
import { cn, formatDate, toClinicDateInputValue } from "@/lib/utils";
import { AutoSaveStatus, useDebouncedCallback } from "@/lib/use-debounced-callback";
import { FullPageDocumentViewer } from "@/components/app/full-page-document-viewer";
import { DeleteReasonModal } from "@/components/app/delete-reason-modal";
import { AddDiagnosisModal } from "@/components/app/add-diagnosis-modal";
import { MixedNoteField } from "@/components/app/mixed-note-field";
import { NoteTextToolbar } from "@/components/app/note-text-toolbar";
import {
  appendAiNoteContinuation,
  appendPlainToNoteSection,
  noteSectionToPlainText,
} from "@/lib/note-ai-text";
import {
  isNotePanelCollapsed,
  loadCollapsedNotePanels,
  persistCollapsedNotePanels,
  toggleNotePanelCollapsed,
  type CollapsibleNotePanelKey,
} from "@/lib/note-section-layout";
import { readUserScopedItem, writeUserScopedItem } from "@/lib/user-local-storage";
import {
  ArrowDownToLine,
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Expand,
  FileText,
  ArrowRightFromLine,
  Maximize2,
  PenLine,
  Pin,
  Trash2,
  Type,
} from "lucide-react";

const NOTE_FIT_KEY = "pv-note-fit-v1";
const FIT_GROUP_GROW_KEY = "pv-note-fit-group-grow-v1";
const FIT_GROUP_GROW_MIN = 0.7;
const FIT_GROUP_GROW_DEFAULTS: Record<string, number> = {
  subjective: 1.7,
  history: 1.45,
  assessment_plan: 1.3,
  ros_exam: 1.25,
  medications: 1.1,
};

function loadNoteFitMode(userId?: string | null) {
  try {
    return readUserScopedItem(NOTE_FIT_KEY, userId) === "1";
  } catch {
    return false;
  }
}

function persistNoteFitMode(on: boolean, userId?: string | null) {
  writeUserScopedItem(NOTE_FIT_KEY, on ? "1" : "0", userId);
}

function defaultFitGroupGrow(groupId: string) {
  return FIT_GROUP_GROW_DEFAULTS[groupId] ?? 1;
}

function loadFitGroupGrow(userId?: string | null): Record<string, number> {
  try {
    const raw = readUserScopedItem(FIT_GROUP_GROW_KEY, userId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0
      )
    );
  } catch {
    return {};
  }
}

function persistFitGroupGrow(grow: Record<string, number>, userId?: string | null) {
  writeUserScopedItem(FIT_GROUP_GROW_KEY, JSON.stringify(grow), userId);
}

function FitGroupResizeHandle({
  onDelta,
}: {
  onDelta: (dy: number) => void;
}) {
  const dragging = useRef(false);
  const lastY = useRef(0);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragging.current = true;
    lastY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const dy = event.clientY - lastY.current;
    lastY.current = event.clientY;
    if (dy) onDelta(dy);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      title="Drag to resize this section"
      className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="h-0.5 w-14 rounded-full bg-[var(--pv-border-strong)] transition group-hover:bg-cyan-400/80 group-active:bg-cyan-300" />
    </div>
  );
}

export type StructuredNoteData = {
  id: string;
  type: NoteType;
  status: "DRAFT" | "SIGNED";
  date: string;
  content: string;
  signedAt?: string | null;
  createdAt?: string | null;
  revisionCount?: number | null;
  lastRevisedAt?: string | null;
  lastRevisedByName?: string | null;
  encounterId?: string | null;
  authorName?: string | null;
  signedByName?: string | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
  signedBy?: { id: string; name: string | null; email: string } | null;
  lastRevisedBy?: { id: string; name: string | null; email: string } | null;
  revisions?: Array<{
    version: number;
    revisedAt: string;
    revisedByName?: string | null;
  }>;
};

type BoxField = NoteFieldDef & {
  span?: 1 | 2 | 3;
};

type NoteSectionGroup = {
  id: string;
  title: string;
  columns?: 1 | 2 | 3;
  fields: BoxField[];
};

/** Clinical visit layout in SOAP order with deliberate column spans. */
const CLINICAL_GROUPS: NoteSectionGroup[] = [
  {
    id: "subjective",
    title: "Subjective",
    columns: 1,
    fields: [
      {
        key: "chiefComplaint",
        label: "Chief Complaint",
        placeholder: "Reason for visit...",
        size: "sm",
        span: 1,
      },
      {
        key: "hpi",
        label: "History of Present Illness",
        placeholder: "Describe the present illness...",
        size: "lg",
        span: 1,
      },
    ],
  },
  {
    id: "history",
    title: "History",
    columns: 3,
    fields: [
      {
        key: "pastMedicalHistory",
        label: "Past Medical History",
        placeholder: "PMH...",
        size: "md",
        span: 1,
      },
      {
        key: "socialHistory",
        label: "Social History",
        placeholder: "Social history...",
        size: "md",
        span: 1,
      },
      {
        key: "familyHistory",
        label: "Family History",
        placeholder: "Family history...",
        size: "md",
        span: 1,
      },
    ],
  },
  {
    id: "ros_exam",
    title: "Review of Systems & Exam",
    columns: 2,
    fields: [
      {
        key: "reviewOfSystems",
        label: "Review of Systems",
        placeholder:
          "Constitutional:\nEyes:\nENT:\nCardiovascular:\nRespiratory:\nGastrointestinal:\nGenitourinary:\nMusculoskeletal:\nSkin:\nNeurological:\nPsychiatric:\nEndocrine:\nHematologic/Lymphatic:\nAllergic/Immunologic:",
        size: "md",
        span: 1,
      },
      {
        key: "physicalExam",
        label: "Physical Exam",
        placeholder: "Exam findings...",
        size: "md",
        span: 1,
      },
    ],
  },
  {
    id: "medications",
    title: "Medications",
    columns: 1,
    fields: [
      {
        key: "currentMedications",
        label: "Current Medications",
        placeholder: "Medications and doses...",
        size: "lg",
        span: 1,
      },
    ],
  },
  {
    id: "assessment_plan",
    title: "Assessment & Plan",
    columns: 2,
    fields: [
      {
        key: "assessment",
        label: "Assessment",
        placeholder: "ICD-10 code + diagnosis (e.g. J45.51 Uncontrolled asthma)...",
        size: "lg",
        span: 1,
      },
      {
        key: "plan",
        label: "Plan",
        placeholder: "Treatment plan...",
        size: "lg",
        span: 1,
      },
    ],
  },
];

function getNoteGroups(type: NoteType): NoteSectionGroup[] {
  if (usesStructuredNote(type)) return CLINICAL_GROUPS;

  if (type === "PHONE_CALL") {
    return [
      {
        id: "phone",
        title: "Phone Encounter",
        columns: 1,
        fields: [
          { key: "chiefComplaint", label: "Reason for Call", size: "sm", span: 1 },
          { key: "hpi", label: "Discussion", size: "lg", span: 1 },
          { key: "plan", label: "Plan / Follow-up", size: "md", span: 1 },
        ],
      },
    ];
  }

  if (type === "PATIENT_LETTER") {
    return [
      {
        id: "letter",
        title: "Patient Letter",
        columns: 1,
        fields: [
          {
            key: "chiefComplaint",
            label: "Subject / Re",
            placeholder: "Regarding your recent visit...",
            size: "sm",
            span: 1,
          },
          {
            key: "hpi",
            label: "Letter Body",
            placeholder: "Dear [Patient],\n\n...",
            size: "lg",
            span: 1,
          },
          {
            key: "plan",
            label: "Delivery & Follow-up",
            placeholder: "Sent via: (mail / portal / fax)\n\nCopies to:\n\nFollow-up:",
            size: "md",
            span: 1,
          },
        ],
      },
    ];
  }

  return getNoteTabs(type).map((tab) => ({
    id: tab.id,
    title: tab.label,
    columns: 1 as const,
    fields: tab.fields.map((field) => ({ ...field, span: 1 as const })),
  }));
}

function flattenGroupFields(groups: NoteSectionGroup[]): BoxField[] {
  return groups.flatMap((group) => group.fields);
}

function fitStackedRowTemplate(
  fields: BoxField[],
  collapsedPanels: Set<CollapsibleNotePanelKey>
) {
  return fields
    .map((field) => {
      if (isNotePanelCollapsed(collapsedPanels, field.key)) return "auto";
      if (field.key === "hpi" || field.size === "lg") return "minmax(5.5rem,1.15fr)";
      if (field.size === "sm") return "minmax(4.25rem,0.35fr)";
      return "minmax(5.25rem,0.8fr)";
    })
    .join(" ");
}

export function StructuredNoteEditor({
  patientId,
  userId,
  note,
  chartInsertData,
  patientDiagnosis,
  isReadOnly,
  canDeleteNote = false,
  onBack,
  onSaved,
  onSigned,
  onDeleted,
  onPatientDataChange,
  backLabel = "Back to Encounter",
}: {
  patientId: string;
  userId: string;
  note: StructuredNoteData;
  chartInsertData: PatientChartInsertSnapshot;
  patientDiagnosis?: string | null;
  isReadOnly: boolean;
  canDeleteNote?: boolean;
  onBack: () => void;
  onSaved: () => Promise<void>;
  onSigned: () => Promise<void>;
  onDeleted?: () => Promise<void> | void;
  /** Refresh chart patient (diagnosis panel) after PMH DX changes. */
  onPatientDataChange?: () => Promise<void> | void;
  backLabel?: string;
}) {
  const initial = parseNotePayload(note.type, note.content);
  const noteGroups = useMemo(() => getNoteGroups(note.type), [note.type]);
  const boxFields = useMemo(() => flattenGroupFields(noteGroups), [noteGroups]);
  const showVitals = usesStructuredNote(note.type);
  const [sections, setSections] = useState<NoteSections>(() => {
    const problem =
      (patientDiagnosis ?? "").trim() ||
      (chartInsertData.diagnosis ?? "").trim() ||
      (chartInsertData.pmh ?? "").trim() ||
      initial.sections.pastMedicalHistory ||
      "";
    const meds =
      (chartInsertData.medications ?? "").trim() ||
      initial.sections.currentMedications ||
      "";
    return {
      ...initial.sections,
      pastMedicalHistory: problem,
      currentMedications: meds,
    };
  });
  const [vitals, setVitals] = useState<VitalsData>(() => initial.vitals);
  const [date, setDate] = useState(toClinicDateInputValue(note.date));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [signing, setSigning] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [insertingKey, setInsertingKey] = useState<NoteSectionKey | null>(null);
  const [insertingDiagnosis, setInsertingDiagnosis] = useState(false);
  const [fixedSections, setFixedSections] = useState<FixedNoteSections>({});
  const [fixSaving, setFixSaving] = useState<NoteSectionKey | null>(null);
  const [expandedSection, setExpandedSection] = useState<NoteSectionKey | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfRefreshKey, setPdfRefreshKey] = useState(0);
  const [aiTarget, setAiTarget] = useState<"assessment" | "plan" | "hpi" | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiCopied, setAiCopied] = useState(false);
  const [dxModalOpen, setDxModalOpen] = useState(false);
  const [textToolbarKey, setTextToolbarKey] = useState<NoteSectionKey | null>(null);
  const [collapsedPanels, setCollapsedPanels] = useState<Set<CollapsibleNotePanelKey>>(
    () => new Set()
  );
  const [fitMode, setFitMode] = useState(false);
  const [fitGroupGrow, setFitGroupGrow] = useState<Record<string, number>>({});
  const fitBodyRef = useRef<HTMLDivElement>(null);
  const fitGrowSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSigned = note.status === "SIGNED";
  const isRevised = isSigned && (note.revisionCount ?? 0) > 0;
  const statusLabel = getNoteStatusLabel(note);
  const readOnly = isReadOnly;
  const sectionsRef = useRef(sections);
  const vitalsRef = useRef(vitals);
  const dateRef = useRef(date);
  const diagnosisText = (patientDiagnosis ?? chartInsertData.diagnosis ?? "").trim();
  const hasDiagnosis = Boolean(diagnosisText);

  useEffect(() => {
    setCollapsedPanels(loadCollapsedNotePanels(userId));
    setFitMode(loadNoteFitMode(userId));
    setFitGroupGrow(loadFitGroupGrow(userId));

    let cancelled = false;
    api<{
      noteFit?: boolean;
      fitGroupGrow?: Record<string, number>;
      collapsedPanels?: string[];
    }>("/api/me/chart-ui")
      .then((data) => {
        if (cancelled) return;
        if (typeof data.noteFit === "boolean") {
          setFitMode(data.noteFit);
          persistNoteFitMode(data.noteFit, userId);
        }
        if (data.fitGroupGrow && Object.keys(data.fitGroupGrow).length) {
          setFitGroupGrow(data.fitGroupGrow);
          persistFitGroupGrow(data.fitGroupGrow, userId);
        }
        if (data.collapsedPanels) {
          const next = new Set(data.collapsedPanels) as Set<CollapsibleNotePanelKey>;
          setCollapsedPanels(next);
          persistCollapsedNotePanels(next, userId);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (fitGrowSaveTimer.current) window.clearTimeout(fitGrowSaveTimer.current);
    if (!Object.keys(fitGroupGrow).length) return;
    fitGrowSaveTimer.current = setTimeout(() => {
      persistFitGroupGrow(fitGroupGrow, userId);
      api("/api/me/chart-ui", {
        method: "PATCH",
        json: { fitGroupGrow },
      }).catch(() => undefined);
    }, 200);
    return () => {
      if (fitGrowSaveTimer.current) window.clearTimeout(fitGrowSaveTimer.current);
    };
  }, [fitGroupGrow, userId]);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  useEffect(() => {
    vitalsRef.current = vitals;
  }, [vitals]);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  const resizeFitGroups = useCallback(
    (upperId: string, lowerId: string, dy: number) => {
      const host = fitBodyRef.current;
      if (!host || host.clientHeight <= 0 || !dy) return;
      setFitGroupGrow((prev) => {
        const total = noteGroups.reduce(
          (sum, group) => sum + (prev[group.id] ?? defaultFitGroupGrow(group.id)),
          0
        );
        const delta = (dy / host.clientHeight) * Math.max(total, 1);
        const a = prev[upperId] ?? defaultFitGroupGrow(upperId);
        const b = prev[lowerId] ?? defaultFitGroupGrow(lowerId);
        let nextA = a + delta;
        let nextB = b - delta;
        if (nextA < FIT_GROUP_GROW_MIN) {
          nextB -= FIT_GROUP_GROW_MIN - nextA;
          nextA = FIT_GROUP_GROW_MIN;
        }
        if (nextB < FIT_GROUP_GROW_MIN) {
          nextA -= FIT_GROUP_GROW_MIN - nextB;
          nextB = FIT_GROUP_GROW_MIN;
        }
        const next = { ...prev };
        for (const group of noteGroups) {
          if (next[group.id] == null) next[group.id] = defaultFitGroupGrow(group.id);
        }
        next[upperId] = Math.max(FIT_GROUP_GROW_MIN, nextA);
        next[lowerId] = Math.max(FIT_GROUP_GROW_MIN, nextB);
        return next;
      });
    },
    [noteGroups]
  );

  function togglePanel(key: CollapsibleNotePanelKey) {
    setCollapsedPanels((prev) => {
      const next = toggleNotePanelCollapsed(prev, key, userId);
      api("/api/me/chart-ui", {
        method: "PATCH",
        json: { collapsedPanels: [...next] },
      }).catch(() => undefined);
      return next;
    });
  }

  function previewText(value: string | undefined) {
    const trimmed = noteSectionToPlainText(value).trim();
    if (!trimmed) return "Empty";
    return trimmed.replace(/\s+/g, " ").slice(0, 90) + (trimmed.length > 90 ? "…" : "");
  }

  useEffect(() => {
    api<{ patient: { fixedNoteSections?: string } }>(`/api/patients/${patientId}`)
      .then((data) => {
        setFixedSections(parseFixedNoteSections(data.patient.fixedNoteSections));
      })
      .catch(() => undefined);
  }, [patientId]);

  // Keep note PMH / medications mirrored with chart diagnosis+PMH / medications.
  useEffect(() => {
    if (readOnly) return;
    const problem =
      (chartInsertData.diagnosis ?? "").trim() || (chartInsertData.pmh ?? "").trim();
    const meds = (chartInsertData.medications ?? "").trim();
    setSections((prev) => {
      const next = { ...prev };
      let changed = false;
      if ((prev.pastMedicalHistory ?? "") !== problem) {
        next.pastMedicalHistory = problem;
        changed = true;
      }
      if ((prev.currentMedications ?? "") !== meds) {
        next.currentMedications = meds;
        changed = true;
      }
      if (!changed) return prev;
      sectionsRef.current = next;
      return next;
    });
  }, [
    chartInsertData.diagnosis,
    chartInsertData.pmh,
    chartInsertData.medications,
    readOnly,
  ]);

  const persist = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await api(`/api/patients/${patientId}/notes`, {
        method: "POST",
        json: {
          noteId: note.id,
          date: dateRef.current,
          type: note.type,
          sections: sectionsRef.current,
          vitals: vitalsRef.current,
        },
      });
      setDirty(false);
      await onSaved();
      setPdfRefreshKey((k) => k + 1);
    } finally {
      setSaving(false);
    }
  }, [note.id, note.type, onSaved, patientId, readOnly]);

  const { debounced: debouncedPersist } = useDebouncedCallback(persist, 1000);

  function updateVitals(next: VitalsData) {
    if (readOnly) return;
    vitalsRef.current = next;
    setVitals(next);
    setDirty(true);
    debouncedPersist();
  }

  function updateSection(key: NoteSectionKey, value: string) {
    if (readOnly) return;
    setSections((prev) => {
      const next = { ...prev, [key]: value };
      sectionsRef.current = next;
      return next;
    });
    setDirty(true);
    debouncedPersist();
  }

  function applyNormalText(key: NoteSectionKey) {
    const template = getNormalNoteText(key);
    if (!template || readOnly) return;
    updateSection(key, template);
  }

  async function toggleFix(key: NoteSectionKey) {
    if (isReadOnly) return;
    const next = { ...fixedSections, [key]: !fixedSections[key] };
    if (!next[key]) delete next[key];
    setFixedSections(next);
    setFixSaving(key);
    try {
      await api(`/api/patients/${patientId}`, {
        method: "PATCH",
        json: { fixedNoteSections: JSON.stringify(next) },
      });
    } finally {
      setFixSaving(null);
    }
  }

  async function insertFromChart(key: NoteSectionKey) {
    if (readOnly || !canInsertFromChart(key)) return;
    setInsertingKey(key);
    try {
      const data = await api<{ patient: PatientChartInsertSnapshot }>(`/api/patients/${patientId}`);
      const chartText = getChartInsertText(data.patient, key);
      if (!chartText) return;
      updateSection(key, appendPlainToNoteSection(sectionsRef.current[key] ?? "", chartText));
    } finally {
      setInsertingKey(null);
    }
  }

  function insertDiagnosis() {
    if (readOnly || !hasDiagnosis) return;
    setInsertingDiagnosis(true);
    try {
      updateSection("assessment", appendPlainToNoteSection(sectionsRef.current.assessment ?? "", diagnosisText));
    } finally {
      setInsertingDiagnosis(false);
    }
  }

  async function signNote() {
    if (readOnly || isSigned) return;
    setSigning(true);
    try {
      await persist();
      await api(`/api/patients/${patientId}/notes/${note.id}/sign`, { method: "POST" });
      await onSigned();
    } finally {
      setSigning(false);
    }
  }

  async function deleteNote(reason: string) {
    if (isSigned || !canDeleteNote) return;
    await api(`/api/patients/${patientId}/notes/${note.id}`, {
      method: "DELETE",
      json: { reason },
    });
    setShowDeleteConfirm(false);
    await onDeleted?.();
    onBack();
  }

  function ctx(text: string | undefined) {
    return noteSectionToPlainText(text).trim();
  }

  function buildAiNoteContext(target: "assessment" | "plan" | "hpi") {
    const s = sectionsRef.current;
    const parts: string[] = [];
    if (ctx(s.chiefComplaint)) parts.push(`=== CHIEF COMPLAINT ===\n${ctx(s.chiefComplaint)}`);
    if (ctx(s.hpi)) {
      parts.push(
        target === "hpi"
          ? `=== CURRENT HPI DRAFT (incorporate and complete) ===\n${ctx(s.hpi)}`
          : `=== HPI ===\n${ctx(s.hpi)}`
      );
    }
    if (ctx(s.reviewOfSystems)) parts.push(`=== ROS ===\n${ctx(s.reviewOfSystems)}`);
    if (ctx(s.physicalExam)) parts.push(`=== EXAM ===\n${ctx(s.physicalExam)}`);
    if (ctx(s.pastMedicalHistory)) parts.push(`=== NOTE PMH ===\n${ctx(s.pastMedicalHistory)}`);
    if (target === "plan") {
      if (ctx(s.assessment)) parts.push(`=== ASSESSMENT ===\n${ctx(s.assessment)}`);
    } else if (target === "assessment" && ctx(s.assessment)) {
      parts.push(`=== CURRENT ASSESSMENT DRAFT (optional reference) ===\n${ctx(s.assessment)}`);
    }
    if (target === "plan" && ctx(s.plan)) {
      parts.push(`=== CURRENT PLAN DRAFT (optional reference) ===\n${ctx(s.plan)}`);
    }
    if (diagnosisText) parts.push(`=== CHART DIAGNOSES (visit list) ===\n${diagnosisText}`);
    parts.push(
      target === "hpi"
        ? "=== SERVER CHART REVIEW ===\nThe API also loads the full patient chart: sections, prior notes, forms, orders, and uploaded PDFs/images. Produce a COMPLETE HPI from all of that plus this visit note. If sources majorly conflict, keep your best draft and add a parenthetical conflict note at the bottom."
        : "=== SERVER CHART REVIEW ===\nThe API also loads the full patient chart: sections, prior notes, forms, orders, and uploaded PDFs/images. Use all of that with this visit note. If sources majorly conflict, keep your best draft and add a parenthetical conflict note at the bottom."
    );
    return parts.join("\n\n");
  }

  async function runSectionAi(target: "assessment" | "plan" | "hpi") {
    const noteContext = buildAiNoteContext(target);
    if (target === "assessment" && !ctx(sectionsRef.current.hpi)) {
      setAiTarget(target);
      setAiDraft("");
      setAiError("Add HPI first so AI can draft an Assessment.");
      setAiCopied(false);
      return;
    }
    if (target === "plan" && !ctx(sectionsRef.current.hpi) && !ctx(sectionsRef.current.assessment)) {
      setAiTarget(target);
      setAiDraft("");
      setAiError("Add HPI or Assessment first so AI can draft a Plan.");
      setAiCopied(false);
      return;
    }
    if (target === "hpi" && !noteContext.trim()) {
      setAiTarget(target);
      setAiDraft("");
      setAiError("Add a chief complaint or some visit text, or ensure the chart has records for AI to review.");
      setAiCopied(false);
      return;
    }

    setAiTarget(target);
    setAiLoading(true);
    setAiDraft("");
    setAiError("");
    setAiCopied(false);
    try {
      const res = await api<{ text: string }>(`/api/patients/${patientId}/ai/draft-section`, {
        method: "POST",
        json: { target, noteContext },
      });
      setAiDraft(res.text ?? "");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI draft failed");
    } finally {
      setAiLoading(false);
    }
  }

  async function copyAiDraft() {
    if (!aiDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(aiDraft);
      setAiCopied(true);
      window.setTimeout(() => setAiCopied(false), 1500);
    } catch {
      setAiError("Could not copy to clipboard");
    }
  }

  function transferAiDraft() {
    if (readOnly || !aiTarget || !aiDraft.trim()) return;
    const current = sectionsRef.current[aiTarget] ?? "";
    updateSection(aiTarget, appendAiNoteContinuation(current, aiDraft));
    setAiTarget(null);
    setAiDraft("");
    setAiError("");
    setAiCopied(false);
  }

  function renderSectionActions(
    fieldKey: NoteSectionKey,
    options?: { includeExpand?: boolean; includeCollapse?: boolean }
  ) {
    const isFixed = Boolean(fixedSections[fieldKey]);
    const showInsert = canInsertFromChart(fieldKey);
    const hasChartContent = Boolean(getChartInsertText(chartInsertData, fieldKey));
    const includeExpand = options?.includeExpand !== false;
    const includeCollapse = options?.includeCollapse !== false;
    const showDiagnosis = fieldKey === "assessment";
    const showPmhDx = fieldKey === "pastMedicalHistory";
    const showAi = fieldKey === "assessment" || fieldKey === "plan" || fieldKey === "hpi";

    return (
      <div className={cn("flex flex-wrap items-center gap-1", fitMode && "max-w-[min(100%,36rem)] flex-nowrap overflow-x-auto")}>
        {!isReadOnly && (
          <Button
            className={cn(
              "!h-7 !px-2 !text-[11px]",
              textToolbarKey === fieldKey &&
                "!border-violet-500/45 !bg-violet-500/15 !text-violet-200 hover:!bg-violet-500/25"
            )}
            title="Change font, underline, color, and text style"
            onClick={() => setTextToolbarKey((current) => (current === fieldKey ? null : fieldKey))}
          >
            <Type size={12} /> Text
          </Button>
        )}
        {!isReadOnly && getNormalNoteText(fieldKey) && (
          <Button className="!h-7 !px-2 !text-[11px]" onClick={() => applyNormalText(fieldKey)}>
            Normal
          </Button>
        )}
        {!isReadOnly && showInsert && (
          <Button
            className="!h-7 !px-2 !text-[11px]"
            disabled={!hasChartContent || insertingKey === fieldKey}
            onClick={() => insertFromChart(fieldKey)}
          >
            <ArrowDownToLine size={12} />
            {insertingKey === fieldKey ? "..." : "Insert"}
          </Button>
        )}
        {!isReadOnly && (
          <Button
            className={cn(
              "!h-7 !px-2 !text-[11px]",
              isFixed &&
                "!border-[color-mix(in_srgb,var(--warning)_50%,transparent)] !bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] !text-[var(--pv-fg)] hover:!bg-[color-mix(in_srgb,var(--warning)_26%,transparent)]"
            )}
            disabled={fixSaving === fieldKey}
            onClick={() => toggleFix(fieldKey)}
          >
            <Pin size={12} className={cn(isFixed && "fill-current")} />
            {fixSaving === fieldKey ? "..." : "Fix"}
          </Button>
        )}
        {!isReadOnly && showDiagnosis && (
          <Button
            className="!h-7 !px-2 !text-[11px]"
            disabled={!hasDiagnosis || insertingDiagnosis}
            onClick={insertDiagnosis}
            title={hasDiagnosis ? "Insert diagnoses from chart" : "No diagnoses on chart"}
          >
            <ArrowDownToLine size={12} />
            {insertingDiagnosis ? "..." : "Diagnosis"}
          </Button>
        )}
        {!isReadOnly && showPmhDx && (
          <Button
            className="!h-7 !px-2 !text-[11px] !border-[color-mix(in_srgb,var(--pv-accent-strong)_50%,transparent)] !bg-[color-mix(in_srgb,var(--pv-accent-strong)_14%,transparent)] !text-[var(--pv-accent-strong)] hover:!bg-[color-mix(in_srgb,var(--pv-accent-strong)_22%,transparent)]"
            title="Add ICD-10 diagnosis to PMH"
            onClick={() => setDxModalOpen(true)}
          >
            DX
          </Button>
        )}
        {includeCollapse && (
          <Button
            className="!h-7 !px-2 !text-[11px] !border-[color-mix(in_srgb,var(--pv-accent-strong)_45%,transparent)] !bg-[color-mix(in_srgb,var(--pv-accent-strong)_12%,transparent)] !text-[var(--pv-accent-strong)] hover:!bg-[color-mix(in_srgb,var(--pv-accent-strong)_20%,transparent)]"
            title="Collapse this section in the note"
            onClick={() => togglePanel(fieldKey)}
          >
            <ChevronUp size={12} /> Collapse
          </Button>
        )}
        {includeExpand && (
          <Button
            className="!h-7 !w-7 !px-0 !text-[11px]"
            title="Expand section"
            aria-label="Expand section"
            onClick={() => setExpandedSection(fieldKey)}
          >
            <Expand size={12} />
          </Button>
        )}
        {!readOnly && showAi && (
          <Button
            className="!h-7 !gap-1 !px-2 !text-[11px] pv-ai-btn"
            title={
              fieldKey === "assessment"
                ? "Draft Assessment from full chart + HPI with AI"
                : fieldKey === "plan"
                  ? "Draft Plan from full chart + HPI/Assessment with AI"
                  : "Draft complete HPI from full chart, PDFs, and prior notes"
            }
            disabled={aiLoading && aiTarget === fieldKey}
            onClick={() => runSectionAi(fieldKey as "assessment" | "plan" | "hpi")}
          >
            <Bot size={12} />
            {aiLoading && aiTarget === fieldKey ? "..." : "AI"}
          </Button>
        )}
      </div>
    );
  }

  const expandedField = expandedSection
    ? boxFields.find((f) => f.key === expandedSection)
    : undefined;

  if (pdfOpen) {
    return (
      <FullPageDocumentViewer
        title={`${getNoteTypeLabel(note.type)} PDF`}
        url={`/api/patients/${patientId}/notes/${note.id}/pdf`}
        mimeType="application/pdf"
        onClose={() => setPdfOpen(false)}
        backLabel="Back to Note"
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex min-w-0 shrink-0 items-center gap-2 overflow-x-auto">
        <div className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
          <Button className="!h-8 !shrink-0 !text-xs" onClick={onBack}>
            <ArrowLeft size={14} /> {backLabel}
          </Button>
          <span className="shrink-0 text-sm font-semibold text-cyan-200">
            {getNoteTypeLabel(note.type)}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              !isSigned
                ? "bg-rose-500/15 text-rose-300"
                : isRevised
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-emerald-500/15 text-emerald-300"
            )}
          >
            {statusLabel}
          </span>
          <Button
            className={cn(
              "!h-7 !px-2 !text-[11px]",
              fitMode &&
                "!border-[color-mix(in_srgb,var(--warning)_50%,transparent)] !bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] !text-[var(--pv-fg)] hover:!bg-[color-mix(in_srgb,var(--warning)_26%,transparent)]"
            )}
            title={
              fitMode
                ? "Turn off fit — note scrolls as usual"
                : "Fit every section on this screen"
            }
            onClick={() => {
              setFitMode((on) => {
                const next = !on;
                persistNoteFitMode(next, userId);
                api("/api/me/chart-ui", {
                  method: "PATCH",
                  json: { noteFit: next },
                }).catch(() => undefined);
                return next;
              });
            }}
          >
            <Maximize2 size={12} className={cn(fitMode && "rotate-45")} />
            Fit
          </Button>
          {!readOnly ? (
            <Input
              type="date"
              className="!h-8 w-[9.5rem] !max-w-none shrink-0 !px-2 !text-xs"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                dateRef.current = e.target.value;
                setDirty(true);
                debouncedPersist();
              }}
            />
          ) : (
            <span className="shrink-0 text-xs text-[var(--pv-muted)]">{formatDate(note.date)}</span>
          )}
          <span className="min-w-0 truncate text-xs text-[var(--pv-muted)]">
            {getNoteAuthorLabel(note)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <AutoSaveStatus saving={saving} dirty={dirty} />
          {!isSigned && canDeleteNote && !isReadOnly && (
            <Button
              variant="danger"
              className="!h-8 !text-xs"
              disabled={signing}
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 size={14} /> Delete Note
            </Button>
          )}
          {!readOnly && !isSigned && (
            <Button variant="success" className="!h-8 !text-xs" disabled={signing} onClick={signNote}>
              <PenLine size={14} /> Sign Note
            </Button>
          )}
        </div>
      </div>

      {isSigned && !readOnly && (
        <p className="shrink-0 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200/90">
          This note is signed. Saving changes will mark it as Revised and keep a history of each edit.
        </p>
      )}

      <div
        ref={fitBodyRef}
        className={cn(
          "min-h-0 flex-1 pr-1",
          fitMode ? "flex flex-col gap-0 overflow-hidden" : "space-y-4 overflow-y-auto"
        )}
      >
        {showVitals && (
          <section
            className={cn(
              "rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel)]",
              fitMode && "shrink-0",
              isNotePanelCollapsed(collapsedPanels, "vitals")
                ? "px-2.5 py-2"
                : fitMode
                  ? "p-1.5"
                  : "p-2.5"
            )}
          >
            {isNotePanelCollapsed(collapsedPanels, "vitals") ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => togglePanel("vitals")}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pv-muted)]">
                    Vitals
                  </span>
                  <span className="truncate text-[10px] text-[var(--pv-muted-2)]">Collapsed</span>
                </button>
                <Button
                  className="!h-7 !px-2 !text-[11px] !border-[color-mix(in_srgb,var(--pv-accent-strong)_45%,transparent)] !bg-[color-mix(in_srgb,var(--pv-accent-strong)_12%,transparent)] !text-[var(--pv-accent-strong)] hover:!bg-[color-mix(in_srgb,var(--pv-accent-strong)_20%,transparent)]"
                  title="Show vitals in the note"
                  onClick={() => togglePanel("vitals")}
                >
                  <ChevronDown size={12} /> Show
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <VitalsPanel
                  compact
                  hideTitle
                  sectionLabel="Vitals"
                  onCollapse={() => togglePanel("vitals")}
                  vitals={vitals}
                  readOnly={readOnly}
                  onChange={updateVitals}
                />
              </div>
            )}
          </section>
        )}

        {noteGroups.map((group, groupIndex) => {
          const gridCols =
            group.columns === 3
              ? "grid-cols-1 lg:grid-cols-3"
              : group.columns === 2
                ? "grid-cols-1 md:grid-cols-2"
                : "grid-cols-1";
          const nextGroup = noteGroups[groupIndex + 1];

          return (
            <Fragment key={group.id}>
            <section
              className={cn(
                "space-y-2",
                fitMode && "flex min-h-0 flex-col gap-0.5 space-y-0 overflow-hidden"
              )}
              style={
                fitMode
                  ? {
                      flexGrow: fitGroupGrow[group.id] ?? defaultFitGroupGrow(group.id),
                      flexShrink: 1,
                      flexBasis: 0,
                      minHeight: "5.75rem",
                    }
                  : undefined
              }
            >
              <div className={cn("flex items-center gap-3", fitMode && "shrink-0 gap-2")}>
                <h3 className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pv-muted)]">
                  {group.title}
                </h3>
                <div className="h-px flex-1 bg-[var(--pv-border)]" />
              </div>

              <div
                className={cn(
                  "grid gap-2.5",
                  gridCols,
                  fitMode && "min-h-0 flex-1 gap-1.5",
                  fitMode && group.columns !== 1 && "auto-rows-[minmax(5.75rem,1fr)]"
                )}
                style={
                  fitMode && group.columns === 1
                    ? { gridTemplateRows: fitStackedRowTemplate(group.fields, collapsedPanels) }
                    : undefined
                }
              >
                {group.fields.map((field) => {
                  const isFixed = Boolean(fixedSections[field.key]);
                  const collapsed = isNotePanelCollapsed(collapsedPanels, field.key);
                  const value = sections[field.key] ?? "";
                  const filled = Boolean(noteSectionToPlainText(value).trim());
                  const isCompactScroll =
                    field.key === "reviewOfSystems" || field.key === "physicalExam";
                  const isLargeScroll =
                    field.key === "assessment" || field.key === "plan" || field.key === "hpi";
                  const textMinHeight = isCompactScroll
                    ? "h-[6.5rem] max-h-[6.5rem] min-h-[6.5rem] overflow-y-auto"
                    : isLargeScroll
                      ? "h-[140px] max-h-[140px] min-h-[140px] overflow-y-auto"
                      : field.size === "lg"
                        ? "min-h-[140px]"
                        : field.size === "sm"
                          ? "min-h-[40px]"
                          : "min-h-[100px]";

                      return (
                    <div
                      key={field.key}
                      className={cn(
                        "relative flex flex-col rounded-lg border",
                        field.span === 2 && group.columns !== 1 && "md:col-span-2",
                        field.span === 3 && group.columns === 3 && "lg:col-span-3",
                        isFixed
                          ? "border-amber-500/40 bg-amber-500/5"
                          : "border-[var(--pv-border)] bg-[var(--pv-panel)]",
                        collapsed ? "px-2.5 py-2" : fitMode ? "h-full min-h-[5.75rem] overflow-hidden p-1.5" : "p-2.5",
                        fitMode && collapsed && "shrink-0"
                      )}
                    >
                      {collapsed ? (
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => togglePanel(field.key)}
                          >
                            <span className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 shrink-0 rounded-full",
                                  filled ? "bg-emerald-400" : "bg-[var(--pv-border)]"
                                )}
                              />
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300/90">
                                {field.label}
                              </span>
                              {isFixed && (
                                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
                                  Fixed
                                </span>
                              )}
                            </span>
                            <span
                              className={cn(
                                "mt-0.5 block truncate text-[10px]",
                                filled ? "text-[var(--pv-muted-2)]" : "italic text-[var(--pv-muted)]"
                              )}
                            >
                              {previewText(value)}
                            </span>
                          </button>
                          <Button
                            className="!h-7 !px-2 !text-[11px] !border-[color-mix(in_srgb,var(--pv-accent-strong)_45%,transparent)] !bg-[color-mix(in_srgb,var(--pv-accent-strong)_12%,transparent)] !text-[var(--pv-accent-strong)] hover:!bg-[color-mix(in_srgb,var(--pv-accent-strong)_20%,transparent)]"
                            title={`Show ${field.label} in the note`}
                            onClick={() => togglePanel(field.key)}
                          >
                            <ChevronDown size={12} /> Show
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div
                            className={cn(
                              "flex flex-wrap items-start justify-between gap-2",
                              fitMode ? "mb-0.5 shrink-0" : "mb-1.5"
                            )}
                          >
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300/90">
                              {field.label}
                              {isFixed && (
                                <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-amber-300">
                                  Fixed
                                </span>
                              )}
                            </label>
                            {renderSectionActions(field.key)}
                          </div>
                          {!readOnly && textToolbarKey === field.key && (
                            <div className={cn(fitMode && "shrink-0")}>
                              <NoteTextToolbar />
                            </div>
                          )}
                          <MixedNoteField
                            value={value}
                            onChange={(next) => updateSection(field.key, next)}
                            disabled={readOnly}
                            placeholder={field.placeholder}
                            className={cn(
                              fitMode
                                ? "min-h-[4.5rem] h-full flex-1 overflow-y-auto"
                                : textMinHeight,
                              isFixed && "border-amber-500/30"
                            )}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
            {fitMode && nextGroup && (
              <FitGroupResizeHandle
                onDelta={(dy) => resizeFitGroups(group.id, nextGroup.id, dy)}
              />
            )}
            </Fragment>
          );
        })}

        <div className={cn("flex justify-center", fitMode ? "shrink-0 py-0" : "pb-2 pt-1")}>
          <Button
            variant="primary"
            className={cn("!gap-2", fitMode ? "!h-7 !px-3 !py-1 !text-xs" : "!px-5 !py-2.5 !text-sm")}
            onClick={() => setPdfOpen(true)}
          >
            <FileText size={fitMode ? 14 : 16} /> View PDF
          </Button>
        </div>
      </div>

      <Modal
        open={!!expandedSection && !!expandedField}
        onClose={() => setExpandedSection(null)}
        title={expandedField?.label ?? "Section"}
        wide
        xl
      >
        {expandedSection && expandedField && (
          <div className="space-y-3">
            {!readOnly &&
              renderSectionActions(expandedSection, { includeExpand: false, includeCollapse: false })}
            {!readOnly && textToolbarKey === expandedSection && <NoteTextToolbar />}
            <MixedNoteField
              value={sections[expandedSection] ?? ""}
              onChange={(next) => updateSection(expandedSection, next)}
              disabled={readOnly}
              placeholder={expandedField.placeholder}
              className="min-h-[50vh] text-[12px]"
            />
            <div className="flex justify-end">
              <Button onClick={() => setExpandedSection(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={aiTarget !== null}
        onClose={() => {
          if (aiLoading) return;
          setAiTarget(null);
          setAiDraft("");
          setAiError("");
          setAiCopied(false);
        }}
        title={
          aiTarget === "plan"
            ? "AI Plan draft"
            : aiTarget === "hpi"
              ? "AI HPI draft"
              : "AI Assessment draft"
        }
        wide
      >
        <p className="mb-3 text-sm text-[var(--pv-muted)]">
          {aiTarget === "hpi"
            ? "Reviews the full chart (prior notes, forms, orders, PDFs) plus this visit’s HPI/CC. Major conflicts are noted in parentheses at the bottom. Transfer appends in the AI color."
            : aiTarget === "assessment"
              ? "Reviews the full chart (notes, forms, orders, PDFs) plus this visit’s HPI. Major conflicts are noted in parentheses at the bottom. Transfer appends in the AI color."
              : "Reviews the full chart (notes, forms, orders, PDFs) plus HPI/Assessment. Major conflicts are noted in parentheses at the bottom. Transfer appends in the AI color."}
        </p>
        {aiError && (
          <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {aiError}
          </p>
        )}
        {aiLoading ? (
          <p className="py-10 text-center text-sm text-cyan-300">
            Reviewing full chart and drafting with Bedrock...
          </p>
        ) : (
          <Textarea
            value={aiDraft}
            readOnly
            className="!min-h-[40vh] !text-sm leading-relaxed pv-ai-text"
            placeholder="AI draft will appear here..."
          />
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            className="!gap-1.5"
            disabled={aiLoading || !aiDraft.trim()}
            onClick={() => copyAiDraft()}
          >
            {aiCopied ? <Check size={14} /> : <Copy size={14} />}
            {aiCopied ? "Copied" : "Copy"}
          </Button>
          <Button
            className="!gap-1.5 pv-ai-btn"
            disabled={aiLoading || readOnly || !aiDraft.trim()}
            onClick={() => transferAiDraft()}
            title={
              aiTarget === "plan"
                ? "Append this draft to Plan in the AI color"
                : aiTarget === "hpi"
                  ? "Append this draft to HPI in the AI color"
                  : "Append this draft to Assessment in the AI color"
            }
          >
            <ArrowRightFromLine size={14} />
            Transfer
          </Button>
          <Button
            variant="ghost"
            disabled={aiLoading}
            onClick={() => {
              setAiTarget(null);
              setAiDraft("");
              setAiError("");
              setAiCopied(false);
            }}
          >
            Close
          </Button>
        </div>
      </Modal>

      <AddDiagnosisModal
        open={dxModalOpen}
        onClose={() => setDxModalOpen(false)}
        currentDiagnosis={
          noteSectionToPlainText(sections.pastMedicalHistory ?? "").trim() ||
          diagnosisText
        }
        title="Add diagnosis to PMH"
        onAdd={async (nextDiagnosis, item) => {
          const res = await api<{ diagnosis: string }>(`/api/patients/${patientId}/diagnosis`, {
            method: "POST",
            json: {
              code: item.code,
              description: item.description,
              fromNoteId: note.id,
            },
          });
          updateSection("pastMedicalHistory", res.diagnosis || nextDiagnosis);
          await onPatientDataChange?.();
        }}
      />

      <DeleteReasonModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete draft note?"
        description="This permanently deletes the draft note and cannot be undone. Signed notes cannot be deleted. Provide a documented reason — this action is audit-logged."
        confirmLabel="Delete Note"
        onConfirm={deleteNote}
      />
    </div>
  );
}
