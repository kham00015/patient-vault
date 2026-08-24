"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import {
  appendDiagnosis,
  diagnosisListHasCode,
  type Icd10Diagnosis,
} from "@/lib/icd10";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { cn } from "@/lib/utils";
import { Plus, Search } from "lucide-react";

export function AddDiagnosisModal({
  open,
  onClose,
  currentDiagnosis,
  onAdd,
  title = "Add diagnosis",
}: {
  open: boolean;
  onClose: () => void;
  /** Current problem list text (chart diagnosis / note PMH). */
  currentDiagnosis: string;
  /** Called after each diagnosis is appended; receives the full updated list. */
  onAdd: (nextDiagnosis: string, item: Icd10Diagnosis) => Promise<void> | void;
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Icd10Diagnosis[]>([]);
  const [total, setTotal] = useState(0);
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [addingCode, setAddingCode] = useState<string | null>(null);
  const [list, setList] = useState(currentDiagnosis);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setList(currentDiagnosis);
    setQuery("");
    setResults([]);
    setTotal(0);
    setExpandedQuery(null);
    setSearchError("");
    setError("");
    setAddingCode(null);
  }, [open, currentDiagnosis]);

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
    if (!open) return;
    debouncedSearch(query);
  }, [query, open, debouncedSearch]);

  async function addDiagnosis(item: Icd10Diagnosis) {
    if (diagnosisListHasCode(list, item.code)) return;
    setAddingCode(item.code);
    setError("");
    const next = appendDiagnosis(list, item.code, item.description);
    try {
      await onAdd(next, item);
      setList(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add diagnosis");
    } finally {
      setAddingCode(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} wide className="max-w-2xl">
      <p className="mb-3 text-sm text-[var(--pv-muted)]">
        Search ICD-10-CM and add diagnoses to PMH. They sync to the Diagnosis panel and to notes on or after this visit (not earlier notes).
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--pv-muted)]">
        ICD-10 search
      </label>
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pv-muted)]"
        />
        <Input
          className="!pl-9"
          autoFocus
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
      <p className="mt-1 text-[10px] text-[var(--pv-muted)]">
        NIH/NLM ICD-10-CM. Abbreviations like COPD, CHF, HTN expand automatically.
      </p>

      {(searching || searchError || results.length > 0 || (query.trim().length >= 2 && !searching)) && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel)]">
          {searching && <p className="px-3 py-2 text-xs text-[var(--pv-muted)]">Searching...</p>}
          {searchError && <p className="px-3 py-2 text-xs text-rose-400">{searchError}</p>}
          {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-[var(--pv-muted)]">
              No matches. Try a code (J44.1), full name, or common abbreviation (COPD, CHF).
            </p>
          )}
          {!searching &&
            results.map((item) => {
              const alreadyAdded = diagnosisListHasCode(list, item.code);
              const busy = addingCode === item.code;
              return (
                <button
                  key={item.code}
                  type="button"
                  disabled={alreadyAdded || busy || Boolean(addingCode)}
                  onClick={() => void addDiagnosis(item)}
                  className={cn(
                    "flex w-full items-start gap-2 border-b border-[var(--pv-border)]/80 px-3 py-2 text-left transition last:border-b-0",
                    alreadyAdded
                      ? "cursor-default opacity-50"
                      : "hover:bg-[var(--pv-btn)] hover:text-cyan-100"
                  )}
                >
                  <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-cyan-300">
                    {item.code}
                  </span>
                  <span className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--pv-fg-soft)]">
                    {item.description}
                  </span>
                  {!alreadyAdded && !busy && (
                    <Plus size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                  )}
                  {busy && (
                    <span className="shrink-0 text-[10px] uppercase text-[var(--pv-muted)]">Adding…</span>
                  )}
                  {alreadyAdded && (
                    <span className="shrink-0 text-[10px] uppercase text-[var(--pv-muted)]">Added</span>
                  )}
                </button>
              );
            })}
        </div>
      )}
      {total > results.length && results.length > 0 && (
        <p className="mt-1 text-[10px] text-[var(--pv-muted)]">
          Showing {results.length} of {total} matches — refine search to narrow results.
        </p>
      )}

      {list.trim() && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--pv-muted)]">
            Current list
          </p>
          <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--pv-border)] bg-[var(--pv-bg-deep)] px-3 py-2 text-xs text-[var(--pv-fg-soft)]">
            {list}
          </pre>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
