"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteReasonModal } from "@/components/app/delete-reason-modal";
import { StructuredNoteEditor, type StructuredNoteData } from "@/components/app/structured-note-editor";
import {
  ENCOUNTER_MODALITIES,
  VISIT_CATEGORIES,
  getEncounterModalityLabel,
  getVisitCategoryLabel,
  getVisitCategoryTimelineStyles,
  type EncounterModality,
  type VisitCategory,
} from "@/lib/encounters";
import { getNoteTypeLabel, NOTE_TYPES, type NoteType } from "@/lib/notes";
import type { PatientChartInsertSnapshot } from "@/lib/note-chart-map";
import { cn, formatDate, toDateInputValue } from "@/lib/utils";
import { AutoSaveStatus, useDebouncedCallback } from "@/lib/use-debounced-callback";
import { Calendar, ChevronDown, ChevronRight, ClipboardList, Lock, Paperclip, Pill, Plus } from "lucide-react";

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
  createdAt: string;
  updatedAt: string;
};

type EncounterNote = StructuredNoteData;

type EncounterDocument = {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
};

type EncounterDetail = EncounterSummary & {
  notes: EncounterNote[];
  documents: EncounterDocument[];
};

type EncounterBranch = "notes" | "attachments" | "prescriptions";

function formatEncounterTimelineDate(iso: string) {
  const d = new Date(iso);
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase()
    .replace(",", "");
}

