"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  parseNotePayload,
  type NoteSectionKey,
  type NoteSections,
} from "@/lib/note-content";
import { VitalsPanel } from "@/components/app/vitals-panel";
import { createEmptyVitals, type VitalsData } from "@/lib/vitals";
import {
  canInsertFromChart,
  getChartInsertText,
  type PatientChartInsertSnapshot,
} from "@/lib/note-chart-map";
import { getAllNoteTabs } from "@/lib/note-templates";
import { parseFixedNoteSections, type FixedNoteSections } from "@/lib/note-propagation";
import { getNoteTypeLabel, type NoteType } from "@/lib/notes";
import { cn, formatDate, toDateInputValue } from "@/lib/utils";
import { AutoSaveStatus, useDebouncedCallback } from "@/lib/use-debounced-callback";
import { ArrowDownToLine, ArrowLeft, FileText, PenLine, Pin } from "lucide-react";

export type StructuredNoteData = {
  id: string;
  type: NoteType;
  status: "DRAFT" | "SIGNED";
  date: string;
  content: string;
  signedAt?: string | null;
  encounterId?: string | null;
};

export function StructuredNoteEditor({
  patientId,
  note,
  chartInsertData,
  isReadOnly,
  onBack,
  onSaved,
  onSigned,
}: {
  patientId: string;
  note: StructuredNoteData;
  chartInsertData: PatientChartInsertSnapshot;
  isReadOnly: boolean;
  onBack: () => void;
  onSaved: () => Promise<void>;
  onSigned: () => Promise<void>;
}) {
  const initial = parseNotePayload(note.type, note.content);
  const [activeTab, setActiveTab] = useState("cc_hpi");
  const [sections, setSections] = useState<NoteSections>(() => initial.sections);
  const [vitals, setVitals] = useState<VitalsData>(() => initial.vitals);
  const [date, setDate] = useState(toDateInputValue(note.date));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [signing, setSigning] = useState(false);
  const [insertingKey, setInsertingKey] = useState<NoteSectionKey | null>(null);
  const [fixedSections, setFixedSections] = useState<FixedNoteSections>({});
  const [fixSaving, setFixSaving] = useState<NoteSectionKey | null>(null);
  const isSigned = note.status === "SIGNED";
  const readOnly = isReadOnly || isSigned;
  const tabs = getAllNoteTabs(note.type);
  const sectionsRef = useRef(sections);
  const vitalsRef = useRef(vitals);
  const dateRef = useRef(date);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  useEffect(() => {
    vitalsRef.current = vitals;
  }, [vitals]);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);

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

  function openPdf() {
    window.open(`/api/patients/${patientId}/notes/${note.id}/pdf`, "_blank");
  }

  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button className="!text-xs" onClick={onBack}>
            <ArrowLeft size={14} /> Back to Encounter
          </Button>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              isSigned ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
            )}
          >
            {isSigned ? "Signed" : "Draft"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoSaveStatus saving={saving} dirty={dirty} />
          {!readOnly && (
            <Button variant="success" className="!text-xs" disabled={signing} onClick={signNote}>
              <PenLine size={14} /> Sign Note
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#243044] bg-[#0f1520] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-sm font-semibold text-cyan-200">{getNoteTypeLabel(note.type)}</div>
            <div className="text-xs text-[#6b7c93]">{formatDate(note.date)}</div>
          </div>
          {!readOnly && (
            <Input
              type="date"
              className="max-w-[160px]"
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
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden rounded-xl border border-[#243044] bg-[#0f1520]">
        <nav className="flex w-[200px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-[#243044] p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-lg px-3 py-2.5 text-left text-xs font-medium transition",
                activeTab === tab.id
                  ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/30"
                  : "text-[#8b9cb3] hover:bg-[#1a2330] hover:text-white"
              )}
            >
              {tab.id === "pdf" ? (
                <span className="flex items-center gap-2">
                  <FileText size={14} /> PDF
                </span>
              ) : (
                tab.label
              )}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {activeTab === "pdf" ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <FileText size={48} className="text-cyan-500/50" />
              <div>
                <h3 className="text-lg font-medium text-cyan-200">Clinical Note PDF</h3>
                <p className="mt-1 max-w-md text-sm text-[#6b7c93]">
                  Generate a formatted PDF with all completed sections organized for printing or sharing.
                </p>
              </div>
              <Button variant="primary" onClick={openPdf}>
                Open PDF Preview
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {activeTab === "physical_exam" && (
                <VitalsPanel vitals={vitals} readOnly={readOnly} onChange={updateVitals} />
              )}
              {active?.fields.map((field) => {
                const isFixed = Boolean(fixedSections[field.key]);
                const showInsert = canInsertFromChart(field.key);
                const hasChartContent = Boolean(getChartInsertText(chartInsertData, field.key));

                return (
                  <div
                    key={field.key}
                    className={cn(
                      "rounded-lg border p-3 transition",
                      isFixed
                        ? "border-amber-500/40 bg-amber-500/5 ring-1 ring-amber-500/20"
                        : "border-transparent"
                    )}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-cyan-300/80">
                        {field.label}
                        {isFixed && (
                          <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-300">
                            Fixed — carries to next note
                          </span>
                        )}
                      </label>
                      {!isReadOnly && (
                        <div className="flex items-center gap-1.5">
                          {showInsert && (
                            <Button
                              className="!text-xs"
                              disabled={!hasChartContent || insertingKey === field.key}
                              title={
                                hasChartContent
                                  ? "Insert latest content from patient chart"
                                  : "No content in patient chart for this section yet"
                              }
                              onClick={() => insertFromChart(field.key)}
                            >
                              <ArrowDownToLine size={13} />
                              {insertingKey === field.key ? "Inserting..." : "Insert"}
                            </Button>
                          )}
                          <Button
                            className={cn(
                              "!text-xs",
                              isFixed &&
                                "!border-amber-500/50 !bg-amber-500/20 !text-amber-200 hover:!bg-amber-500/30"
                            )}
                            disabled={fixSaving === field.key}
                            title={
                              isFixed
                                ? "Stop carrying this section to new notes"
                                : "Carry this section from the last note into new notes"
                            }
                            onClick={() => toggleFix(field.key)}
                          >
                            <Pin size={13} className={cn(isFixed && "fill-current")} />
                            {fixSaving === field.key ? "..." : "Fix"}
                          </Button>
                        </div>
                      )}
                    </div>
                    {field.size === "sm" ? (
                      <Input
                        value={sections[field.key] ?? ""}
                        onChange={(e) => updateSection(field.key, e.target.value)}
                        disabled={readOnly}
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <Textarea
                        className={cn(
                          "font-mono text-[13px]",
                          field.size === "lg" ? "min-h-[320px]" : "min-h-[140px]",
                          isFixed && "border-amber-500/30"
                        )}
                        value={sections[field.key] ?? ""}
                        onChange={(e) => updateSection(field.key, e.target.value)}
                        disabled={readOnly}
                        placeholder={field.placeholder}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
