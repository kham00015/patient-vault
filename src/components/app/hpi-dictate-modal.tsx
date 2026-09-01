"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRightFromLine, Check, Copy, FolderOpen, Mic, Save, Square } from "lucide-react";

type HpiDictateMode = "new" | "new_with_review" | "follow_up";

type SavedItem = {
  id: string;
  source: string;
  visitKind: string | null;
  transcript: string;
  hpi: string;
  content: string;
  createdAt: string;
};

const TARGET_RATE = 16000;
const MAX_SECONDS = 1200; // 20 min

function mergeFloat32(chunks: Float32Array[]) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function downsample(buffer: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLen = Math.max(1, Math.round(buffer.length / ratio));
  const result = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(buffer.length - 1, i0 + 1);
    const t = src - i0;
    const a = buffer[i0] ?? 0;
    const b = buffer[i1] ?? 0;
    result[i] = a + (b - a) * t;
  }
  return result;
}

function floatTo16BitPCM(float32: Float32Array) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function peakLevel(samples: Float32Array) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i] ?? 0);
    if (v > peak) peak = v;
  }
  return peak;
}

function rmsLevel(samples: Float32Array) {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

async function openPreferredMicrophone(): Promise<{ stream: MediaStream; label: string }> {
  let probe: MediaStream | null = null;
  try {
    probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    /* continue */
  } finally {
    probe?.getTracks().forEach((t) => t.stop());
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((d) => d.kind === "audioinput" && d.deviceId);
  const powerMic = inputs.find((d) => /powermic/i.test(d.label));

  const attempts: MediaStreamConstraints[] = [];
  if (powerMic) {
    attempts.push({
      audio: {
        deviceId: { exact: powerMic.deviceId },
        channelCount: { ideal: 1 },
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  }
  attempts.push({
    audio: {
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getAudioTracks()[0];
      return { stream, label: track?.label || "Microphone" };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not open microphone");
}

function formatElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSaveWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function HpiDictateModal({
  open,
  onClose,
  patientId,
  onTransfer,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  onTransfer: (hpiText: string) => void;
}) {
  const [configured, setConfigured] = useState({ transcribe: true, bedrock: true });
  const [listening, setListening] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [status, setStatus] = useState("");
  const [transcript, setTranscript] = useState("");
  const [hpi, setHpi] = useState("");
  const [activeMode, setActiveMode] = useState<HpiDictateMode | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [previous, setPrevious] = useState<SavedItem[]>([]);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [micLabel, setMicLabel] = useState("");
  const [inputLevel, setInputLevel] = useState(0);

  const chunksRef = useRef<Float32Array[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const muteRef = useRef<GainNode | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const peakSeenRef = useRef(0);

  const stopCapture = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      muteRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    processorRef.current = null;
    sourceRef.current = null;
    muteRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    setListening(false);
    setInputLevel(0);
  }, []);

  useEffect(() => {
    if (!open) {
      stopCapture();
      return;
    }
    let cancelled = false;
    setError("");
    setTranscript("");
    setHpi("");
    setActiveMode(null);
    setCopied(false);
    setSaved(false);
    setStatus("");
    setElapsedSec(0);
    setProcessing(false);
    setDrafting(false);
    setShowPrevious(false);
    setMicLabel("");
    setInputLevel(0);
    stoppingRef.current = false;

    api<{
      transcribeConfigured: boolean;
      bedrockConfigured: boolean;
    }>(`/api/patients/${patientId}/ai/dictate-hpi`)
      .then((data) => {
        if (cancelled) return;
        setConfigured({
          transcribe: data.transcribeConfigured,
          bedrock: data.bedrockConfigured,
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load dictation status");
        }
      });

    return () => {
      cancelled = true;
      stopCapture();
    };
  }, [open, patientId, stopCapture]);

  async function startDictating() {
    setError("");
    setTranscript("");
    setHpi("");
    setActiveMode(null);
    setCopied(false);
    setSaved(false);
    setStatus("Opening microphone…");
    setInputLevel(0);
    chunksRef.current = [];
    peakSeenRef.current = 0;
    stoppingRef.current = false;

    try {
      const { stream, label } = await openPreferredMicrophone();
      setMicLabel(label);

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioCtx();
      if (context.state === "suspended") await context.resume();

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        chunksRef.current.push(copy);
        const peak = peakLevel(copy);
        peakSeenRef.current = Math.max(peakSeenRef.current, peak);
        setInputLevel((prev) => Math.max(peak, prev * 0.85));
      };

      const mute = context.createGain();
      mute.gain.value = 0;
      source.connect(processor);
      processor.connect(mute);
      mute.connect(context.destination);

      streamRef.current = stream;
      contextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
      muteRef.current = mute;
      startedAtRef.current = Date.now();
      setListening(true);
      setElapsedSec(0);
      setStatus("Dictating… speak your HPI, then press Done");
      timerRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSec(sec);
        if (sec >= MAX_SECONDS) void finishDictation();
      }, 250);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Microphone access denied. Allow mic permission and try again."
      );
      setStatus("");
      stopCapture();
    }
  }

  async function finishDictation() {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    const context = contextRef.current;
    const sampleRate = context?.sampleRate ?? 48000;
    const chunks = chunksRef.current.slice();
    const peakSeen = peakSeenRef.current;
    stopCapture();

    if (chunks.length === 0) {
      setError("No audio captured. Try again.");
      setStatus("");
      stoppingRef.current = false;
      return;
    }

    const merged = mergeFloat32(chunks);
    if (peakSeen < 0.008 && rmsLevel(merged) < 0.002) {
      setError("Microphone stayed silent. Check the mic and try again.");
      setStatus("");
      stoppingRef.current = false;
      return;
    }

    setProcessing(true);
    setStatus("Transcribing with AssemblyAI…");
    try {
      const down = downsample(merged, sampleRate, TARGET_RATE);
      const pcm = floatTo16BitPCM(down);
      const body = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);

      const res = await fetch(`/api/patients/${patientId}/ai/dictate-hpi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Sample-Rate": String(TARGET_RATE),
        },
        body,
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Dictation failed (${res.status})`);

      setTranscript(typeof data.transcript === "string" ? data.transcript : "");
      setHpi("");
      setActiveMode(null);
      setStatus("Choose a draft mode — or Save the raw transcript for later");
    } catch (e) {
      setError(e instanceof Error ? e.message : "HPI dictation failed");
      setStatus("");
    } finally {
      setProcessing(false);
      stoppingRef.current = false;
    }
  }

  async function runMode(mode: HpiDictateMode) {
    if (!transcript.trim() || drafting) return;
    setError("");
    setDrafting(true);
    setActiveMode(mode);
    setHpi("");
    setStatus(
      mode === "new"
        ? "Drafting new-patient HPI from dictation…"
        : mode === "new_with_review"
          ? "Reviewing full chart + drafting HPI from dictation…"
          : "Drafting follow-up HPI from dictation…"
    );
    try {
      const data = await api<{ hpi: string; mode: HpiDictateMode }>(
        `/api/patients/${patientId}/ai/dictate-hpi/process`,
        {
          method: "POST",
          json: { mode, source: "dictate", transcript },
        }
      );
      setHpi(data.hpi ?? "");
      setStatus("Done — Transfer into HPI, or Save for later");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft HPI");
      setStatus("Choose how to draft the HPI from your dictation");
    } finally {
      setDrafting(false);
    }
  }

  async function saveCurrent() {
    if (!transcript.trim() && !hpi.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/patients/${patientId}/ai-listen-saves`, {
        method: "POST",
        json: {
          transcript,
          hpi,
          source: "dictate",
          visitKind:
            activeMode === "new" || activeMode === "new_with_review"
              ? "NEW_PATIENT"
              : activeMode === "follow_up"
                ? "FOLLOW_UP"
                : null,
        },
      });
      setSaved(true);
      setStatus(
        hpi.trim()
          ? "Saved — reopen anytime from Previous"
          : "Saved raw transcript — reopen from Previous to choose a draft mode"
      );
      window.setTimeout(() => setSaved(false), 2000);
      if (showPrevious) await loadPrevious();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function loadPrevious() {
    setLoadingPrevious(true);
    setError("");
    try {
      const data = await api<{ saves: SavedItem[] }>(
        `/api/patients/${patientId}/ai-listen-saves?source=dictate`
      );
      setPrevious(data.saves);
      setShowPrevious(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load previous saves");
    } finally {
      setLoadingPrevious(false);
    }
  }

  function openPrevious(save: SavedItem) {
    setTranscript(save.transcript || "");
    setHpi(save.hpi || "");
    setActiveMode(null);
    setShowPrevious(false);
    setStatus(
      save.hpi.trim()
        ? "Loaded previous save — you can re-run a draft mode on the transcript"
        : "Loaded raw transcript — choose a draft mode"
    );
  }

  async function copyHpi() {
    if (!hpi.trim()) return;
    try {
      await navigator.clipboard.writeText(hpi);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  function transfer() {
    if (!hpi.trim()) return;
    onTransfer(hpi);
    onClose();
  }

  const levelPct = Math.min(100, Math.round(inputLevel * 220));
  const canChooseMode = Boolean(transcript.trim()) && !listening && !processing && !drafting;
  const canSave = Boolean(transcript.trim() || hpi.trim());

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Dictate HPI"
      wide
      closeOnBackdrop={false}
      closeOnEscape={false}
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--pv-muted)]">
          Dictate your HPI, press Done, then choose a draft mode — or Save the raw transcript and
          reopen it later from Previous.
        </p>

        {(!configured.transcribe || !configured.bedrock) && (
          <p className="text-sm text-amber-300">
            {!configured.transcribe && !configured.bedrock
              ? "Set ASSEMBLYAI_API_KEY and AWS Bedrock credentials."
              : !configured.transcribe
                ? "AssemblyAI is not configured. Add ASSEMBLYAI_API_KEY to .env.local."
                : "Bedrock is not configured."}
          </p>
        )}

        {micLabel && <p className="text-xs text-[var(--pv-muted)]">Mic: {micLabel}</p>}

        {(listening || processing) && (
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--pv-border)]">
              <div
                className="h-full rounded-full bg-cyan-400 transition-[width]"
                style={{ width: `${levelPct}%` }}
              />
            </div>
            <span className="tabular-nums text-xs text-[var(--pv-muted)]">
              {formatElapsed(elapsedSec)}
            </span>
          </div>
        )}

        {status && <p className="text-sm text-cyan-300">{status}</p>}
        {error && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!listening && !processing && (
            <Button
              variant="primary"
              className="!gap-1.5"
              disabled={!configured.transcribe || drafting}
              onClick={() => void startDictating()}
            >
              <Mic size={14} /> {transcript ? "Re-dictate" : "Start dictating"}
            </Button>
          )}
          {listening && (
            <Button variant="primary" className="!gap-1.5" onClick={() => void finishDictation()}>
              <Square size={14} /> Done
            </Button>
          )}
          <Button
            variant="ghost"
            className="!gap-1.5"
            disabled={listening || processing || drafting || loadingPrevious}
            onClick={() => void (showPrevious ? setShowPrevious(false) : loadPrevious())}
          >
            <FolderOpen size={14} />
            {loadingPrevious ? "Loading…" : showPrevious ? "Hide previous" : "Previous"}
          </Button>
        </div>

        {showPrevious && (
          <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--pv-border)]">
            {previous.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-[var(--pv-muted)]">
                No saved dictations yet.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--pv-border)]">
                {previous.map((save) => (
                  <li key={save.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-[var(--pv-hover)]"
                      onClick={() => openPrevious(save)}
                    >
                      <span className="text-sm text-[var(--pv-fg-soft)]">
                        {formatSaveWhen(save.createdAt)}
                        {save.hpi.trim() ? " · has HPI draft" : " · raw transcript"}
                      </span>
                      <span className="truncate text-xs text-[var(--pv-muted)]">
                        {(save.transcript || save.hpi).slice(0, 120)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {transcript && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
              Raw transcript
            </p>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="!min-h-[5rem] !text-xs text-[var(--pv-muted-2)]"
            />
          </div>
        )}

        {canChooseMode && (
          <div className="flex flex-wrap gap-2">
            <Button className="!text-xs" onClick={() => void runMode("new")}>
              Transcribe as new
            </Button>
            <Button className="!text-xs" onClick={() => void runMode("new_with_review")}>
              Transcribe as new with review
            </Button>
            <Button className="!text-xs" onClick={() => void runMode("follow_up")}>
              Transcribe as follow-up
            </Button>
          </div>
        )}

        {drafting && (
          <p className="py-4 text-center text-sm text-cyan-300">
            {activeMode === "new_with_review"
              ? "Reviewing chart and drafting with Bedrock…"
              : "Drafting with Bedrock…"}
          </p>
        )}

        {hpi && !drafting && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
              {activeMode === "new"
                ? "New patient HPI draft"
                : activeMode === "new_with_review"
                  ? "New patient HPI draft (with chart review)"
                  : activeMode === "follow_up"
                    ? "Follow-up HPI draft"
                    : "HPI draft"}
            </p>
            <Textarea
              value={hpi}
              onChange={(e) => setHpi(e.target.value)}
              className="!min-h-[12rem] !text-sm leading-relaxed pv-ai-text"
            />
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="primary"
            className="!gap-1.5"
            disabled={!canSave || saving || listening || processing || drafting}
            onClick={() => void saveCurrent()}
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </Button>
          <Button
            variant="ghost"
            className="!gap-1.5"
            disabled={!hpi.trim() || drafting}
            onClick={() => void copyHpi()}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            className="!gap-1.5 pv-ai-btn"
            disabled={!hpi.trim() || drafting}
            onClick={transfer}
            title="Append this draft to HPI in the AI color"
          >
            <ArrowRightFromLine size={14} />
            Transfer
          </Button>
          <Button
            variant="ghost"
            disabled={processing || drafting}
            onClick={() => {
              stopCapture();
              onClose();
            }}
          >
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
