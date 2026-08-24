"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, FileText, Plus, Trash2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import {
  AI_BRAIN_TYPE_LABELS,
  AI_BRAIN_TYPES,
  type AiBrainSourceTypeValue,
} from "@/lib/ai-brain-types";

type BrainDocument = {
  id: string;
  sourceId: string | null;
  title: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  extractionStatus: string;
  active: boolean;
  priority: number;
  openUrl: string;
};

type BrainSource = {
  id: string;
  title: string;
  type: AiBrainSourceTypeValue;
  content: string;
  active: boolean;
  priority: number;
  updatedAt: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MyBrainModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sources, setSources] = useState<BrainSource[]>([]);
  const [documents, setDocuments] = useState<BrainDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<AiBrainSourceTypeValue>("GUIDELINE");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState("100");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadSourceId, setUploadSourceId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ sources: BrainSource[]; documents: BrainDocument[] }>("/api/my-brain");
      setSources(data.sources);
      setDocuments(data.documents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load My Brain");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open]);

  function resetForm() {
    setTitle("");
    setType("GUIDELINE");
    setContent("");
    setPriority("100");
    setEditingId(null);
  }

  function startEdit(source: BrainSource) {
    setEditingId(source.id);
    setTitle(source.title);
    setType(source.type);
    setContent(source.content);
    setPriority(String(source.priority));
  }

  async function save() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: title.trim(),
        type,
        content,
        priority: Number.parseInt(priority, 10) || 100,
        active: true,
      };
      if (editingId) {
        await api(`/api/my-brain/${editingId}`, { method: "PATCH", json: payload });
      } else {
        await api("/api/my-brain", { method: "POST", json: payload });
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(source: BrainSource) {
    try {
      await api(`/api/my-brain/${source.id}`, {
        method: "PATCH",
        json: { active: !source.active },
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    }
  }

  async function remove(source: BrainSource) {
    if (!window.confirm(`Delete brain source “${source.title}”?`)) return;
    try {
      await api(`/api/my-brain/${source.id}`, { method: "DELETE" });
      if (editingId === source.id) resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  async function uploadDocument(file: File) {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", uploadTitle.trim() || file.name);
      if (uploadSourceId) form.append("sourceId", uploadSourceId);
      const res = await fetch("/api/my-brain/documents", { method: "POST", body: form });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setUploadTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload");
    } finally {
      setUploading(false);
    }
  }

  async function toggleDocActive(doc: BrainDocument) {
    try {
      await api(`/api/my-brain/documents/${doc.id}`, {
        method: "PATCH",
        json: { active: !doc.active },
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update document");
    }
  }

  async function reabsorbDoc(doc: BrainDocument) {
    try {
      await api(`/api/my-brain/documents/${doc.id}/reabsorb`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not re-absorb document");
    }
  }

  async function removeDoc(doc: BrainDocument) {
    if (!window.confirm(`Delete document “${doc.title}”?`)) return;
    try {
      await api(`/api/my-brain/documents/${doc.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete document");
    }
  }

  const selectClass =
    "w-full rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

  const docsForSource = (sourceId: string) => documents.filter((d) => d.sourceId === sourceId);
  const standaloneDocs = documents.filter((d) => !d.sourceId);

  return (
    <Modal open={open} onClose={onClose} title="My Brain" xl className="max-w-4xl">
      <p className="mb-4 text-sm text-[var(--pv-muted)]">
        Your personal knowledge base. Document text is <strong className="font-medium text-[var(--pv-fg-soft)]">absorbed once at upload</strong> and reused on every AI call — files are not re-read from storage each time.
        Written directives still take priority over absorbed document text.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="mb-5 space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-violet-300">
          <Brain className="h-4 w-4" />
          {editingId ? "Edit written directive" : "Add written directive (highest priority)"}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--pv-muted-2)]">Title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Asthma clinic rules" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--pv-muted-2)]">Type</span>
            <select className={selectClass} value={type} onChange={(e) => setType(e.target.value as AiBrainSourceTypeValue)}>
              {AI_BRAIN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {AI_BRAIN_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs text-[var(--pv-muted-2)]">Priority (higher = more important within tier)</span>
          <Input value={priority} onChange={(e) => setPriority(e.target.value)} inputMode="numeric" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-[var(--pv-muted-2)]">Written instructions</span>
          <Textarea
            className="min-h-[120px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Your rules, preferences, assessment/plan style, overrides..."
          />
        </label>
        <div className="flex justify-end gap-2">
          {editingId && (
            <Button onClick={resetForm} disabled={saving}>
              Cancel edit
            </Button>
          )}
          <Button variant="success" onClick={save} disabled={saving}>
            <Plus className="mr-1 h-4 w-4" />
            {saving ? "Saving..." : editingId ? "Update directive" : "Add directive"}
          </Button>
        </div>
      </div>

      <div className="mb-5 space-y-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-cyan-300">
          <Upload className="h-4 w-4" />
          Upload document (studies, guidelines, PDF, Word, images)
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--pv-muted-2)]">Title (optional)</span>
            <Input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="Defaults to file name"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--pv-muted-2)]">Link to directive (optional)</span>
            <select
              className={selectClass}
              value={uploadSourceId}
              onChange={(e) => setUploadSourceId(e.target.value)}
            >
              <option value="">Standalone document</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadDocument(file);
            }}
          />
          <Button
            variant="primary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1 h-4 w-4" />
            {uploading ? "Uploading..." : "Choose file"}
          </Button>
          <span className="text-xs text-[var(--pv-muted)]">PDF, Word, text, images · max 25 MB</span>
        </div>
      </div>

      <div className="max-h-[45vh] space-y-3 overflow-y-auto">
        {loading && <p className="text-sm text-[var(--pv-muted)]">Loading...</p>}

        {!loading && sources.length === 0 && standaloneDocs.length === 0 && (
          <p className="text-sm text-[var(--pv-muted)]">
            No My Brain content yet. Add a written directive or upload a guideline document.
          </p>
        )}

        {sources.map((source) => (
          <div
            key={source.id}
            className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg-deep)] px-3 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--pv-fg-soft)]">
                  {source.title}
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-violet-400">written</span>
                </p>
                <p className="text-xs text-[var(--pv-muted)]">
                  {AI_BRAIN_TYPE_LABELS[source.type]} · priority {source.priority} ·{" "}
                  {source.active ? "active" : "inactive"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button className="!text-xs" onClick={() => startEdit(source)}>
                  Edit
                </Button>
                <Button className="!text-xs" onClick={() => toggleActive(source)}>
                  {source.active ? "Disable" : "Enable"}
                </Button>
                <Button className="!text-xs !text-rose-300" onClick={() => remove(source)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {source.content.trim() && (
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-[var(--pv-muted-2)]">
                {source.content}
              </p>
            )}
            {docsForSource(source.id).map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onToggle={() => toggleDocActive(doc)}
                onRemove={() => removeDoc(doc)}
                onReabsorb={() => reabsorbDoc(doc)}
              />
            ))}
          </div>
        ))}

        {standaloneDocs.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-cyan-400/80">
              Standalone documents
            </p>
            {standaloneDocs.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onToggle={() => toggleDocActive(doc)}
                onRemove={() => removeDoc(doc)}
                onReabsorb={() => reabsorbDoc(doc)}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function DocumentRow({
  doc,
  onToggle,
  onRemove,
  onReabsorb,
}: {
  doc: BrainDocument;
  onToggle: () => void;
  onRemove: () => void;
  onReabsorb: () => void;
}) {
  const needsReabsorb = doc.extractionStatus === "FAILED";
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel)] px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-cyan-400" />
        <div className="min-w-0">
          <a
            href={doc.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs font-medium text-cyan-200 hover:underline"
          >
            {doc.title}
          </a>
          <p className="text-[10px] text-[var(--pv-muted)]">
            {doc.fileName} · {formatSize(doc.fileSize)} · {doc.extractionStatus.replace("_", " ").toLowerCase()} ·{" "}
            {doc.active ? "active" : "inactive"}
          </p>
        </div>
      </div>
      <div className="flex gap-1.5">
        {needsReabsorb && (
          <Button className="!text-xs !text-amber-200" onClick={onReabsorb}>
            Re-absorb
          </Button>
        )}
        <Button className="!text-xs" onClick={onToggle}>
          {doc.active ? "Disable" : "Enable"}
        </Button>
        <Button className="!text-xs !text-rose-300" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** @deprecated Use MyBrainModal */
export const AiBrainModal = MyBrainModal;
