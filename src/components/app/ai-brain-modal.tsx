"use client";

import { useEffect, useState } from "react";
import { Brain, Plus, Trash2 } from "lucide-react";
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

type BrainSource = {
  id: string;
  title: string;
  type: AiBrainSourceTypeValue;
  content: string;
  active: boolean;
  priority: number;
  updatedAt: string;
};

export function AiBrainModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sources, setSources] = useState<BrainSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<AiBrainSourceTypeValue>("GUIDELINE");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState("100");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ sources: BrainSource[] }>("/api/ai-brain");
      setSources(data.sources);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load AI Brain");
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
        await api(`/api/ai-brain/${editingId}`, { method: "PATCH", json: payload });
      } else {
        await api("/api/ai-brain", { method: "POST", json: payload });
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
      await api(`/api/ai-brain/${source.id}`, {
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
      await api(`/api/ai-brain/${source.id}`, { method: "DELETE" });
      if (editingId === source.id) resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  const selectClass =
    "w-full rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

  return (
    <Modal open={open} onClose={onClose} title="AI Brain" xl className="max-w-4xl">
      <p className="mb-4 text-sm text-[var(--pv-muted)]">
        Background clinic knowledge for Ask AI: guidelines, preferences, and preferred assessment/plan wording.
        Active sources are applied automatically — no need to open this during normal charting.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="mb-5 space-y-3 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-violet-300">
          <Brain className="h-4 w-4" />
          {editingId ? "Edit source" : "Add source"}
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
          <span className="text-xs text-[var(--pv-muted-2)]">Priority (higher = more important)</span>
          <Input value={priority} onChange={(e) => setPriority(e.target.value)} inputMode="numeric" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-[var(--pv-muted-2)]">Content</span>
          <Textarea
            className="min-h-[140px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste guidelines, preference rules, or example assessment/plan wording..."
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
            {saving ? "Saving..." : editingId ? "Update source" : "Add to brain"}
          </Button>
        </div>
      </div>

      <div className="max-h-[40vh] space-y-2 overflow-y-auto">
        {loading && <p className="text-sm text-[var(--pv-muted)]">Loading...</p>}
        {!loading && sources.length === 0 && (
          <p className="text-sm text-[var(--pv-muted)]">No brain sources yet. Add your first guideline or preference above.</p>
        )}
        {sources.map((source) => (
          <div
            key={source.id}
            className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg-deep)] px-3 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--pv-fg-soft)]">{source.title}</p>
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
          </div>
        ))}
      </div>
    </Modal>
  );
}
