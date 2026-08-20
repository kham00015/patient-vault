"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SignaturePad } from "@/components/app/signature-pad";

export function ProviderProfileMenu({
  displayName,
  className,
}: {
  displayName: string;
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!signing) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    api<{ signatureImage: string | null }>("/api/me/signature")
      .then((data) => {
        if (cancelled) return;
        setSaved(data.signatureImage);
        setDraft(data.signatureImage ?? "");
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load signature.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signing]);

  async function saveSignature() {
    setSaving(true);
    setError("");
    try {
      const data = await api<{ signatureImage: string | null }>("/api/me/signature", {
        method: "PATCH",
        json: { signatureImage: draft.trim() || null },
      });
      setSaved(data.signatureImage);
      setSigning(false);
      setMenuOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save signature.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        title="Open profile"
        onClick={() => {
          setMenuOpen(true);
          setSigning(false);
          setError("");
        }}
      >
        {displayName}
      </button>

      <Modal
        open={menuOpen}
        onClose={() => {
          setMenuOpen(false);
          setSigning(false);
        }}
        title={displayName}
      >
        {!signing ? (
          <div className="space-y-3">
            <Button
              type="button"
              className="w-full"
              onClick={() => setSigning(true)}
            >
              Signature
            </Button>
            {saved ? (
              <p className="text-xs text-[var(--pv-muted)]">A signature is saved for note PDFs.</p>
            ) : (
              <p className="text-xs text-[var(--pv-muted)]">
                Draw a signature to place at the bottom of your note PDFs.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--pv-muted-2)]">
              Draw your signature. It will appear at the bottom of notes PDFs.
            </p>
            {loading ? (
              <p className="text-sm text-[var(--pv-muted)]">Loading…</p>
            ) : (
              <SignaturePad value={draft} onChange={setDraft} strokeColor="#0f172a" />
            )}
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSigning(false);
                  setError("");
                }}
              >
                Back
              </Button>
              <Button type="button" disabled={saving || loading} onClick={() => void saveSignature()}>
                {saving ? "Saving…" : "Save signature"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
