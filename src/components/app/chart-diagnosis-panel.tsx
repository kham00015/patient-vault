"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DeleteReasonModal } from "@/components/app/delete-reason-modal";
import {
  appendDiagnosis,
  diagnosisListHasCode,
  type Icd10Diagnosis,
} from "@/lib/icd10";
import { cn } from "@/lib/utils";
import { AutoSaveStatus, useDebouncedCallback } from "@/lib/use-debounced-callback";
import { Plus, Search } from "lucide-react";

export function ChartDiagnosisPanel({
  value,
  isActive,
  isReadOnly,
  onSave,
  canRemoveRecords,
}: {
  value: string;
  isActive: boolean;
  isReadOnly: boolean;
  onSave: (v: string, reason?: string, silent?: boolean) => Promise<void>;
  canRemoveRecords?: boolean;
}) {
  const [content, setContent] = useState(value);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Icd10Diagnosis[]>([]);
  const [total, setTotal] = useState(0);
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showClearReason, setShowClearReason] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savedValueRef = useRef(value);
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    setDirty(false);
    savedValueRef.current = value;
    setContent(value);
    setShowClearReason(false);
  }, [value]);

  const persist = useCallback(
    async (next: string, silent = true) => {
      if (isReadOnly) return;
      if (!next.trim() && savedValueRef.current.trim()) return;
      if (next === savedValueRef.current) return;
      setSaving(true);
      try {
        await onSave(next, undefined, silent);
        savedValueRef.current = next;
        setDirty(false);
      } finally {
        setSaving(false);
      }
    },
    [isReadOnly, onSave]
  );

  const { debounced: debouncedPersist, flush: flushPersist } = useDebouncedCallback(persist, 1000);

  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      flushPersist();
    }
    wasActiveRef.current = isActive;
  }, [isActive, flushPersist]);

  const runSearch = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setResults([]);
      setTotal(0);
      setExpandedQuery(null);
      setSearchError("");
      return;
    }
    setSearching(true);
    setSearchError("");
    try {
      const data = await api<{ total: number; results: Icd10Diagnosis[]; expandedQuery?: string }>(
        `/api/icd10/search?q=${encodeURIComponent(term.trim())}`
      );
      setResults(data.results);
      setTotal(data.total);
      setExpandedQuery(data.expandedQuery ?? null);
    } catch {
      setResults([]);
      setTotal(0);
      setExpandedQuery(null);
      setSearchError("Search unavailable. Try again.");
    } finally {
      setSearching(false);
    }
  }, []);

  const { debounced: debouncedSearch } = useDebouncedCallback(runSearch, 350);

  useEffect(() => {
    debouncedSearch(query);
  }, [query, debouncedSearch]);

  function updateContent(next: string) {
    setContent(next);
    setDirty(true);
    debouncedPersist(next);
  }

  function addDiagnosis(item: Icd10Diagnosis) {
    if (isReadOnly) return;
    const next = appendDiagnosis(content, item.code, item.description);
    if (next === content) return;
    updateContent(next);
  }

  const isClearing = content.trim() === "" && savedValueRef.current.trim() !== "";

  async function handleSave() {
    if (isClearing) {
      setShowClearReason(true);
      return;
    }
    await persist(content, false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-cyan-300">🩺 Diagnosis</h2>
        {!isReadOnly && <AutoSaveStatus saving={saving} dirty={dirty} />}
      </div>

      {!isReadOnly && (
        <div className="mb-3 rounded-xl border border-[#243044] bg-[#121820] p-3">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#6b7c93]">
            ICD-10 search
          </label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7c93]"
            />
            <Input
              className="!pl-9"
              placeholder="Search code or name (COPD, J44.1, diabetes, hypertension)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {expandedQuery && results.length > 0 && (
            <p className="mt-1.5 text-[10px] text-cyan-300/80">
              “{query.trim()}” expanded to: {expandedQuery}
            </p>
          )}
          <p className="mt-1 text-[10px] text-[#6b7c93]">
            NIH/NLM ICD-10-CM. Abbreviations like COPD, CHF, HTN expand automatically.
          </p>

          {(searching || searchError || results.length > 0 || (query.trim().length >= 2 && !searching)) && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[#243044] bg-[#0f1520]">
              {searching && <p className="px-3 py-2 text-xs text-[#6b7c93]">Searching...</p>}
              {searchError && <p className="px-3 py-2 text-xs text-rose-400">{searchError}</p>}
              {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
                <p className="px-3 py-2 text-xs text-[#6b7c93]">
                  No matches. Try a code (J44.1), full name, or common abbreviation (COPD, CHF).
                </p>
              )}
              {!searching &&
                results.map((item) => {
                  const alreadyAdded = diagnosisListHasCode(content, item.code);
                  return (
                    <button
                      key={item.code}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => addDiagnosis(item)}
                      className={cn(
                        "flex w-full items-start gap-2 border-b border-[#243044]/80 px-3 py-2 text-left transition last:border-b-0",
                        alreadyAdded
                          ? "cursor-default opacity-50"
                          : "hover:bg-[#1a2330] hover:text-cyan-100"
                      )}
                    >
                      <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-cyan-300">
                        {item.code}
                      </span>
                      <span className="min-w-0 flex-1 text-xs leading-relaxed text-[#c9d5e3]">
                        {item.description}
                      </span>
                      {!alreadyAdded && (
                        <Plus size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                      )}
                      {alreadyAdded && (
                        <span className="shrink-0 text-[10px] uppercase text-[#6b7c93]">Added</span>
                      )}
                    </button>
                  );
                })}
            </div>
          )}
          {total > results.length && results.length > 0 && (
            <p className="mt-1 text-[10px] text-[#6b7c93]">
              Showing {results.length} of {total} matches — refine search to narrow results.
            </p>
          )}
        </div>
      )}

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#6b7c93]">
        Problem list
      </label>
      <Textarea
        className="min-h-[320px] flex-1 font-mono text-[13px]"
        value={content}
        onChange={(e) => updateContent(e.target.value)}
        disabled={isReadOnly}
        placeholder={
          isReadOnly
            ? "Read-only"
            : "Diagnoses appear here as ICD-10 code — description, one per line."
        }
      />

      {!isReadOnly && (
        <div className="mt-4 flex justify-between gap-2">
          {canRemoveRecords && savedValueRef.current.trim() && (
            <Button
              variant="danger"
              className="!text-xs"
              onClick={() => {
                setContent("");
                setShowClearReason(true);
              }}
            >
              Clear Section
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="success" onClick={handleSave}>
              {isClearing ? "Clear Section" : "Save"}
            </Button>
          </div>
        </div>
      )}

      <DeleteReasonModal
        open={showClearReason}
        onClose={() => setShowClearReason(false)}
        title="Clear Diagnosis"
        description="Removing all diagnoses requires a documented reason. This action is audit-logged."
        confirmLabel="Clear Diagnosis"
        onConfirm={async (reason) => {
          await onSave("", reason);
          savedValueRef.current = "";
          setContent("");
          setDirty(false);
          setShowClearReason(false);
        }}
      />
    </div>
  );
}
