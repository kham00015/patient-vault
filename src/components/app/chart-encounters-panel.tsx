"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteReasonModal } from "@/components/app/delete-reason-modal";
import { StructuredNoteEditor, type StructuredNoteData } from "@/components/app/structured-note-editor";
import { FormsBranchPanel } from "@/components/app/forms-branch-panel";
import { CommsBranchPanel } from "@/components/app/comms-branch-panel";
import { OrdersPanel } from "@/components/app/orders-panel";
import { SendFaxModal } from "@/components/app/send-fax-modal";
import { FullPageDocumentViewer } from "@/components/app/full-page-document-viewer";
import { ScanDocumentButton } from "@/components/app/document-scan-modal";
import type { EncounterFormData } from "@/components/app/clinical-form-editor";
import type { FaxTransmissionDTO } from "@/lib/fax-transmissions";
import type { OrderDTO } from "@/lib/orders";
import {
  ENCOUNTER_MODALITIES,
  VISIT_CATEGORIES,
  getDefaultNoteTypeForEncounter,
  getEncounterModalityLabel,
  getVisitCategoryLabel,
  getVisitCategoryTimelineStyles,
  type EncounterModality,
  type VisitCategory,
} from "@/lib/encounters";
import { getNoteTypeLabel, NOTE_TYPES, type NoteType } from "@/lib/notes";
import { getNoteAuthorLabel, getNoteStatusLabel } from "@/lib/note-authors";
import type { PatientChartInsertSnapshot } from "@/lib/note-chart-map";
import type { ChartNavigationIntent } from "@/lib/chart-navigation";
import { cn, formatDate, formatClinicDateOnly, toClinicDateInputValue } from "@/lib/utils";
import { AutoSaveStatus, useDebouncedCallback } from "@/lib/use-debounced-callback";
import { Calendar, ChevronDown, ChevronRight, ClipboardCheck, ClipboardList, FileText, Lock, Paperclip, Pill, Plus, Printer, Trash2 } from "lucide-react";

type EncounterSummary = {
  id: string;
  visitCategory: VisitCategory;
  modality: EncounterModality;
  status: string;
  date: string;
  chiefComplaint?: string | null;
  providerName?: string | null;
  noteCount: number;
  documentCount: number;
  formCount: number;
  faxCount: number;
  orderCount: number;
  deletable?: boolean;
  createdAt: string;
  updatedAt: string;
};

type EncounterNote = StructuredNoteData;

type EncounterDocument = {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
};

type EncounterDetail = EncounterSummary & {
  notes: EncounterNote[];
  documents: EncounterDocument[];
  forms: EncounterFormData[];
  faxes: FaxTransmissionDTO[];
  orders: OrderDTO[];
};

type EncounterBranch = "notes" | "forms" | "orders" | "attachments" | "comms" | "prescriptions";

function formatEncounterTimelineDate(iso: string) {
  const d = new Date(iso);
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase()
    .replace(",", "");
}

