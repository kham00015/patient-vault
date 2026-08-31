"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DeleteReasonModal } from "@/components/app/delete-reason-modal";
import {
  COMMON_ORDER_PRESETS,
  ORDER_CATEGORIES,
  ORDER_PRIORITIES,
  ORDER_STATUSES,
  type OrderDTO,
} from "@/lib/orders";
import { formatEncounterLabel } from "@/lib/encounters";
import { cn, formatDateOnly } from "@/lib/utils";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";

type OrdersPanelProps = {
  patientId: string;
  encounterId?: string;
  isReadOnly: boolean;
  canRemoveRecords?: boolean;
  showEncounterContext?: boolean;
  compact?: boolean;
  initialOrders?: OrderDTO[];
  onMutate?: () => Promise<void> | void;
};

type CatalogHit = {
  code: string;
  name: string;
  category: "LAB" | "IMAGING";
};

const statusStyles: Record<string, string> = {
  ORDERED: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  SCHEDULED: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  COMPLETED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  REVIEWED: "border-cyan-500/40 bg-cyan-500/10 text-[var(--pv-accent-strong)]",
  CANCELLED: "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200",
};

const ORDER_SELECT_CLASS =
  "h-10 rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 text-sm text-[var(--pv-fg)] outline-none focus:border-[var(--pv-accent-strong)]";

const ORDER_CHIP_ACTIVE =
  "border-[var(--pv-accent-strong)] bg-[color-mix(in_srgb,var(--pv-accent)_14%,transparent)] text-[var(--pv-accent-strong)]";

const ORDER_CHIP_IDLE =
  "border-[var(--pv-border)] bg-[var(--pv-card)] text-[var(--pv-muted-2)] hover:border-[var(--pv-accent-strong)] hover:text-[var(--pv-accent-strong)]";

const ORDERS_MUTATED_EVENT = "patient-vault:orders-mutated";

function labelFor<T extends string>(items: { value: T; label: string }[], value: T) {
  return items.find((item) => item.value === value)?.label ?? value;
}

