"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, Copy, Mic, Save, Square } from "lucide-react";
import type { HpiVisitKind } from "@/lib/hpi-visit-context";

type VisitInfo = {
  kind: HpiVisitKind;
  reason: string;
  encounterId: string | null;
  visitCategory: HpiVisitKind | null;
};

const TARGET_RATE = 16000;
const MAX_SECONDS = 360;

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

/** Prefer PowerMic II when present; otherwise OS default mic. */
async function openPreferredMicrophone(): Promise<{ stream: MediaStream; label: string }> {
  // Need a temporary permission grant before labels are visible on some browsers.
  let probe: MediaStream | null = null;
  try {
    probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    /* continue — enumerate may still work if previously granted */
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
        autoGainControl: true,
      },
      video: false,
    });
  }
  attempts.push(
    {
      audio: {
        deviceId: { ideal: "default" },
        channelCount: { ideal: 1 },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    },
    {
      audio: {
        deviceId: "default",
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    },
    { audio: true, video: false }
  );

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getAudioTracks()[0];
      if (!track) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("No audio track from microphone");
      }
      track.enabled = true;
      const label = track.label || powerMic?.label || "Default microphone";
      return { stream, label };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not open the PowerMic / default microphone");
}

export function AiListenModal({
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
  const [visit, setVisit] = useState<VisitInfo | null>(null);
  const [visitOverride, setVisitOverride] = useState<HpiVisitKind | null>(null);
  const [configured, setConfigured] = useState({ transcribe: true, bedrock: true });
  const [listening, setListening] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [transcript, setTranscript] = useState("");
  const [hpi, setHpi] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
    setCopied(false);
    setSaved(false);
    setStatus("");
    setElapsedSec(0);
    setVisitOverride(null);
    setProcessing(false);
    setMicLabel("");
    setInputLevel(0);
    stoppingRef.current = false;

    api<{
      visit: VisitInfo;
      transcribeConfigured: boolean;
      bedrockConfigured: boolean;
    }>(`/api/patients/${patientId}/ai/listen`)
      .then((data) => {
        if (cancelled) return;
        setVisit(data.visit);
        setConfigured({
          transcribe: data.transcribeConfigured,
          bedrock: data.bedrockConfigured,
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load visit type");
        }
      });

    return () => {
      cancelled = true;
      stopCapture();
    };
  }, [open, patientId, stopCapture]);

  async function startListening() {
    setError("");
    setTranscript("");
    setHpi("");
    setCopied(false);
    setSaved(false);
    setStatus("Opening default microphone…");
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
      if (context.state === "suspended") {
        await context.resume();
      }

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input);
        chunksRef.current.push(copy);
        const peak = peakLevel(copy);
        if (peak > peakSeenRef.current) peakSeenRef.current = peak;
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
      setStatus("Listening… speak clearly toward the mic");
      timerRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSec(sec);
        if (sec >= MAX_SECONDS) {
          void stopAndProcess();
        }
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

  async function stopAndProcess() {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    const context = contextRef.current;
    const sampleRate = context?.sampleRate ?? 48000;
    const chunks = [...chunksRef.current];
    const peakSeen = peakSeenRef.current;
    stopCapture();

    if (chunks.length === 0) {
      setError("No audio captured. Check Windows default microphone and try again.");
      setStatus("");
      stoppingRef.current = false;
      return;
    }

    const merged = mergeFloat32(chunks);
    if (peakSeen < 0.008 && rmsLevel(merged) < 0.002) {
      setError(
        "Microphone stayed silent. Set your default mic in Windows Sound settings, then try again."
      );
      setStatus("");
      stoppingRef.current = false;
      return;
    }

    setProcessing(true);
    setStatus("Transcribing with Amazon Transcribe Medical…");
    try {
      const down = downsample(merged, sampleRate, TARGET_RATE);
      const pcm = floatTo16BitPCM(down);
      const body = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      const visitKind = visitOverride ?? visit?.kind ?? "FOLLOW_UP";

      const headers = new Headers({
        "Content-Type": "application/octet-stream",
        "X-Sample-Rate": String(TARGET_RATE),
        "X-Visit-Kind": visitKind,
      });

      const res = await fetch(`/api/patients/${patientId}/ai/listen`, {
        method: "POST",
        headers,
        body,
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `AI Listen failed (${res.status})`);
      }

      setTranscript(typeof data.transcript === "string" ? data.transcript : "");
      setHpi(typeof data.hpi === "string" ? data.hpi : "");
      if (data.visit) setVisit(data.visit as VisitInfo);
      setStatus("Done — review and copy into the note");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI Listen failed");
      setStatus("");
    } finally {
      setProcessing(false);
      stoppingRef.current = false;
    }
  }

  async function saveAsText() {
    if (!transcript.trim() && !hpi.trim()) return;
    const visitKind = visitOverride ?? visit?.kind ?? null;
    setSaving(true);
    setError("");
    try {
      await api(`/api/patients/${patientId}/ai-listen-saves`, {
        method: "POST",
        json: {
          transcript,
          hpi,
          visitKind,
        },
      });
      setSaved(true);
      setStatus("Saved — open the patient name to view dated Listen texts");
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save Listen text");
    } finally {
      setSaving(false);
    }
  }

  const effectiveKind = visitOverride ?? visit?.kind ?? null;
  const levelPct = Math.min(100, Math.round(inputLevel * 220));
  const canSave = Boolean(transcript.trim() || hpi.trim());

  return (
    <Modal open={open} onClose={onClose} title={`AI Listen — ${patientName}`} wide>
      <div className="space-y-4">
        <p className="text-sm text-[var(--pv-muted)]">
          Record the visit conversation. Prefers PowerMic II when connected, otherwise your default
          microphone. Amazon Transcribe Medical produces a transcript, then Bedrock drafts an HPI.
        </p>

        <div className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
            Visit type for HPI
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={effectiveKind === "NEW_PATIENT" ? "primary" : "ghost"}
              className="!py-1.5 !text-xs"
              disabled={listening || processing}
              onClick={() => setVisitOverride("NEW_PATIENT")}
            >
              New patient HPI
            </Button>
            <Button
              type="button"
              variant={effectiveKind === "FOLLOW_UP" ? "primary" : "ghost"}
              className="!py-1.5 !text-xs"
              disabled={listening || processing}
              onClick={() => setVisitOverride("FOLLOW_UP")}
            >
              Follow-up HPI
            </Button>
          </div>
          {visit && (
            <p className="mt-2 text-xs text-[var(--pv-fg-soft)]">
              Detected: {visit.kind === "NEW_PATIENT" ? "New patient" : "Follow-up"} — {visit.reason}
            </p>
          )}
        </div>

        {(!configured.transcribe || !configured.bedrock) && (
          <p className="text-sm text-amber-300">
            {!configured.transcribe && !configured.bedrock
              ? "AWS credentials needed for Transcribe Medical and Bedrock."
              : !configured.transcribe
                ? "Transcribe Medical is not configured (AWS credentials / IAM)."
                : "Bedrock is not configured."}
          </p>
        )}

        {(micLabel || listening) && (
          <div className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
              Microphone
            </p>
            <p className="mt-1 text-sm text-[var(--pv-fg-soft)]">
              {micLabel || "Default microphone"}
            </p>
            {listening && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--pv-border)]">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-[width] duration-100"
                  style={{ width: `${levelPct}%` }}
                />
              </div>
            )}
            {listening && levelPct < 3 && (
              <p className="mt-2 text-xs text-amber-300">
                Level is flat — speak louder or check the Windows default mic.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!listening ? (
            <Button
              type="button"
              variant="primary"
              disabled={processing}
              onClick={() => void startListening()}
            >
              <Mic size={14} /> Start listening
            </Button>
          ) : (
            <Button type="button" variant="danger" onClick={() => void stopAndProcess()}>
              <Square size={14} /> Stop &amp; draft HPI
            </Button>
          )}
          {(listening || processing) && (
            <span className="text-sm text-cyan-300">
              {listening
                ? `Recording ${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`
                : status}
            </span>
          )}
          {!listening && !processing && status && (
            <span className="text-sm text-[var(--pv-fg-soft)]">{status}</span>
          )}
        </div>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        {transcript && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
              Transcript
            </label>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={5}
              className="font-mono text-xs"
            />
          </div>
        )}

        {hpi && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
              {effectiveKind === "NEW_PATIENT" ? "New patient HPI draft" : "Follow-up HPI draft"}
            </label>
            <Textarea
              value={hpi}
              onChange={(e) => setHpi(e.target.value)}
              rows={10}
              className="text-sm"
            />
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={!canSave || saving || listening || processing}
            onClick={() => void saveAsText()}
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saving ? "Saving…" : saved ? "Saved" : "Save as text"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!hpi}
            onClick={async () => {
              await navigator.clipboard.writeText(hpi);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy HPI"}
          </Button>
          <Button type="button" variant="ghost" disabled={listening || processing} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
