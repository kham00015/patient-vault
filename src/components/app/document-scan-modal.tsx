"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, ScanLine, Wifi } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onCaptured: (file: File, suggestedName: string) => void;
  defaultName?: string;
};

type ScannerInfo = { id: string; name: string };

type BridgeStatus = {
  ok: boolean;
  scannerCount?: number;
  scanners?: ScannerInfo[];
  error?: string;
  detail?: string;
};

const BRIDGE_API = "/api/scanner-bridge";
const SELECTED_SCANNER_KEY = "pv-selected-scanner-id";

function stampName(base?: string) {
  const stamp = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const cleaned = base?.trim() || "Scan";
  return `${cleaned} - ${stamp}`;
}

function base64ToFile(base64: string, fileName: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: mimeType || "image/jpeg" });
}

/** Convert BMP/PNG/etc to JPEG so uploads stay small and reliable. */
async function ensureJpegFile(file: File, baseName: string): Promise<File> {
  const lower = file.name.toLowerCase();
  if (file.type === "image/jpeg" || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return file;
  }
  if (!file.type.startsWith("image/") && !/\.(bmp|png|tif|tiff|gif)$/i.test(lower)) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) return file;
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function pickDefaultScanner(scanners: ScannerInfo[]) {
  if (scanners.length === 0) return "";
  try {
    const saved = window.localStorage.getItem(SELECTED_SCANNER_KEY);
    if (saved && scanners.some((s) => s.id === saved)) return saved;
  } catch {
    // ignore
  }
  const hp = scanners.find((s) => /hp/i.test(s.name));
  return hp?.id || scanners[0].id;
}

export function DocumentScanModal({ open, onClose, onCaptured, defaultName }: Props) {
  const [docName, setDocName] = useState("");
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [checking, setChecking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const localDev = isLocalDevHost();

  async function checkBridge() {
    setChecking(true);
    setError("");
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${BRIDGE_API}/status`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await res.json()) as BridgeStatus;
      if (!res.ok || !data.ok) {
        setStatus(null);
        setError(
          data.error ||
            data.detail ||
            "Scanner bridge is not running. In PowerShell run: npm run scanner-bridge"
        );
        return;
      }
      setStatus(data);
      const scanners = data.scanners ?? [];
      setSelectedId((prev) => {
        if (prev && scanners.some((s) => s.id === prev)) return prev;
        return pickDefaultScanner(scanners);
      });
    } catch (e) {
      setStatus(null);
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const msg = aborted
        ? "Timed out looking for the scanner bridge (8s)."
        : e instanceof Error
          ? e.message
          : "Connection failed";
      setError(
        `${msg} Start the bridge with npm run scanner-bridge, keep that window open, use http://localhost:3000, then Search again.`
      );
    } finally {
      window.clearTimeout(timer);
      setChecking(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setDocName(stampName(defaultName));
    setError("");
    void checkBridge();
  }, [open, defaultName]);

  function chooseScanner(id: string) {
    setSelectedId(id);
    try {
      window.localStorage.setItem(SELECTED_SCANNER_KEY, id);
    } catch {
      // ignore
    }
  }

  async function startScan() {
    if (!selectedId) {
      setError("Choose a scanner first.");
      return;
    }
    setScanning(true);
    setError("");
    try {
      const res = await fetch(`${BRIDGE_API}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: selectedId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        cancelled?: boolean;
        error?: string;
        detail?: string;
        fileName?: string;
        mimeType?: string;
        base64?: string;
      };

      if (data.cancelled) {
        setError("Scan cancelled.");
        return;
      }
      if (!res.ok || !data.ok || !data.base64) {
        throw new Error(data.error || data.detail || `Scan failed (${res.status})`);
      }

      const suggested = (docName.trim() || stampName(defaultName)).replace(/[\\/:*?"<>|]+/g, "-");
      const ext = (data.fileName?.split(".").pop() || "jpg").toLowerCase();
      const raw = base64ToFile(data.base64, `${suggested}.${ext}`, data.mimeType || "image/jpeg");
      const file = await ensureJpegFile(raw, suggested);
      onCaptured(file, suggested);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scan failed";
      setError(msg);
      void checkBridge();
    } finally {
      setScanning(false);
    }
  }

  const scanners = status?.scanners ?? [];
  const selectedName = scanners.find((s) => s.id === selectedId)?.name;

  return (
    <Modal open={open} onClose={onClose} title="Scan document" wide>
      <div className="space-y-3">
        <p className="text-xs text-[var(--pv-muted)]">
          Choose your scanner (for example the HP), put the page in, then click <strong>Scan now</strong>.
        </p>

        {!localDev && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Scanning works from <strong>http://localhost:3000</strong> on this PC (local app + bridge).
          </p>
        )}

        <Input
          className="!h-9 !text-sm"
          placeholder="Document name"
          value={docName}
          onChange={(e) => setDocName(e.target.value)}
          disabled={scanning}
        />

        <div className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] px-3 py-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[var(--pv-fg)]">
              <Wifi size={14} className={status?.ok ? "text-emerald-400" : "text-[var(--pv-muted)]"} />
              <span className="font-medium">
                {checking
                  ? "Searching for scanners..."
                  : status?.ok
                    ? `Connected · ${status.scannerCount ?? 0} scanner(s)`
                    : "Bridge not connected"}
              </span>
            </div>
            <Button
              className="!h-7 !gap-1 !px-2 !text-[11px]"
              disabled={checking || scanning}
              onClick={() => void checkBridge()}
            >
              <RefreshCw size={12} /> Search again
            </Button>
          </div>

          {status?.ok && scanners.length > 0 && (
            <label className="mt-3 block text-[var(--pv-muted)]">
              Scanner
              <select
                className="mt-1 w-full rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2 text-sm text-[var(--pv-fg)]"
                value={selectedId}
                disabled={scanning}
                onChange={(e) => chooseScanner(e.target.value)}
              >
                {scanners.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {status?.ok && scanners.length === 0 && (
            <p className="mt-2 text-amber-200/90">
              No scanners found. Check power/USB/driver, then Search again.
            </p>
          )}

          {!status?.ok && !checking && (
            <div className="mt-2 space-y-1 text-[var(--pv-muted-2)]">
              <p>Start the bridge and leave it open:</p>
              <code className="block rounded-md bg-black/30 px-2 py-1.5 text-[11px] text-cyan-200">
                npm run scanner-bridge
              </code>
              <p>Use http://localhost:3000, then Search again.</p>
            </div>
          )}
          {checking && (
            <p className="mt-2 text-[var(--pv-muted-2)]">Looking for the local scanner bridge…</p>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button className="!text-xs" disabled={scanning} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="success"
            className="!gap-1.5 !text-xs"
            disabled={scanning || !status?.ok || !selectedId}
            onClick={() => void startScan()}
          >
            <ScanLine size={14} />
            {scanning
              ? `Scanning${selectedName ? ` (${selectedName})` : ""}...`
              : "Scan now"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ScanDocumentButton({
  onCaptured,
  defaultName,
  className,
  disabled,
}: {
  onCaptured: (file: File, suggestedName: string) => void;
  defaultName?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        className={className ?? "!h-8 !gap-1.5 !text-xs"}
        disabled={disabled}
        onClick={() => setOpen(true)}
        title="Scan from a connected document scanner"
      >
        <ScanLine size={14} /> Scan
      </Button>
      <DocumentScanModal
        open={open}
        onClose={() => setOpen(false)}
        onCaptured={onCaptured}
        defaultName={defaultName}
      />
    </>
  );
}