export function OrdersPanel({
  patientId,
  encounterId,
  isReadOnly,
  canRemoveRecords,
  showEncounterContext,
  compact,
  initialOrders,
  onMutate,
}: OrdersPanelProps) {
  const [orders, setOrders] = useState<OrderDTO[]>(initialOrders ?? []);
  const [category, setCategory] = useState<OrderDTO["category"]>("LAB");
  const [name, setName] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [priority, setPriority] = useState<OrderDTO["priority"]>("ROUTINE");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState<"ALL" | OrderDTO["category"]>("ALL");
  const [catalogResults, setCatalogResults] = useState<CatalogHit[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = encounterId ? `?encounterId=${encodeURIComponent(encounterId)}` : "";
    const data = await api<{ orders: OrderDTO[] }>(`/api/patients/${patientId}/orders${qs}`);
    setOrders(data.orders);
  }, [patientId, encounterId]);

  useEffect(() => {
    if (initialOrders) setOrders(initialOrders);
  }, [initialOrders]);

  useEffect(() => {
    load().catch(() => setError("Could not load orders."));
  }, [load]);

  useEffect(() => {
    function onOrdersMutated(event: Event) {
      const detail = (event as CustomEvent<{ patientId?: string }>).detail;
      if (detail?.patientId && detail.patientId !== patientId) return;
      load().catch(() => undefined);
    }

    window.addEventListener(ORDERS_MUTATED_EVENT, onOrdersMutated);
    return () => window.removeEventListener(ORDERS_MUTATED_EVENT, onOrdersMutated);
  }, [load, patientId]);

  function broadcastOrdersMutated() {
    window.dispatchEvent(new CustomEvent(ORDERS_MUTATED_EVENT, { detail: { patientId } }));
  }

  const runSearch = useCallback(
    async (term: string, selectedCategory: OrderDTO["category"]) => {
      if (term.trim().length < 2) {
        setCatalogResults([]);
        setCatalogTotal(0);
        setExpandedQuery(null);
        setSearchError("");
        return;
      }

      const catalogCategory =
        selectedCategory === "LAB" || selectedCategory === "IMAGING" ? selectedCategory : "ALL";

      setSearching(true);
      setSearchError("");
      try {
        const data = await api<{ total: number; results: CatalogHit[]; expandedQuery?: string }>(
          `/api/orders/search?q=${encodeURIComponent(term.trim())}&category=${catalogCategory}&count=25`
        );
        setCatalogResults(data.results);
        setCatalogTotal(data.total);
        setExpandedQuery(data.expandedQuery ?? null);
      } catch {
        setCatalogResults([]);
        setCatalogTotal(0);
        setSearchError("Catalog search unavailable. You can still type a custom order name.");
      } finally {
        setSearching(false);
      }
    },
    []
  );

  const { debounced: debouncedSearch } = useDebouncedCallback(
    (term: string) => runSearch(term, category),
    300
  );

  useEffect(() => {
    if (code) return; // locked to a catalog pick — don't keep searching
    debouncedSearch(name);
  }, [name, category, code, debouncedSearch]);

  const visibleOrders = useMemo(
    () => orders.filter((order) => filter === "ALL" || order.category === filter),
    [orders, filter]
  );

  const presets = COMMON_ORDER_PRESETS.filter((preset) => preset.category === category).slice(0, 12);
  const openCount = orders.filter((o) => !["REVIEWED", "CANCELLED"].includes(o.status)).length;
  const catalogEnabled = category === "LAB" || category === "IMAGING";
  const showCatalogResults =
    catalogEnabled &&
    !code &&
    (searching || !!searchError || catalogResults.length > 0 || name.trim().length >= 2);

  function pickCatalogItem(item: CatalogHit) {
    setCategory(item.category);
    setName(item.name);
    setCode(item.code);
    setCatalogResults([]);
    setCatalogTotal(0);
    setExpandedQuery(null);
    setSearchError("");
  }

  function onNameChange(value: string) {
    setName(value);
    setCode(null);
  }

  async function createOrder() {
    if (!name.trim()) {
      setError("Enter an order name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`/api/patients/${patientId}/orders`, {
        method: "POST",
        json: {
          encounterId: encounterId ?? null,
          category,
          name,
          code,
          priority,
          expectedAt: expectedAt || null,
          notes,
        },
      });
      setName("");
      setCode(null);
      setExpectedAt("");
      setNotes("");
      setCatalogResults([]);
      setCatalogTotal(0);
      setExpandedQuery(null);
      await load();
      await onMutate?.();
      broadcastOrdersMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create order.");
    } finally {
      setSaving(false);
    }
  }

  async function updateOrder(orderId: string, patch: Partial<Pick<OrderDTO, "status" | "priority" | "notes">>) {
    await api(`/api/patients/${patientId}/orders/${orderId}`, { method: "PATCH", json: patch });
    await load();
    await onMutate?.();
    broadcastOrdersMutated();
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", compact && "mt-1.5 rounded-md border border-[var(--pv-border)] bg-[var(--pv-card)]/80 p-2")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className={cn("font-semibold text-[var(--pv-accent-strong)]", compact ? "text-xs" : "text-sm")}>
            <ClipboardCheck size={16} className="mr-1 inline" /> Orders
          </h2>
          <p className="text-xs text-[var(--pv-muted)]">
            {openCount} open · {orders.length} total
            {encounterId ? " for this encounter" : " across this patient"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(["ALL", ...ORDER_CATEGORIES.map((c) => c.value)] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition",
                filter === value ? ORDER_CHIP_ACTIVE : ORDER_CHIP_IDLE
              )}
            >
              {value === "ALL" ? "All" : labelFor(ORDER_CATEGORIES, value)}
            </button>
          ))}
        </div>
      </div>

      {!isReadOnly && (
        <div className={cn("mb-4 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] p-3", compact && "rounded-md p-2")}>
          <div className="grid gap-2 md:grid-cols-[130px_1fr_120px_150px_auto]">
            <select
              className={ORDER_SELECT_CLASS}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as OrderDTO["category"]);
                setCode(null);
                setCatalogResults([]);
                setExpandedQuery(null);
              }}
            >
              {ORDER_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--pv-muted)]"
              />
              <Input
                className="!pl-9"
                placeholder={
                  category === "LAB"
                    ? "Search or type lab (BMP, TSH, autoimmune...)"
                    : category === "IMAGING"
                      ? "Search or type imaging (chest x-ray, CT...)"
                      : "Type order name"
                }
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim() && !saving) {
                    e.preventDefault();
                    createOrder();
                  }
                }}
              />
            </div>
            <select
              className={ORDER_SELECT_CLASS}
              value={priority}
              onChange={(e) => setPriority(e.target.value as OrderDTO["priority"])}
            >
              {ORDER_PRIORITIES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <Input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} title="Expected date" />
            <Button variant="success" disabled={saving || !name.trim()} onClick={createOrder}>
              <Plus size={14} /> {saving ? "Adding..." : "Add"}
            </Button>
          </div>

          {code && (
            <p className="mt-1.5 text-[10px] text-[var(--pv-accent-strong)]">
              Catalog code <span className="font-mono">{code}</span> — edit the name to search again.
            </p>
          )}
          {expandedQuery && showCatalogResults && catalogResults.length > 0 && (
            <p className="mt-1.5 text-[10px] text-[var(--pv-muted)]">
              Also searched as: {expandedQuery}
            </p>
          )}

          {showCatalogResults && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--pv-border)] bg-[var(--pv-surface)]">
              {searching && <p className="px-3 py-2 text-xs text-[var(--pv-muted)]">Searching...</p>}
              {searchError && <p className="px-3 py-2 text-xs text-rose-300">{searchError}</p>}
              {!searching && !searchError && name.trim().length >= 2 && catalogResults.length === 0 && (
                <p className="px-3 py-2 text-xs text-[var(--pv-muted)]">
                  No catalog matches — press Add to save as a custom order.
                </p>
              )}
              {!searching &&
                catalogResults.map((item) => (
                  <button
                    key={`${item.category}:${item.code}:${item.name}`}
                    type="button"
                    onClick={() => pickCatalogItem(item)}
                    className="flex w-full items-start gap-2 border-b border-[var(--pv-border)]/80 px-3 py-2 text-left transition last:border-b-0 hover:bg-[var(--pv-btn)]"
                  >
                    <span className="shrink-0 rounded bg-[color-mix(in_srgb,var(--pv-accent)_12%,transparent)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--pv-accent-strong)]">
                      {item.code}
                    </span>
                    <span className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--pv-fg-soft)]">{item.name}</span>
                    <Plus size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                  </button>
                ))}
            </div>
          )}
          {catalogTotal > catalogResults.length && showCatalogResults && catalogResults.length > 0 && (
            <p className="mt-1 text-[10px] text-[var(--pv-muted)]">
              Showing {catalogResults.length} of {catalogTotal} — refine search to narrow.
            </p>
          )}

          {presets.length > 0 && (
            <div className="mt-2">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--pv-muted)]">
                Common {category === "LAB" ? "labs" : category === "IMAGING" ? "imaging" : "orders"}
              </p>
              <div className="flex flex-wrap gap-1">
                {presets.map((preset) => (
                  <button
                    key={`${preset.category}:${preset.name}`}
                    type="button"
                    className={cn(
                      "rounded-full border px-2 py-1 text-[10px] transition",
                      code === (preset.code ?? null) && name === preset.name
                        ? ORDER_CHIP_ACTIVE
                        : ORDER_CHIP_IDLE
                    )}
                    onClick={() => {
                      setName(preset.name);
                      setCode(preset.code ?? null);
                      setCatalogResults([]);
                      setExpandedQuery(null);
                    }}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Textarea
            className="mt-2 !min-h-[58px] !text-xs"
            placeholder="Optional notes: location, instructions, reason, prior authorization..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      )}

      {error && <p className="mb-2 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}

      <div className="space-y-2">
        {visibleOrders.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--pv-border)] px-4 py-6 text-center text-sm text-[var(--pv-muted)]">
            No orders tracked yet.
          </p>
        )}
        {visibleOrders.map((order) => (
          <div key={order.id} className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[var(--pv-fg)]">{order.name}</span>
                  <span className="rounded bg-[var(--pv-btn)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--pv-muted-2)]">
                    {labelFor(ORDER_CATEGORIES, order.category)}
                  </span>
                  {order.code && (
                    <span className="rounded bg-[color-mix(in_srgb,var(--pv-accent)_12%,transparent)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--pv-accent-strong)]">
                      {order.code}
                    </span>
                  )}
                  <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", statusStyles[order.status])}>
                    {labelFor(ORDER_STATUSES, order.status)}
                  </span>
                  {order.priority !== "ROUTINE" && (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                      {labelFor(ORDER_PRIORITIES, order.priority)}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-[var(--pv-muted)]">
                  Ordered {formatDateOnly(order.orderedAt)}
                  {order.expectedAt && <> · expected {formatDateOnly(order.expectedAt)}</>}
                  {order.completedAt && <> · completed {formatDateOnly(order.completedAt)}</>}
                  {order.reviewedAt && <> · reviewed {formatDateOnly(order.reviewedAt)}</>}
                </div>
                {showEncounterContext && order.encounter && (
                  <div className="mt-1 text-[10px] text-[var(--pv-muted)]">
                    {formatEncounterLabel(order.encounter.visitCategory, order.encounter.modality)} · {formatDateOnly(order.encounter.date)}
                  </div>
                )}
                {order.notes && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--pv-muted-2)]">{order.notes}</p>
                )}
              </div>
              {!isReadOnly && (
                <div className="flex flex-wrap items-center gap-1">
                  <select
                    className="h-8 rounded border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-2 text-xs text-[var(--pv-fg)] outline-none focus:border-[var(--pv-accent-strong)]"
                    value={order.status}
                    onChange={(e) => updateOrder(order.id, { status: e.target.value as OrderDTO["status"] }).catch(() => undefined)}
                  >
                    {ORDER_STATUSES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  {canRemoveRecords && (
                    <Button variant="danger" className="!h-8 !px-2 !text-xs" onClick={() => setDeleteOrderId(order.id)}>
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <DeleteReasonModal
        open={!!deleteOrderId}
        onClose={() => setDeleteOrderId(null)}
        title="Delete Order"
        description="Deleting an order is permanent and audit-logged. Provide a documented reason."
        confirmLabel="Delete Order"
        onConfirm={async (reason) => {
          if (!deleteOrderId) return;
          await api(`/api/patients/${patientId}/orders/${deleteOrderId}`, {
            method: "DELETE",
            json: { reason },
          });
          setDeleteOrderId(null);
          await load();
          await onMutate?.();
          broadcastOrdersMutated();
        }}
      />
    </div>
  );
}