export function ChartEncountersPanel({
  patientId,
  chartInsertData,
  isReadOnly,
  canRemoveRecords,
  onPatientDataChange,
}: {
  patientId: string;
  chartInsertData: PatientChartInsertSnapshot;
  isReadOnly: boolean;
  canRemoveRecords: boolean;
  onPatientDataChange?: () => Promise<void>;
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

  const loadEncounters = useCallback(async () => {
    const data = await api<{ encounters: EncounterSummary[] }>(`/api/patients/${patientId}/encounters`);
    setEncounters(data.encounters);
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
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [loadEncounters]);

  async function ensureEncounterOpen(encounterId: string): Promise<EncounterDetail> {
    setExpandedId(encounterId);
    if (details[encounterId]) return details[encounterId];
    return loadDetail(encounterId);
  }

  async function toggleExpand(encounterId: string) {
    if (expandedId === encounterId) {
      setExpandedId(null);
      setActiveBranch(null);
      setPickingNoteTypeFor(null);
      return;
    }
    setExpandedId(encounterId);
    setActiveBranch(null);
    setPickingNoteTypeFor(null);
    if (!details[encounterId]) {
      await loadDetail(encounterId);
    }
  }

  async function openBranch(encounterId: string, branch: EncounterBranch) {
    if (activeBranch?.encounterId === encounterId && activeBranch.branch === branch) {
      setActiveBranch(null);
      setPickingNoteTypeFor(null);
      return;
    }
    const loaded = await ensureEncounterOpen(encounterId);
    setActiveBranch({ encounterId, branch });
    if (branch === "notes" && !isReadOnly && loaded.notes.length === 0) {
      setPickingNoteTypeFor(encounterId);
    } else {
      setPickingNoteTypeFor(null);
    }
  }

  async function createEncounter(visitCategory: VisitCategory, modality: EncounterModality) {
    const data = await api<{ encounter: EncounterSummary }>(`/api/patients/${patientId}/encounters`, {
      method: "POST",
      json: { visitCategory, modality, date: toDateInputValue(new Date()) },
    });
    setPickingEncounter(false);
    setSelectedVisitCategory(null);
    await loadEncounters();
    setExpandedId(data.encounter.id);
    await loadDetail(data.encounter.id);
    setActiveBranch({ encounterId: data.encounter.id, branch: "notes" });
    if (modality === "PATIENT_LETTER") {
      await createNote(data.encounter.id, "PATIENT_LETTER");
    } else {
      setPickingNoteTypeFor(data.encounter.id);
    }
    await onPatientDataChange?.();
  }

  async function createNote(encounterId: string, type: NoteType) {
    const res = await api<{ note: EncounterNote }>(`/api/patients/${patientId}/notes`, {
      method: "POST",
      json: {
        date: toDateInputValue(new Date()),
        type,
        encounterId,
      },
    });
    setPickingNoteTypeFor(null);
    await loadDetail(encounterId);
    await loadEncounters();
    setActiveNote(res.note);
    await onPatientDataChange?.();
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
        patientId={patientId}
        note={activeNote}
        chartInsertData={chartInsertData}
        isReadOnly={isReadOnly}
        onBack={() => setActiveNote(null)}
        onSaved={async () => {
          const encId = activeNote.encounterId ?? expandedId;
          if (encId) await refreshEncounter(encId);
        }}
        onSigned={async () => {
          const encId = activeNote.encounterId ?? expandedId;
          if (encId) await refreshEncounter(encId);
        }}
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
        <div className="rounded-xl border border-[#243044] bg-[#0f1520] p-4">
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
                    "rounded-xl border bg-[#121820] px-4 py-3 text-left transition hover:bg-[#1a2330]",
                    styles.pickerBorder,
                    styles.pickerHoverBorder
                  )}
                >
                  <div className={cn("text-sm font-medium", styles.pickerTitle)}>{category.label}</div>
                  <div className="mt-1 text-xs text-[#6b7c93]">{category.description}</div>
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
                    "rounded-xl border bg-[#121820] px-4 py-3 text-left transition hover:bg-[#1a2330]",
                    styles.pickerBorder,
                    styles.pickerHoverBorder
                  )}
                >
                  <div className={cn("text-sm font-medium", styles.pickerTitle)}>{modality.label}</div>
                  <div className="mt-1 text-xs text-[#6b7c93]">{modality.description}</div>
                </button>
              );
              })}
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-sm text-[#6b7c93]">Loading encounters...</p>}
      {!loading && encounters.length === 0 && !pickingEncounter && (
        <p className="text-sm text-[#6b7c93]">No encounters yet. Create one to document a clinic visit.</p>
      )}

      <div className="relative pl-6">
        <div className="absolute bottom-2 left-[11px] top-2 w-px bg-[#2d3f57]/80" />

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
                    "absolute -left-6 top-3.5 z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 bg-[#0a0e14]",
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
                  <button
                    type="button"
                    onClick={() => toggleExpand(enc.id)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left"
                  >
                    <span className="mt-0.5 text-[#6b7c93]">
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
                        <div className="mt-0.5 truncate text-[11px] text-[#8b9cb3]">{enc.chiefComplaint}</div>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[#243044]/80 px-3 pb-2 pt-1.5">
                      {isLoadingDetail && !detail && (
                        <p className="py-2 text-xs text-[#6b7c93]">Loading...</p>
                      )}

                      {detail && (
                        <>
                          <EncounterDateRow
                            visitDate={detail.date}
                            createdAt={detail.createdAt}
                            isReadOnly={isReadOnly}
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
                              icon={Paperclip}
                              label="Files"
                              count={detail.documents.length}
                              active={branchOpen === "attachments"}
                              ringClass="border-violet-400/70 bg-violet-500/10 text-violet-300"
                              activeRingClass="ring-violet-400/50"
                              onClick={() => openBranch(enc.id, "attachments")}
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
                              onOpenNote={setActiveNote}
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
                            />
                          )}

                          {branchOpen === "prescriptions" && (
                            <div className="mt-1.5 rounded-md border border-dashed border-[#243044] bg-[#121820]/60 px-3 py-2.5">
                              <p className="text-xs text-[#8b9cb3]">
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
    </div>
  );
}

function EncounterDateRow({
  visitDate,
  createdAt,
  isReadOnly,
  onDateChange,
}: {
  visitDate: string;
  createdAt: string;
  isReadOnly: boolean;
  onDateChange: (date: string) => Promise<void>;
}) {
  const [date, setDate] = useState(() => toDateInputValue(visitDate));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savedDateRef = useRef(toDateInputValue(visitDate));

  useEffect(() => {
    const next = toDateInputValue(visitDate);
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
    toDateInputValue(visitDate) !== toDateInputValue(createdAt);

  return (
    <div className="mb-1.5 rounded-md border border-[#243044] bg-[#121820]/60 px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[#6b7c93]">
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
        <div className="flex items-center gap-1.5 text-[10px] text-[#6b7c93]">
          <Lock size={11} className="shrink-0 text-[#4a5568]" />
          <span>
            Chart created{" "}
            <span className="text-[#8b9cb3]">{formatDate(createdAt)}</span>
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
      className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-[#1a2330]"
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
          active ? "text-cyan-200" : "text-[#6b7c93] group-hover:text-[#8b9cb3]"
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
    <div className="mt-1.5 rounded-md border border-[#243044] bg-[#121820]/80 p-2">
      {pickingNoteType && (
        <div className="mb-2 border-b border-[#243044] pb-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-cyan-200">New note</span>
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
                className="rounded border border-[#243044] bg-[#0f1520] px-2 py-1.5 text-left text-[11px] hover:border-cyan-500/40"
              >
                <span className="font-medium text-cyan-200">{type.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {notes.length === 0 && !pickingNoteType ? (
        <div className="flex items-center justify-between gap-2 py-1">
          <p className="text-xs text-[#6b7c93]">No notes yet.</p>
          {!isReadOnly && (
            <Button variant="success" className="!h-7 !text-[10px]" onClick={onStartNote}>
              Start Note
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {notes.map((note) => (
            <EncounterNoteRow key={note.id} note={note} onOpen={() => onOpenNote(note)} />
          ))}
          {!isReadOnly && !pickingNoteType && (
            <Button className="!mt-1 !h-7 w-full !text-[10px]" onClick={onStartNote}>
              <Plus size={12} /> Add Note
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function EncounterNoteRow({ note, onOpen }: { note: EncounterNote; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-2 rounded border border-[#243044] bg-[#0f1520] px-2 py-1.5 text-left transition hover:border-cyan-500/30"
    >
      <span className="truncate text-[11px] font-medium text-cyan-200">{getNoteTypeLabel(note.type)}</span>
      <span className="shrink-0 text-[10px] text-[#6b7c93]">{formatDate(note.date)}</span>
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
}: {
  patientId: string;
  encounterId: string;
  documents: EncounterDocument[];
  isReadOnly: boolean;
  canRemoveRecords: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);

  async function upload() {
    if (!file || !name.trim()) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim());
      fd.append("encounterId", encounterId);
      await fetch(`/api/patients/${patientId}/documents/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      setName("");
      setFile(null);
      await onRefresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-1.5 rounded-md border border-[#243044] bg-[#121820]/80 p-2">
      {!isReadOnly && (
        <div className="mb-2 flex flex-wrap items-end gap-1.5 border-b border-[#243044] pb-2">
          <Input
            className="!h-8 min-w-[120px] flex-1 !text-xs"
            placeholder="Document name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            className="!h-8 max-w-[180px] !text-xs"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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

      {documents.length === 0 ? (
        <p className="py-1 text-xs text-[#6b7c93]">No files attached.</p>
      ) : (
        <div className="space-y-1">
          {documents.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-2 rounded border border-[#243044] bg-[#0f1520] px-2 py-1.5"
            >
              <div className="min-w-0">
                <div className="truncate text-[11px] font-medium text-cyan-200">{d.name}</div>
                <div className="truncate text-[10px] text-[#6b7c93]">
                  {d.fileName} · {(d.fileSize / 1024).toFixed(1)} KB
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  className="!h-7 !px-2 !text-[10px]"
                  onClick={() => window.open(`/api/patients/${patientId}/documents/${d.id}`, "_blank")}
                >
                  Open
                </Button>
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
    </div>
  );
}
