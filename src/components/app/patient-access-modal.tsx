"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

type ConsultantUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type Grant = {
  id: string;
  expiresAt: string;
  active: boolean;
  user: { id: string; name: string | null; email: string };
  grantedBy: { id: string; name: string | null; email: string };
};

const DURATIONS = [
  { days: 1 as const, label: "1 day" },
  { days: 7 as const, label: "1 week" },
  { days: 14 as const, label: "2 weeks" },
];

export function PatientAccessModal({
  open,
  onClose,
  patientId,
  patientName,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
}) {
  const [consultants, setConsultants] = useState<ConsultantUser[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [userId, setUserId] = useState("");
  const [durationDays, setDurationDays] = useState<1 | 7 | 14>(7);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const grantsData = await api<{ consultants: ConsultantUser[]; grants: Grant[] }>(
        `/api/patients/${patientId}/access-grants`
      );
      const list = grantsData.consultants ?? [];
      setConsultants(list);
      setGrants(grantsData.grants ?? []);
      if (!userId && list[0]) setUserId(list[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load access");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId]);

  async function grantAccess() {
    if (!userId) {
      setError("Choose a consultant");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`/api/patients/${patientId}/access-grants`, {
        method: "POST",
        json: { userId, durationDays },
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not grant access");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(grantId: string) {
    setSaving(true);
    setError("");
    try {
      await api(`/api/patients/${patientId}/access-grants/${grantId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke");
    } finally {
      setSaving(false);
    }
  }

  const selectClass =
    "w-full rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

  return (
    <Modal open={open} onClose={onClose} title={`Access — ${patientName}`} wide>
      <p className="mb-4 text-sm text-[var(--pv-muted)]">
        Grant a consultant documents-only access to this chart for a limited time. They can view and print
        documents; everything else stays locked.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="mb-5 space-y-3 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] p-4">
        <label className="block space-y-1.5">
          <span className="text-xs text-[var(--pv-muted-2)]">Consultant</span>
          <select className={selectClass} value={userId} onChange={(e) => setUserId(e.target.value)} disabled={loading}>
            <option value="">Select...</option>
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.name || c.email) + ` (${c.email})`}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-[var(--pv-muted-2)]">Duration</span>
          <select
            className={selectClass}
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value) as 1 | 7 | 14)}
          >
            {DURATIONS.map((d) => (
              <option key={d.days} value={d.days}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end">
          <Button variant="success" onClick={grantAccess} disabled={saving || loading || !userId}>
            {saving ? "Saving..." : "Grant access"}
          </Button>
        </div>
        {consultants.length === 0 && !loading && (
          <p className="text-xs text-[var(--pv-muted)]">
            No consultant users yet. Create one in Account security / Users with role CONSULTANT.
          </p>
        )}
      </div>

      <div className="max-h-[40vh] space-y-2 overflow-y-auto">
        {loading && <p className="text-sm text-[var(--pv-muted)]">Loading...</p>}
        {!loading && grants.length === 0 && (
          <p className="text-sm text-[var(--pv-muted)]">No grants for this chart yet.</p>
        )}
        {grants.map((g) => (
          <div
            key={g.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg-deep)] px-3 py-2"
          >
            <div className="min-w-0 text-sm">
              <p className="truncate text-[var(--pv-fg-soft)]">{g.user.name || g.user.email}</p>
              <p className="text-xs text-[var(--pv-muted)]">
                {g.active ? "Active" : "Expired"} · until {new Date(g.expiresAt).toLocaleString()}
              </p>
            </div>
            <Button className="!text-xs" disabled={saving} onClick={() => revoke(g.id)}>
              Revoke
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