export function ChartEncountersPanel({
  patientId,
  userId,
  officeCode,
  chartInsertData,
  patientDiagnosis,
  patientDisplayName,
  patientFirstName,
  patientLastName,
  patientDateOfBirth,
  patientMrn,
  isReadOnly,
  canRemoveRecords,
  navigationIntent,
  onNavigationComplete,
  onPatientDataChange,
  dataRevision = 0,
  onDataChange,
}: {
  patientId: string;
  userId: string;
  officeCode?: string | null;
  chartInsertData: PatientChartInsertSnapshot;
  patientDiagnosis?: string | null;
  patientDisplayName?: string | null;
  patientFirstName?: string | null;
  patientLastName?: string | null;
  patientDateOfBirth?: string | Date | null;
  patientMrn?: string | null;
  isReadOnly: boolean;
  canRemoveRecords: boolean;
  navigationIntent?: ChartNavigationIntent | null;
  onNavigationComplete?: () => void;
  onPatientDataChange?: () => Promise<void>;
  /** Bumped by Documents (or other tabs) when chart content changes so forms stay in sync. */
  dataRevision?: number;
  onDataChange?: () => void;
}) {
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [details, setDetails] = useState<Record<string, EncounterDetail>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeBranch, setActiveBranch] = useState<{ encounterId: string; branch: EncounterBranch } | null>(null);
  const [activeNote, setActiveNote] = useState<EncounterNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickingEncounter, setPickingEncounter] = useState(false);
  const [selectedVisitCategory, setSelectedVisitCategory] = useState<VisitCategory | null>(null);
  const [pickingNoteTypeFor, setPickingNoteTypeFor] = useState<string | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [faxModal, setFaxModal] = useState<{
    encounterId: string;
    documentId?: string;
    toNumber?: string;
    toName?: string;
  } | null>(null);
  const [deleteEncounterId, setDeleteEncounterId] = useState<string | null>(null);
  const navigationHandledRef = useRef(false);

  const loadEncounters = useCallback(async () => {
    const data = await api<{ encounters: EncounterSummary[] }>(`/api/patients/${patientId}/encounters`);
    setEncounters(data.encounters);
    setLoadError("");
  }, [patientId]);

  const loadDetail = useCallback(
    async (encounterId: string) => {
      setLoadingDetailId(encounterId);
      try {
        const data = await api<{ encounter: EncounterDetail }>(
          `/api/patients/${patientId}/encounters/${encounterId}`
        );
        setDetails((prev) => ({ ...prev, [encounterId]: data.encounter }));
        return data.encounter;
      } finally {
        setLoadingDetailId(null);
      }
    },
    [patientId]
  );

  useEffect(() => {
    setLoading(true);
    loadEncounters()
      .catch(() => setLoadError("Could not load encounters. Try refreshing the page."))
      .finally(() => setLoading(false));
  }, [loadEncounters]);

  useEffect(() => {
    if (!dataRevision) return;
    void (async () => {
      try {
        await loadEncounters();
        if (expandedId) await loadDetail(expandedId);
      } catch {
        /* keep existing UI */
      }
    })();
  }, [dataRevision, loadEncounters, loadDetail, expandedId]);

  useEffect(() => {
    navigationHandledRef.current = false;
  }, [patientId, navigationIntent]);

  useEffect(() => {
    if (loading || navigationHandledRef.current) return;

    // Open a specific encounter (unsigned-notes alert, deep link, etc.)
    if (navigationIntent?.encounterId) {
      async function navigateToEncounter() {
        const encounterId = navigationIntent!.encounterId!;
        const exists = encounters.some((e) => e.id === encounterId);
        if (!exists) {
          onNavigationComplete?.();
          return;
        }
        navigationHandledRef.current = true;
        const detail = await ensureEncounterOpen(encounterId);
        if (navigationIntent!.openNotesBranch) {
          setActiveBranch({ encounterId, branch: "notes" });
        }
        if (navigationIntent!.openNote) {
          await openPrimaryNote(encounterId, detail, navigationIntent!.noteId);
        }
        onNavigationComplete?.();
      }
      navigateToEncounter().catch(() => onNavigationComplete?.());
      return;
    }

    if (!navigationIntent?.fromSchedule) return;

    async function navigateFromSchedule() {
      const targetDate = navigationIntent!.scheduleDate;
      if (!targetDate) {
        onNavigationComplete?.();
        return;
      }
      const sameDay = encounters.filter((e) => toClinicDateInputValue(e.date) === targetDate);
      if (sameDay.length === 0) {
        onNavigationComplete?.();
        return;
      }

      const encounter =
        (navigationIntent!.visitCategory
          ? sameDay.find((e) => e.visitCategory === navigationIntent!.visitCategory)
          : undefined) ?? sameDay[0];
      if (!encounter) {
        onNavigationComplete?.();
        return;
      }

      navigationHandledRef.current = true;
      const detail = await ensureEncounterOpen(encounter.id);
      await openPrimaryNote(encounter.id, detail);
      onNavigationComplete?.();
    }

    navigateFromSchedule().catch(() => onNavigationComplete?.());
  }, [navigationIntent, loading, encounters, onNavigationComplete]);

  async function ensureEncounterOpen(encounterId: string): Promise<EncounterDetail> {
    setExpandedId(encounterId);
    if (details[encounterId]) return details[encounterId];
    return loadDetail(encounterId);
  }

  async function createNoteForEncounter(
    encounterId: string,
    type: NoteType,
    encounterDate?: string
  ): Promise<EncounterNote> {
    const data = await api<{ note: EncounterNote }>(`/api/patients/${patientId}/notes`, {
      method: "POST",
      json: {
        date: encounterDate ? toClinicDateInputValue(encounterDate) : toClinicDateInputValue(new Date()),
        type,
        encounterId,
      },
    });
    return data.note;
  }

  async function openPrimaryNote(
    encounterId: string,
    detail?: EncounterDetail,
    preferredNoteId?: string | null
  ) {
    const enc = detail ?? (await ensureEncounterOpen(encounterId));
    setActiveBranch({ encounterId, branch: "notes" });

    let note =
      (preferredNoteId
        ? enc.notes.find((n) => n.id === preferredNoteId)
        : undefined) ??
      enc.notes.find((n) => (n.status ?? "DRAFT") === "DRAFT") ??
      enc.notes[0];

    if (!note && !isReadOnly) {
      const noteType = getDefaultNoteTypeForEncounter(enc.visitCategory, enc.modality);
      note = await createNoteForEncounter(encounterId, noteType, enc.date);
      const refreshed = await loadDetail(encounterId);
      note = refreshed.notes.find((n) => n.id === note!.id) ?? note;
      await loadEncounters();
      await onPatientDataChange?.();
    }

    if (note) {
      setActiveNote(note);
    }
  }

  async function toggleExpand(encounterId: string) {
    if (expandedId === encounterId) {
      setExpandedId(null);
      setActiveBranch(null);
      setPickingNoteTypeFor(null);
      return;
    }
    setActiveNote(null);
    setActiveBranch(null);
    setPickingNoteTypeFor(null);
    await ensureEncounterOpen(encounterId);
  }

  async function openBranch(encounterId: string, branch: EncounterBranch) {
    if (activeBranch?.encounterId === encounterId && activeBranch.branch === branch) {
      setActiveBranch(null);
      setPickingNoteTypeFor(null);
      return;
    }
    await ensureEncounterOpen(encounterId);
    setActiveBranch({ encounterId, branch });
    setPickingNoteTypeFor(null);
  }

  async function createEncounter(visitCategory: VisitCategory, modality: EncounterModality) {
    const data = await api<{ encounter: EncounterSummary }>(`/api/patients/${patientId}/encounters`, {
      method: "POST",
      json: { visitCategory, modality, date: toClinicDateInputValue(new Date()) },
    });
    setPickingEncounter(false);
    setSelectedVisitCategory(null);
    await loadEncounters();
    setExpandedId(data.encounter.id);
    const detail = await loadDetail(data.encounter.id);
    const noteType = getDefaultNoteTypeForEncounter(visitCategory, modality);
    const note = await createNoteForEncounter(data.encounter.id, noteType, detail.date);
    await loadDetail(data.encounter.id);
    await loadEncounters();
    await onPatientDataChange?.();
    setActiveNote(note);
  }

  async function createNote(encounterId: string, type: NoteType) {
    const note = await createNoteForEncounter(encounterId, type);
    setPickingNoteTypeFor(null);
    await loadDetail(encounterId);
    await loadEncounters();
    await onPatientDataChange?.();
    setActiveNote(note);
  }

  async function refreshEncounter(encounterId: string) {
    const detail = await loadDetail(encounterId);
    await loadEncounters();
    if (activeNote) {
      const updated = detail.notes.find((n) => n.id === activeNote.id);
      if (updated) setActiveNote(updated);
    }
    await onPatientDataChange?.();
  }

  function openFaxModal(
    encounterId: string,
    documentId?: string,
    toNumber?: string,
    toName?: string
  ) {
    setFaxModal({ encounterId, documentId, toNumber, toName });
    setActiveBranch({ encounterId, branch: "comms" });
    setExpandedId(encounterId);
  }

  const faxModalEncounter = faxModal ? details[faxModal.encounterId] : null;

  async function deleteEncounter(encounterId: string, reason: string) {
    await api(`/api/patients/${patientId}/encounters/${encounterId}`, {
      method: "DELETE",
      json: { reason },
    });
    setDeleteEncounterId(null);
    if (expandedId === encounterId) {
      setExpandedId(null);
      setActiveBranch(null);
    }
    setDetails((prev) => {
      const next = { ...prev };
      delete next[encounterId];
      return next;
    });
    await loadEncounters();
    await onPatientDataChange?.();
  }

  async function updateEncounterDate(encounterId: string, date: string) {
    const data = await api<{ encounter: EncounterDetail }>(
      `/api/patients/${patientId}/encounters/${encounterId}`,
      { method: "PATCH", json: { date } }
    );
    setDetails((prev) => ({ ...prev, [encounterId]: data.encounter }));
    await loadEncounters();
    await onPatientDataChange?.();
  }

  if (activeNote) {
    return (
      <StructuredNoteEditor
        key={activeNote.id}
        patientId={patientId}
        userId={userId}
        note={activeNote}
        chartInsertData={chartInsertData}
        patientDiagnosis={patientDiagnosis}
        isReadOnly={isReadOnly}
        canDeleteNote={canRemoveRecords}
        onBack={() => {
          setActiveNote(null);
        }}
        onSaved={async () => {
          const encId = activeNote.encounterId ?? expandedId;
          if (encId) await refreshEncounter(encId);
        }}
        onSigned={async () => {
          const encId = activeNote.encounterId ?? expandedId;
          if (encId) await refreshEncounter(encId);
          await onPatientDataChange?.();
        }}
        onDeleted={async () => {
          const encId = activeNote.encounterId ?? expandedId;
          setActiveNote(null);
          if (encId) await refreshEncounter(encId);
          await onPatientDataChange?.();
        }}
        onPatientDataChange={onPatientDataChange}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="success"
          className="!text-xs"
          disabled={isReadOnly}
          onClick={() => {
            setPickingEncounter(true);
            setSelectedVisitCategory(null);
          }}
        >
          <Plus size={14} /> New Encounter
        </Button>
      </div>

      {pickingEncounter && (
        <div className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-cyan-200">
              {selectedVisitCategory ? "How was the visit conducted?" : "What kind of visit?"}
            </h3>
            <Button
              className="!text-xs"
              onClick={() => {
                if (selectedVisitCategory) {
                  setSelectedVisitCategory(null);
                } else {
                  setPickingEncounter(false);
                }
              }}
            >
              {selectedVisitCategory ? "Back" : "Cancel"}
            </Button>
          </div>
          {!selectedVisitCategory ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {VISIT_CATEGORIES.map((category) => {
                const styles = getVisitCategoryTimelineStyles(category.value);
                return (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => setSelectedVisitCategory(category.value)}
                  className={cn(
                    "rounded-xl border bg-[var(--pv-card)] px-4 py-3 text-left transition hover:bg-[var(--pv-btn)]",
                    styles.pickerBorder,
                    styles.pickerHoverBorder
                  )}
                >
                  <div className={cn("text-sm font-medium", styles.pickerTitle)}>{category.label}</div>
                  <div className="mt-1 text-xs text-[var(--pv-muted)]">{category.description}</div>
                </button>
              );
              })}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ENCOUNTER_MODALITIES.map((modality) => {
                const styles = getVisitCategoryTimelineStyles(selectedVisitCategory);
                return (
                <button
                  key={modality.value}
                  type="button"
                  onClick={() => createEncounter(selectedVisitCategory, modality.value)}
                  className={cn(
                    "rounded-xl border bg-[var(--pv-card)] px-4 py-3 text-left transition hover:bg-[var(--pv-btn)]",
                    styles.pickerBorder,
                    styles.pickerHoverBorder
                  )}
                >
                  <div className={cn("text-sm font-medium", styles.pickerTitle)}>{modality.label}</div>
                  <div className="mt-1 text-xs text-[var(--pv-muted)]">{modality.description}</div>
                </button>
              );
              })}
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-sm text-[var(--pv-muted)]">Loading encounters...</p>}
      {!loading && loadError && (
        <p className="text-sm text-rose-300">{loadError}</p>
      )}
      {!loading && !loadError && encounters.length === 0 && !pickingEncounter && (
        <p className="text-sm text-[var(--pv-muted)]">No encounters yet. Create one to document a clinic visit.</p>
      )}

      <div className="relative pl-6">
        <div className="absolute bottom-2 left-[11px] top-2 w-px bg-[var(--pv-border-strong)]/80" />

        <div className="space-y-1">
          {encounters.map((enc) => {
            const isExpanded = expandedId === enc.id;
            const detail = details[enc.id];
            const isLoadingDetail = loadingDetailId === enc.id;
            const branchOpen = activeBranch?.encounterId === enc.id ? activeBranch.branch : null;
            const styles = getVisitCategoryTimelineStyles(enc.visitCategory);

            return (
              <div key={enc.id} className="relative">
                <div
                  className={cn(
                    "absolute -left-6 top-3.5 z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 bg-[var(--pv-bg-deep)]",
                    styles.dotBorder,
                    styles.dotBg
                  )}
                >
                  <Calendar size={11} className={styles.dotIcon} />
                </div>

                <div
                  className={cn(
                    "rounded-lg border transition",
                    styles.cardBg,
                    isExpanded ? styles.cardBorderExpanded : cn(styles.cardBorder, styles.cardBorderHover)
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(enc.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpand(enc.id);
                      }
                    }}
                    className="flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left"
                  >
                    <span className="mt-0.5 text-[var(--pv-muted)]">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={cn("text-xs font-bold tracking-wide", styles.dateText)}>
                          {formatEncounterTimelineDate(enc.date)}
                        </span>
                        <span className="text-[#4a5568]">|</span>
                        <span className={cn("text-xs font-semibold uppercase tracking-wide", styles.categoryText)}>
                          {getVisitCategoryLabel(enc.visitCategory)}
                        </span>
                        <span className={cn("text-xs uppercase tracking-wide", styles.modalityText)}>
                          · {getEncounterModalityLabel(enc.modality)}
                        </span>
                      </div>
                      {enc.chiefComplaint && (
                        <div className="mt-0.5 truncate text-[11px] text-[var(--pv-muted-2)]">{enc.chiefComplaint}</div>
                      )}
                    </div>
                    {!isReadOnly && enc.deletable && (
                      <Button
                        variant="danger"
                        className="!h-7 !px-2 !text-[10px] shrink-0"
                        title="Delete unsigned encounter"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteEncounterId(enc.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[var(--pv-border)]/80 px-3 pb-2 pt-1.5">
                      {isLoadingDetail && !detail && (
                        <p className="py-2 text-xs text-[var(--pv-muted)]">Loading...</p>
                      )}

                      {detail && (
                        <>
                          <EncounterDateRow
                            visitDate={detail.date}
                            createdAt={detail.createdAt}
                            isReadOnly={isReadOnly}
                            canDelete={enc.deletable === true}
                            onDelete={() => setDeleteEncounterId(enc.id)}
                            onDateChange={(date) => updateEncounterDate(enc.id, date)}
                          />

                          <div className="flex flex-wrap items-center gap-1 py-1">
                            <EncounterBranchCircle
                              icon={ClipboardList}
                              label="Notes"
                              count={detail.notes.length}
                              active={branchOpen === "notes"}
                              ringClass="border-amber-400/70 bg-amber-500/10 text-amber-300"
                              activeRingClass="ring-amber-400/50"
                              onClick={() => openBranch(enc.id, "notes")}
                            />
                            <EncounterBranchCircle
                              icon={FileText}
                              label="Forms"
                              count={detail.forms.length}
                              active={branchOpen === "forms"}
                              ringClass="border-sky-400/70 bg-sky-500/10 text-sky-300"
                              activeRingClass="ring-sky-400/50"
                              onClick={() => openBranch(enc.id, "forms")}
                            />
                            <EncounterBranchCircle
                              icon={ClipboardCheck}
                              label="Orders"
                              count={detail.orders?.length ?? 0}
                              active={branchOpen === "orders"}
                              ringClass="border-emerald-400/70 bg-emerald-500/10 text-emerald-300"
                              activeRingClass="ring-emerald-400/50"
                              onClick={() => openBranch(enc.id, "orders")}
                            />
                            <EncounterBranchCircle
                              icon={Paperclip}
                              label="Files"
                              count={detail.documents.length}
                              active={branchOpen === "attachments"}
                              ringClass="border-violet-400/70 bg-violet-500/10 text-violet-300"
                              activeRingClass="ring-violet-400/50"
                              onClick={() => openBranch(enc.id, "attachments")}
                            />
                            <EncounterBranchCircle
                              icon={Printer}
                              label="Comms"
                              count={detail.faxes?.length ?? 0}
                              active={branchOpen === "comms"}
                              ringClass="border-teal-400/70 bg-teal-500/10 text-teal-300"
                              activeRingClass="ring-teal-400/50"
                              onClick={() => openBranch(enc.id, "comms")}
                            />
                            <EncounterBranchCircle
                              icon={Pill}
                              label="Rx"
                              count={0}
                              active={branchOpen === "prescriptions"}
                              ringClass="border-orange-400/70 bg-orange-500/10 text-orange-300"
                              activeRingClass="ring-orange-400/50"
                              onClick={() => openBranch(enc.id, "prescriptions")}
                            />
                          </div>

                          {branchOpen === "notes" && (
                            <NotesBranchPanel
                              notes={detail.notes}
                              pickingNoteType={pickingNoteTypeFor === enc.id}
                              isReadOnly={isReadOnly}
                              onStartNote={() => setPickingNoteTypeFor(enc.id)}
                              onCancelPicker={() => setPickingNoteTypeFor(null)}
                              onPickType={(type) => createNote(enc.id, type)}
                              onOpenNote={(note) => {
                                setActiveNote(note);
                              }}
                            />
                          )}

                          {branchOpen === "forms" && (
                            <FormsBranchPanel
                              patientId={patientId}
                              encounterId={enc.id}
                              encounterDate={toClinicDateInputValue(enc.date)}
                              forms={detail.forms}
                              isReadOnly={isReadOnly}
                              officeCode={officeCode}
                              patientName={
                                patientDisplayName
                                  ? {
                                      displayName: patientDisplayName,
                                      firstName: patientFirstName,
                                      lastName: patientLastName,
                                      mrn: patientMrn,
                                      dateOfBirth: patientDateOfBirth,
                                    }
                                  : null
                              }
                              onRefresh={async () => {
                                await refreshEncounter(enc.id);
                                onDataChange?.();
                              }}
                            />
                          )}

                          {branchOpen === "orders" && (
                            <OrdersPanel
                              patientId={patientId}
                              encounterId={enc.id}
                              initialOrders={detail.orders ?? []}
                              isReadOnly={isReadOnly}
                              canRemoveRecords={canRemoveRecords}
                              compact
                              onMutate={() => refreshEncounter(enc.id)}
                            />
                          )}

                          {branchOpen === "attachments" && (
                            <AttachmentsBranchPanel
                              patientId={patientId}
                              encounterId={enc.id}
                              documents={detail.documents}
                              isReadOnly={isReadOnly}
                              canRemoveRecords={canRemoveRecords}
                              onRefresh={() => refreshEncounter(enc.id)}
                              onSendFax={(documentId) => openFaxModal(enc.id, documentId)}
                            />
                          )}

                          {branchOpen === "comms" && (
                            <CommsBranchPanel
                              patientId={patientId}
                              faxes={detail.faxes ?? []}
                              documents={detail.documents}
                              isReadOnly={isReadOnly}
                              onSendFax={(documentId) => openFaxModal(enc.id, documentId)}
                            />
                          )}

                          {branchOpen === "prescriptions" && (
                            <div className="mt-1.5 rounded-md border border-dashed border-[var(--pv-border)] bg-[var(--pv-card)]/60 px-3 py-2.5">
                              <p className="text-xs text-[var(--pv-muted-2)]">
                                Prescription branch — e-prescribing coming soon.
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {faxModal && (
        <SendFaxModal
          open
          onClose={() => setFaxModal(null)}
          patientId={patientId}
          encounterId={faxModal.encounterId}
          documents={faxModalEncounter?.documents ?? []}
          initialDocumentId={faxModal.documentId}
          initialToNumber={faxModal.toNumber}
          initialToName={faxModal.toName}
          onSent={async () => {
            await refreshEncounter(faxModal.encounterId);
            setFaxModal(null);
          }}
        />
      )}

      <DeleteReasonModal
        open={!!deleteEncounterId}
        onClose={() => setDeleteEncounterId(null)}
        title="Delete Encounter"
        description="Only unsigned draft encounters can be removed. This permanently deletes draft notes, forms, and attachments on this visit. The action is audit-logged — provide a reason."
        confirmLabel="Delete Encounter"
        onConfirm={async (reason) => {
          if (!deleteEncounterId) return;
          await deleteEncounter(deleteEncounterId, reason);
        }}
      />
    </div>
  );
}

function EncounterDateRow({
  visitDate,
  createdAt,
  isReadOnly,
  canDelete,
  onDelete,
  onDateChange,
}: {
  visitDate: string;
  createdAt: string;
  isReadOnly: boolean;
  canDelete?: boolean;
  onDelete?: () => void;
  onDateChange: (date: string) => Promise<void>;
}) {
  const [date, setDate] = useState(() => toClinicDateInputValue(visitDate));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savedDateRef = useRef(toClinicDateInputValue(visitDate));

  useEffect(() => {
    const next = toClinicDateInputValue(visitDate);
    savedDateRef.current = next;
    setDate(next);
    setDirty(false);
  }, [visitDate]);

  const persist = useCallback(
    async (next: string) => {
      if (isReadOnly || next === savedDateRef.current) return;
      setSaving(true);
      try {
        await onDateChange(next);
        savedDateRef.current = next;
        setDirty(false);
      } finally {
        setSaving(false);
      }
    },
    [isReadOnly, onDateChange]
  );

  const { debounced: debouncedPersist } = useDebouncedCallback(persist, 600);

  const visitDiffersFromCreated =
    toClinicDateInputValue(visitDate) !== toClinicDateInputValue(createdAt);

  return (
    <div className="mb-1.5 rounded-md border border-[var(--pv-border)] bg-[var(--pv-card)]/60 px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--pv-muted)]">
            Visit date
          </span>
          {isReadOnly ? (
            <span className="text-xs text-cyan-200">{formatDate(visitDate)}</span>
          ) : (
            <Input
              type="date"
              className="!h-7 max-w-[150px] !text-xs"
              value={date}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                setDate(e.target.value);
                setDirty(true);
                debouncedPersist(e.target.value);
              }}
            />
          )}
          {!isReadOnly && <AutoSaveStatus saving={saving} dirty={dirty} />}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--pv-muted)]">
          {canDelete && !isReadOnly && onDelete && (
            <Button
              variant="danger"
              className="!h-7 !px-2.5 !text-[10px] mr-1"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 size={12} className="mr-1" /> Delete
            </Button>
          )}
          <Lock size={11} className="shrink-0 text-[#4a5568]" />
          <span>
            Chart created{" "}
            <span className="text-[var(--pv-muted-2)]">{formatDate(createdAt)}</span>
          </span>
        </div>
      </div>
      {visitDiffersFromCreated && (
        <p className="mt-1.5 text-[10px] text-amber-300/80">
          Visit date differs from chart creation time — original timestamp preserved for audit.
        </p>
      )}
    </div>
  );
}

function EncounterBranchCircle({
  icon: Icon,
  label,
  count,
  active,
  ringClass,
  activeRingClass,
  onClick,
}: {
  icon: typeof ClipboardList;
  label: string;
  count: number;
  active: boolean;
  ringClass: string;
  activeRingClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-[var(--pv-btn)]"
      title={`${label}${count > 0 ? ` (${count})` : ""}`}
    >
      <div
        className={cn(
          "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition",
          ringClass,
          active && cn("ring-2", activeRingClass)
        )}
      >
        <Icon size={14} />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-cyan-500 px-1 text-[9px] font-bold leading-none text-white shadow">
            {count}
          </span>
        )}
      </div>
      <span
        className={cn(
          "text-[10px] font-medium uppercase tracking-wide",
          active ? "text-cyan-200" : "text-[var(--pv-muted)] group-hover:text-[var(--pv-muted-2)]"
        )}
      >
        {label}
      </span>
    </button>
  );
}

function NotesBranchPanel({
  notes,
  pickingNoteType,
  isReadOnly,
  onStartNote,
  onCancelPicker,
  onPickType,
  onOpenNote,
}: {
  notes: EncounterNote[];
  pickingNoteType: boolean;
  isReadOnly: boolean;
  onStartNote: () => void;
  onCancelPicker: () => void;
  onPickType: (type: NoteType) => void;
  onOpenNote: (note: EncounterNote) => void;
}) {
  return (
    <div className="mt-1.5 rounded-md border border-[var(--pv-border)] bg-[var(--pv-card)]/80 p-2">
      {!isReadOnly && !pickingNoteType && (
        <div className="mb-2 flex justify-end">
          <Button variant="success" className="!h-7 !text-[10px]" onClick={onStartNote}>
            <Plus size={12} /> Create Note
          </Button>
        </div>
      )}

      {pickingNoteType && (
        <div className={cn("border-[var(--pv-border)] pb-2", notes.length > 0 && "mb-2 border-b")}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-cyan-200">Choose note type</span>
            <Button className="!h-6 !px-2 !text-[10px]" onClick={onCancelPicker}>
              Cancel
            </Button>
          </div>
          <div className="grid gap-1 sm:grid-cols-2">
            {NOTE_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => onPickType(type.value)}
                className="rounded border border-[var(--pv-border)] bg-[var(--pv-panel)] px-2 py-1.5 text-left text-[11px] hover:border-cyan-500/40"
              >
                <span className="font-medium text-cyan-200">{type.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="space-y-1">
          {notes.map((note) => (
            <EncounterNoteRow key={note.id} note={note} onOpen={() => onOpenNote(note)} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteStatusBadge({
  status,
  revisionCount = 0,
}: {
  status: "DRAFT" | "SIGNED";
  revisionCount?: number | null;
}) {
  const label = getNoteStatusLabel({ status, revisionCount });
  const isSigned = status === "SIGNED";
  const isRevised = isSigned && (revisionCount ?? 0) > 0;
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        !isSigned
          ? "bg-amber-500/15 text-amber-300"
          : isRevised
            ? "bg-orange-500/15 text-orange-300"
            : "bg-emerald-500/15 text-emerald-300"
      )}
    >
      {label}
    </span>
  );
}

function EncounterNoteRow({ note, onOpen }: { note: EncounterNote; onOpen: () => void }) {
  const status = note.status ?? "DRAFT";
  const authorLabel = getNoteAuthorLabel(note);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-2 rounded border border-[var(--pv-border)] bg-[var(--pv-panel)] px-2 py-1.5 text-left transition hover:border-cyan-500/30"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[11px] font-medium text-cyan-200">{getNoteTypeLabel(note.type)}</span>
          <NoteStatusBadge status={status} revisionCount={note.revisionCount} />
        </div>
        <span className="truncate text-[10px] text-[var(--pv-muted-2)]">Author: {authorLabel}</span>
      </div>
      <span className="shrink-0 text-[10px] text-[var(--pv-muted)]">{formatClinicDateOnly(note.date)}</span>
    </button>
  );
}

function AttachmentsBranchPanel({
  patientId,
  encounterId,
  documents,
  isReadOnly,
  canRemoveRecords,
  onRefresh,
  onSendFax,
}: {
  patientId: string;
  encounterId: string;
  documents: EncounterDocument[];
  isReadOnly: boolean;
  canRemoveRecords: boolean;
  onRefresh: () => Promise<void>;
  onSendFax: (documentId: string) => void;
}) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [viewerDoc, setViewerDoc] = useState<EncounterDocument | null>(null);

  function onFileSelected(selected: File | null) {
    setFile(selected);
    setUploadError(null);
    if (selected && !name.trim()) {
      setName(selected.name.replace(/\.[^.]+$/, "") || selected.name);
    }
  }

  async function upload() {
    if (!file) {
      setUploadError("Choose a file first.");
      return;
    }
    if (!name.trim()) {
      setUploadError("Enter a document name.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim());
      fd.append("encounterId", encounterId);
      const res = await fetch(`/api/patients/${patientId}/documents/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setUploadError(
          data?.error ??
            `Upload failed (${res.status}). If this was a scan, try again — large BMP files often fail; JPEG under 25MB works best.`
        );
        return;
      }
      setName("");
      setFile(null);
      setFileInputKey((k) => k + 1);
      await onRefresh();
    } catch {
      setUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  function startRename(doc: EncounterDocument) {
    setRenamingId(doc.id);
    setRenameValue(doc.name);
    setRenameError("");
  }

  async function saveRename() {
    if (!renamingId) return;
    const nextName = renameValue.trim();
    if (!nextName) {
      setRenameError("Enter a document name.");
      return;
    }
    setRenaming(true);
    setRenameError("");
    try {
      await api(`/api/patients/${patientId}/documents/${renamingId}`, {
        method: "PATCH",
        json: { name: nextName },
      });
      setRenamingId(null);
      setRenameValue("");
      await onRefresh();
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "Could not rename document.");
    } finally {
      setRenaming(false);
    }
  }

  return (
    <div className="mt-1.5 rounded-md border border-[var(--pv-border)] bg-[var(--pv-card)]/80 p-2">
      {!isReadOnly && (
        <div className="mb-2 flex flex-wrap items-end gap-1.5 border-b border-[var(--pv-border)] pb-2">
          <Input
            className="!h-8 min-w-[120px] flex-1 !text-xs"
            placeholder="Document name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            key={fileInputKey}
            className="!h-8 max-w-[180px] !text-xs"
            type="file"
            onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
          />
          <ScanDocumentButton
            defaultName={name.trim() || "Encounter document"}
            className="!h-8 !gap-1.5 !text-[10px]"
            onCaptured={(scanned, suggestedName) => {
              setFile(scanned);
              setUploadError(null);
              if (!name.trim()) setName(suggestedName);
              setFileInputKey((k) => k + 1);
            }}
          />
          <Button
            variant="success"
            className="!h-8 !text-[10px]"
            disabled={uploading || !file || !name.trim()}
            onClick={upload}
          >
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      )}
      {uploadError && <p className="mb-2 text-xs text-red-400">{uploadError}</p>}
      {renameError && <p className="mb-2 text-xs text-rose-300">{renameError}</p>}

      {documents.length === 0 ? (
        <p className="py-1 text-xs text-[var(--pv-muted)]">No files attached.</p>
      ) : (
        <div className="space-y-1">
          {documents.map((d) => (
            <div
              key={d.id}
              role="button"
              tabIndex={renamingId === d.id ? -1 : 0}
              onClick={() => {
                if (renamingId === d.id) return;
                setViewerDoc(d);
              }}
              onKeyDown={(e) => {
                if (renamingId === d.id) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setViewerDoc(d);
                }
              }}
              className={cn(
                "flex items-center justify-between gap-2 rounded border border-[var(--pv-border)] bg-[var(--pv-panel)] px-2 py-1.5 transition",
                renamingId === d.id
                  ? "cursor-default"
                  : "cursor-pointer hover:border-cyan-500/35 hover:bg-[color-mix(in_srgb,var(--pv-hover)_70%,transparent)]"
              )}
            >
              <div className="min-w-0 flex-1">
                {renamingId === d.id ? (
                  <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      className="!h-7 min-w-[120px] flex-1 !text-[11px]"
                      value={renameValue}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveRename();
                        }
                        if (e.key === "Escape") {
                          setRenamingId(null);
                          setRenameError("");
                        }
                      }}
                    />
                    <Button
                      className="!h-7 !px-2 !text-[10px]"
                      disabled={renaming || !renameValue.trim()}
                      onClick={saveRename}
                    >
                      {renaming ? "..." : "Save"}
                    </Button>
                    <Button
                      className="!h-7 !px-2 !text-[10px]"
                      disabled={renaming}
                      onClick={() => {
                        setRenamingId(null);
                        setRenameError("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="truncate text-[11px] font-medium text-cyan-200">{d.name}</div>
                    <div className="truncate text-[10px] text-[var(--pv-muted)]">
                      {d.fileName} · {(d.fileSize / 1024).toFixed(1)} KB
                    </div>
                  </>
                )}
              </div>
              <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                {!isReadOnly && renamingId !== d.id && (
                  <Button className="!h-7 !px-2 !text-[10px]" onClick={() => startRename(d)}>
                    Rename
                  </Button>
                )}
                <Button
                  className="!h-7 !px-2 !text-[10px]"
                  onClick={() => setViewerDoc(d)}
                >
                  Open
                </Button>
                {!isReadOnly && (
                  <Button
                    className="!h-7 !px-2 !text-[10px]"
                    onClick={() => onSendFax(d.id)}
                  >
                    Fax
                  </Button>
                )}
                {!isReadOnly && canRemoveRecords && (
                  <Button
                    variant="danger"
                    className="!h-7 !px-2 !text-[10px]"
                    onClick={() => setDeleteDocId(d.id)}
                  >
                    Del
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <DeleteReasonModal
        open={!!deleteDocId}
        onClose={() => setDeleteDocId(null)}
        title="Delete Document"
        description="Deleting a document is permanent and audit-logged. Provide a documented reason."
        confirmLabel="Delete Document"
        onConfirm={async (reason) => {
          if (!deleteDocId) return;
          await api(`/api/patients/${patientId}/documents/${deleteDocId}`, {
            method: "DELETE",
            json: { reason },
          });
          setDeleteDocId(null);
          await onRefresh();
        }}
      />

      {viewerDoc && (
        <FullPageDocumentViewer
          title={viewerDoc.name}
          url={`/api/patients/${patientId}/documents/${viewerDoc.id}`}
          mimeType={viewerDoc.mimeType}
          onClose={() => setViewerDoc(null)}
          backLabel="Back to Attachments"
        />
      )}
    </div>
  );
}
