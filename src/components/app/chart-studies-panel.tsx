"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { FullPageDocumentViewer } from "@/components/app/full-page-document-viewer";
import { Button } from "@/components/ui/button";
import {
  DOCUMENT_SECTION_LABELS,
  DOCUMENT_UPLOAD_SECTIONS,
  type DocumentUploadSectionKey,
} from "@/lib/document-sections";
import { cn, formatDate } from "@/lib/utils";
import { ChevronDown, Eye, FileText } from "lucide-react";

type StudyDoc = {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  sectionKey?: string | null;
  openUrl?: string;
  kind?: string;
};

const STUDY_KEYS = DOCUMENT_UPLOAD_SECTIONS;

const SECTION_ICONS: Record<DocumentUploadSectionKey, string> = {
  labs: "🧪",
  imaging: "📷",
  echo: "💓",
  pft: "🫁",
  sleep: "😴",
};

type OpenMap = Record<DocumentUploadSectionKey, boolean>;

const DEFAULT_OPEN: OpenMap = {
  labs: true,
  imaging: true,
  echo: true,
  pft: true,
  sleep: true,
};

function isStudySectionKey(key: string | null | undefined): key is DocumentUploadSectionKey {
  return Boolean(key && (STUDY_KEYS as readonly string[]).includes(key));
}

export function ChartStudiesPanel({
  patientId,
  isActive,
}: {
  patientId: string;
  isActive: boolean;
  /** Kept for call-site compatibility; Studies is view-only. */
  isReadOnly?: boolean;
}) {
  const [docs, setDocs] = useState<StudyDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openMap, setOpenMap] = useState<OpenMap>(DEFAULT_OPEN);
  const [viewerDoc, setViewerDoc] = useState<StudyDoc | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ documents: StudyDoc[] }>(`/api/patients/${patientId}/documents`);
      const studyDocs = (data.documents ?? []).filter((d) => isStudySectionKey(d.sectionKey));
      setDocs(studyDocs);
    } catch {
      setDocs([]);
      setError("Could not load studies");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (!isActive) return;
    void load();
  }, [isActive, load]);

  const grouped = useMemo(() => {
    const map = new Map<DocumentUploadSectionKey, StudyDoc[]>();
    for (const key of STUDY_KEYS) map.set(key, []);
    for (const doc of docs) {
      if (!isStudySectionKey(doc.sectionKey)) continue;
      map.get(doc.sectionKey)!.push(doc);
    }
    for (const list of map.values()) {
      list.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt));
    }
    return map;
  }, [docs]);

  function toggle(key: DocumentUploadSectionKey) {
    setOpenMap((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 shrink-0">
        <h2 className="text-sm font-semibold text-cyan-300">Studies</h2>
        <p className="mt-0.5 text-xs text-[var(--pv-muted)]">
          View-only list of labs, imaging, echo, PFTs, and sleep studies — open to view PDFs and files
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-sm text-[var(--pv-muted)]">Loading studies…</p>
        ) : error ? (
          <p className="text-sm text-rose-400">{error}</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-[var(--pv-muted)]">
            No study files yet. Upload them under Labs, Imaging, Echo, PFTs, or Sleep Study.
          </p>
        ) : (
          STUDY_KEYS.map((key) => {
            const list = grouped.get(key) ?? [];
            const open = openMap[key] !== false;
            return (
              <section
                key={key}
                className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)]/50"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  onClick={() => toggle(key)}
                  aria-expanded={open}
                >
                  <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--pv-fg)]">
                    <span aria-hidden>{SECTION_ICONS[key]}</span>
                    <span className="truncate">{DOCUMENT_SECTION_LABELS[key]}</span>
                    <span className="rounded-full bg-[var(--pv-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--pv-muted-2)]">
                      {list.length}
                    </span>
                  </h3>
                  <ChevronDown
                    size={16}
                    className={cn(
                      "shrink-0 text-[var(--pv-muted)] transition",
                      open && "rotate-180"
                    )}
                  />
                </button>

                <div
                  className={cn(
                    "space-y-1 border-t border-[var(--pv-border)] px-2 py-2",
                    !open && "hidden"
                  )}
                >
                  {list.length === 0 ? (
                    <p className="px-1 py-1 text-xs text-[var(--pv-muted)]">No files in this category.</p>
                  ) : (
                    <ul className="space-y-1">
                      {list.map((doc) => (
                        <li
                          key={doc.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setViewerDoc(doc)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setViewerDoc(doc);
                            }
                          }}
                          className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel-deep)] px-2.5 py-1.5 transition hover:border-cyan-500/35 hover:bg-[color-mix(in_srgb,var(--pv-hover)_70%,transparent)]"
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            <FileText size={14} className="mt-0.5 shrink-0 text-cyan-300/80" />
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-cyan-200">{doc.name}</div>
                              <div className="truncate text-[10px] text-[var(--pv-muted)]">
                                {doc.fileName} · {formatDate(doc.uploadedAt)}
                              </div>
                            </div>
                          </div>
                          <Button
                            className="!h-7 !shrink-0 !px-2 !text-[11px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewerDoc(doc);
                            }}
                            title="View"
                          >
                            <Eye size={12} /> View
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            );
          })
        )}
      </div>

      {viewerDoc && (
        <FullPageDocumentViewer
          title={viewerDoc.name}
          url={viewerDoc.openUrl ?? `/api/patients/${patientId}/documents/${viewerDoc.id}`}
          onClose={() => setViewerDoc(null)}
        />
      )}
    </div>
  );
}
