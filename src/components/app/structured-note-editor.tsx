"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getNoteAuthorLabel } from "@/lib/note-authors";
import { cn, formatDate, toDateInputValue } from "@/lib/utils";
import { AutoSaveStatus, useDebouncedCallback } from "@/lib/use-debounced-callback";
import { FullPageDocumentViewer } from "@/components/app/full-page-document-viewer";
import { DeleteReasonModal } from "@/components/app/delete-reason-modal";
import {
  isNotePanelCollapsed,
  loadCollapsedNotePanels,
  toggleNotePanelCollapsed,
  type CollapsibleNotePanelKey,
} from "@/lib/note-section-layout";
import {
  ArrowDownToLine,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Expand,
  FileText,
  PenLine,
  Pin,
  Trash2,
} from "lucide-react";

export type StructuredNoteData = {
  id: string;
  type: NoteType;
  status: "DRAFT" | "SIGNED";
  date: string;
  content: string;
  signedAt?: string | null;
  encounterId?: string | null;
  authorName?: string | null;
  signedByName?: string | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
  signedBy?: { id: string; name: string | null; email: string } | null;
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
        size: "lg",
        span: 1,
      },
      {
        key: "physicalExam",
        label: "Physical Exam",
        placeholder: "Exam findings...",
        size: "lg",
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
        placeholder: "Clinical assessment...",
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

export function StructuredNoteEditor({
  patientId,
  note,
  chartInsertData,
  patientDiagnosis,
  isReadOnly,
  canDeleteNote = false,
  onBack,
  onSaved,
  onSigned,
  onDeleted,
  backLabel = "Back to Encounter",
}: {
  patientId: string;
  note: StructuredNoteData;
  chartInsertData: PatientChartInsertSnapshot;
  patientDiagnosis?: string | null;
  isReadOnly: boolean;
  canDeleteNote?: boolean;
  onBack: () => void;
  onSaved: () => Promise<void>;
  onSigned: () => Promise<void>;
  onDeleted?: () => Promise<void> | void;
  backLabel?: string;
}) {
  const initial = parseNotePayload(note.type, note.content);
  const noteGroups = useMemo(() => getNoteGroups(note.type), [note.type]);
  const boxFields = useMemo(() => flattenGroupFields(noteGroups), [noteGroups]);
  const showVitals = usesStructuredNote(note.type);
  const [sections, setSections] = useState<NoteSections>(() => initial.sections);
  const [vitals, setVitals] = useState<VitalsData>(() => initial.vitals);
  const [date, setDate] = useState(toDateInputValue(note.date));
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
  const [collapsedPanels, setCollapsedPanels] = useState<Set<CollapsibleNotePanelKey>>(
    () => new Set()
  );
  const isSigned = note.status === "SIGNED";
  const readOnly = isReadOnly || isSigned;
  const sectionsRef = useRef(sections);
  const vitalsRef = useRef(vitals);
  const dateRef = useRef(date);
  const diagnosisText = (patientDiagnosis ?? chartInsertData.diagnosis ?? "").trim();
  const hasDiagnosis = Boolean(diagnosisText);

  useEffect(() => {
    setCollapsedPanels(loadCollapsedNotePanels());
  }, []);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  useEffect(() => {
    vitalsRef.current = vitals;
  }, [vitals]);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  function togglePanel(key: CollapsibleNotePanelKey) {
    setCollapsedPanels((prev) => toggleNotePanelCollapsed(prev, key));
  }

  function previewText(value: string | undefined) {
    const trimmed = value?.trim() ?? "";
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
      const current = sections[key]?.trim() ?? "";
      updateSection(key, current ? `${current}\n\n${chartText}` : chartText);
    } finally {
      setInsertingKey(null);
    }
  }

  function insertDiagnosis() {
    if (readOnly || !hasDiagnosis) return;
    setInsertingDiagnosis(true);
    try {
      const current = sections.assessment?.trim() ?? "";
      updateSection("assessment", current ? `${current}\n\n${diagnosisText}` : diagnosisText);
    } finally {
      setInsertingDiagnosis(false);
    }
  }

  async function signNote() {
    if (readOnly) return;
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

    return (
      <div className="flex flex-wrap items-center gap-1">
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
              isFixed && "!border-amber-500/50 !bg-amber-500/20 !text-amber-200 hover:!bg-amber-500/30"
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
            className="!h-7 !px-2 !text-[11px]"
            title="Open section in a larger popup"
            onClick={() => setExpandedSection(fieldKey)}
          >
            <Expand size={12} /> Pop out
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button className="!text-xs" onClick={onBack}>
            <ArrowLeft size={14} /> {backLabel}
          </Button>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              isSigned ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
            )}
          >
            {isSigned ? "Signed" : "Draft"}
          </span>
          <span className="text-sm font-semibold text-cyan-200">{getNoteTypeLabel(note.type)}</span>
          <span className="text-xs text-[var(--pv-muted)]">
            {formatDate(note.date)} · {getNoteAuthorLabel(note)}
          </span>
          {!readOnly && (
            <Input
              type="date"
              className="max-w-[150px] !h-8 !text-xs"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                dateRef.current = e.target.value;
                setDirty(true);
                debouncedPersist();
              }}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoSaveStatus saving={saving} dirty={dirty} />
          {!isSigned && canDeleteNote && !isReadOnly && (
            <Button
              variant="danger"
              className="!text-xs"
              disabled={signing}
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 size={14} /> Delete Note
            </Button>
          )}
          {!readOnly && (
            <Button variant="success" className="!text-xs" disabled={signing} onClick={signNote}>
              <PenLine size={14} /> Sign Note
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {showVitals && (
          <section
            className={cn(
              "rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel)]",
              isNotePanelCollapsed(collapsedPanels, "vitals") ? "px-2.5 py-2" : "p-2.5"
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pv-muted)]">
                    Vitals
                  </h3>
                  <Button
                    className="!h-7 !px-2 !text-[11px] !border-[color-mix(in_srgb,var(--pv-accent-strong)_45%,transparent)] !bg-[color-mix(in_srgb,var(--pv-accent-strong)_12%,transparent)] !text-[var(--pv-accent-strong)] hover:!bg-[color-mix(in_srgb,var(--pv-accent-strong)_20%,transparent)]"
                    title="Collapse vitals in the note"
                    onClick={() => togglePanel("vitals")}
                  >
                    <ChevronUp size={12} /> Collapse
                  </Button>
                </div>
                <VitalsPanel compact vitals={vitals} readOnly={readOnly} onChange={updateVitals} />
              </div>
            )}
          </section>
        )}

        {noteGroups.map((group) => {
          const gridCols =
            group.columns === 3
              ? "grid-cols-1 lg:grid-cols-3"
              : group.columns === 2
                ? "grid-cols-1 md:grid-cols-2"
                : "grid-cols-1";

          return (
            <section key={group.id} className="space-y-2">
              <div className="flex items-center gap-3">
                <h3 className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pv-muted)]">
                  {group.title}
                </h3>
                <div className="h-px flex-1 bg-[var(--pv-border)]" />
              </div>

              <div className={cn("grid gap-2.5", gridCols)}>
                {group.fields.map((field) => {
                  const isFixed = Boolean(fixedSections[field.key]);
                  const collapsed = isNotePanelCollapsed(collapsedPanels, field.key);
                  const value = sections[field.key] ?? "";
                  const filled = Boolean(value.trim());
                  const textMinHeight =
                    field.size === "lg" ? "min-h-[140px]" : field.size === "sm" ? "min-h-[40px]" : "min-h-[100px]";

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
                        collapsed ? "px-2.5 py-2" : "p-2.5"
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
                          <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
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
                          {field.size === "sm" ? (
                            <Input
                              value={value}
                              onChange={(e) => updateSection(field.key, e.target.value)}
                              disabled={readOnly}
                              placeholder={field.placeholder}
                              className="!text-[12px]"
                            />
                          ) : (
                            <Textarea
                              className={cn(
                                "resize-y font-mono text-[12px] leading-relaxed",
                                textMinHeight,
                                isFixed && "border-amber-500/30"
                              )}
                              value={value}
                              onChange={(e) => updateSection(field.key, e.target.value)}
                              disabled={readOnly}
                              placeholder={field.placeholder}
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <div className="flex justify-center pb-2 pt-1">
          <Button
            variant="primary"
            className="!gap-2 !px-5 !py-2.5 !text-sm"
            onClick={() => setPdfOpen(true)}
          >
            <FileText size={16} /> View PDF
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
            <Textarea
              className="min-h-[50vh] font-mono text-[12px]"
              value={sections[expandedSection] ?? ""}
              onChange={(e) => updateSection(expandedSection, e.target.value)}
              disabled={readOnly}
              placeholder={expandedField.placeholder}
              autoFocus
            />
            <div className="flex justify-end">
              <Button onClick={() => setExpandedSection(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

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
