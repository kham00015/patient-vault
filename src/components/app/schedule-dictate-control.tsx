"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Check, Copy, FileText, Mic, Pause, Play, Square } from "lucide-react";

export type ScheduleDictationSummary = {
  hasAudio: boolean;
  hasTranscript: boolean;
  durationMs: number | null;
  updatedAt: string | null;
};

type DictationDetail = {
  id: string;
  hasAudio: boolean;
  hasTranscript: boolean;
  transcript: string;
  durationMs: number | null;
  audioUrl?: string;
};

type MenuState = { x: number; y: number } | null;

const TARGET_RATE = 16000;

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

function pcmToWavBlob(pcm: Int16Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.byteLength;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const wav = new Uint8Array(44 + dataSize);
  wav.set(new Uint8Array(header), 0);
  wav.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 44);
  return new Blob([wav], { type: "audio/wav" });
}

/** Use the active dictation mic (Nuance / PowerMic when present), else browser default. */
async function openActiveMicrophone(): Promise<{ stream: MediaStream; label: string }> {
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
  const nuanceMic = inputs.find((d) => /nuance|powermic/i.test(d.label));

  const attempts: MediaStreamConstraints[] = [];
  if (nuanceMic) {
    attempts.push({
      audio: {
        deviceId: { exact: nuanceMic.deviceId },
        channelCount: { ideal: 1 },
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
  }
  attempts.push({ audio: true, video: false });

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getAudioTracks()[0];
      return { stream, label: track?.label || nuanceMic?.label || "Microphone" };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not open microphone");
}

export function ScheduleDictateControl({
  entryId,
  patientName,
  dictation,
  disabled,
  onDictationChange,
}: {
  entryId: string;
  patientName: string;
  dictation: ScheduleDictationSummary | null;
  disabled?: boolean;
  onDictationChange: (next: ScheduleDictationSummary | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [menu, setMenu] = useState<MenuState>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [micLabel, setMicLabel] = useState("");

  const chunksRef = useRef<Float32Array[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const muteRef = useRef<GainNode | null>(null);
  const pausedRef = useRef(false);
  const peakSeenRef = useRef(0);
  const startedAtRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const onDictationChangeRef = useRef(onDictationChange);
  onDictationChangeRef.current = onDictationChange;

  const hasAudio = Boolean(dictation?.hasAudio);
  const hasTranscript = Boolean(dictation?.hasTranscript);

  useEffect(() => {
    if (!hasAudio || hasTranscript) return;

    let cancelled = false;
    setTranscribing(true);

    void (async () => {
      const deadline = Date.now() + 180_000;
      while (!cancelled && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelled) break;
        try {
          const data = await api<{ dictation: DictationDetail | null }>(
            `/api/schedule/${entryId}/dictation`
          );
          const text = data.dictation?.transcript?.trim();
          if (text) {
            setTranscript(text);
            onDictationChangeRef.current({
              hasAudio: true,
              hasTranscript: true,
              durationMs: data.dictation?.durationMs ?? dictation?.durationMs ?? null,
              updatedAt: data.dictation?.updatedAt ?? new Date().toISOString(),
            });
            break;
          }
        } catch {
          /* ignore transient poll errors */
        }
      }
      if (!cancelled) setTranscribing(false);
    })();

    return () => {
      cancelled = true;
      setTranscribing(false);
    };
  }, [entryId, hasAudio, hasTranscript, dictation?.durationMs]);

  useEffect(() => {
    if (!menu) return;
    function onDocDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [menu]);

  useEffect(() => {
    return () => {
      clearTimer();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      stopCapture();
    };
  }, []);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopCapture() {
    clearTimer();
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
    setInputLevel(0);
  }

  function startElapsedTimer() {
    clearTimer();
    startedAtRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(accumulatedMsRef.current + (Date.now() - startedAtRef.current));
    }, 200);
  }

  async function startRecording(replaceExisting = false) {
    setError("");
    setMenu(null);
    if (hasAudio && !replaceExisting) {
      const ok = window.confirm(
        `Replace the existing dictation for ${patientName}? The current audio and transcript will be overwritten when you finish recording.`
      );
      if (!ok) return;
    }

    chunksRef.current = [];
    peakSeenRef.current = 0;
    pausedRef.current = false;
    accumulatedMsRef.current = 0;
    setElapsedMs(0);
    setPaused(false);
    setInputLevel(0);
    setMicLabel("");

    try {
      const { stream, label } = await openActiveMicrophone();
      setMicLabel(label);
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioCtx();
      if (context.state === "suspended") await context.resume();

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        if (pausedRef.current) return;
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
      setRecording(true);
      startElapsedTimer();
    } catch (e) {
      stopCapture();
      setError(e instanceof Error ? e.message : "Could not open microphone");
    }
  }

  function pauseRecording() {
    if (!recording || pausedRef.current) return;
    pausedRef.current = true;
    accumulatedMsRef.current += Date.now() - startedAtRef.current;
    clearTimer();
    setPaused(true);
    setInputLevel(0);
  }

  function resumeRecording() {
    if (!recording || !pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    startElapsedTimer();
  }

  async function endRecording() {
    if (!recording) return;
    setError("");

    if (!pausedRef.current) {
      accumulatedMsRef.current += Date.now() - startedAtRef.current;
    }
    const sampleRate = contextRef.current?.sampleRate ?? 48000;
    const chunks = chunksRef.current.slice();
    const peakSeen = peakSeenRef.current;
    const durationMs = Math.round(accumulatedMsRef.current);

    stopCapture();
    setRecording(false);
    setPaused(false);
    pausedRef.current = false;
    setElapsedMs(0);
    accumulatedMsRef.current = 0;

    if (chunks.length === 0 || durationMs < 800) {
      setError("Recording too short — speak for a couple seconds, then End.");
      return;
    }

    const merged = mergeFloat32(chunks);
    if (peakSeen < 0.003 && rmsLevel(merged) < 0.0008) {
      setError(
        `No audio on "${micLabel || "microphone"}". Check Windows sound settings (Input) and try again.`
      );
      setMicLabel("");
      return;
    }

    setUploading(true);
    try {
      const down = downsample(merged, sampleRate, TARGET_RATE);
      const pcm = floatTo16BitPCM(down);
      const blob = pcmToWavBlob(pcm, TARGET_RATE);
      const form = new FormData();
      form.append("audio", blob, "visit-dictation.wav");
      form.append("durationMs", String(durationMs));
      const res = await fetch(`/api/schedule/${entryId}/dictation`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save audio");
      onDictationChange({
        hasAudio: true,
        hasTranscript: Boolean(data.dictation?.hasTranscript),
        durationMs: data.dictation?.durationMs ?? durationMs,
        updatedAt: data.dictation?.updatedAt ?? new Date().toISOString(),
      });
      setMicLabel("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save audio");
    } finally {
      setUploading(false);
    }
  }

  async function runTranscription(openModal = false) {
    setTranscribing(true);
    setError("");
    try {
      const data = await api<{ dictation: DictationDetail }>(
        `/api/schedule/${entryId}/dictation/transcribe`,
        { method: "POST" }
      );
      const next = data.dictation;
      setTranscript(next.transcript || "");
      onDictationChange({
        hasAudio: true,
        hasTranscript: Boolean(next.transcript?.trim()),
        durationMs: next.durationMs,
        updatedAt: new Date().toISOString(),
      });
      if (openModal) setTranscriptOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  }

  async function transcribe() {
    setMenu(null);
    if (!hasAudio) return;
    await runTranscription(true);
  }

  async function removeDictation() {
    setMenu(null);
    if (!hasAudio) return;
    if (
      !window.confirm(
        `Remove dictation for ${patientName}? This deletes the audio and transcript.`
      )
    ) {
      return;
    }
    setError("");
    try {
      await api(`/api/schedule/${entryId}/dictation`, { method: "DELETE" });
      onDictationChange(null);
      setTranscript("");
      setTranscriptOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove dictation");
    }
  }

  async function openTranscript() {
    setError("");
    try {
      const data = await api<{ dictation: DictationDetail | null }>(
        `/api/schedule/${entryId}/dictation`
      );
      setTranscript(data.dictation?.transcript ?? "");
      setSaveStatus("idle");
      setTranscriptOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open transcript");
    }
  }

  function queueTranscriptSave(next: string) {
    setTranscript(next);
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistTranscript(next);
    }, 600);
  }

  async function persistTranscript(next: string) {
    try {
      const data = await api<{ dictation: DictationDetail }>(`/api/schedule/${entryId}/dictation`, {
        method: "PATCH",
        json: { transcript: next },
      });
      onDictationChange({
        hasAudio: true,
        hasTranscript: Boolean(data.dictation.transcript.trim()),
        durationMs: data.dictation.durationMs,
        updatedAt: data.dictation.updatedAt,
      });
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1200);
    } catch {
      setSaveStatus("error");
    }
  }

  async function copyTranscript(text?: string) {
    const value = (text ?? transcript).trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy");
    }
  }

  async function copyFromButton() {
    setError("");
    try {
      if (transcript.trim()) {
        await copyTranscript(transcript);
        return;
      }
      const data = await api<{ dictation: DictationDetail | null }>(
        `/api/schedule/${entryId}/dictation`
      );
      const text = data.dictation?.transcript ?? "";
      setTranscript(text);
      await copyTranscript(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not copy");
    }
  }

  function onDictateContextMenu(event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || recording || uploading) return;
    setMenu({ x: event.clientX, y: event.clientY });
  }

  const elapsedLabel = `${Math.floor(elapsedMs / 60000)}:${String(
    Math.floor((elapsedMs % 60000) / 1000)
  ).padStart(2, "0")}`;

  return (
    <div className="relative flex shrink-0 items-center gap-1">
      {!recording ? (
        <Button
          type="button"
          className={cn(
            "!h-8 !w-8 !p-0",
            hasAudio
              ? "!border-emerald-500/60 !bg-emerald-600 !text-white hover:!bg-emerald-500"
              : "!border-rose-500/60 !bg-rose-600 !text-white hover:!bg-rose-500"
          )}
          title={
            hasAudio
              ? "Dictation saved — click to record over it (confirm). Transcribes automatically after End."
              : "Dictate visit note (transcribes automatically when you End)"
          }
          disabled={disabled || uploading || transcribing}
          onClick={() => void startRecording(false)}
          onContextMenu={onDictateContextMenu}
        >
          <Mic size={14} />
        </Button>
      ) : (
        <>
          <Button
            type="button"
            className="!h-8 gap-1 !px-2 !text-xs !border-amber-500/50 !bg-amber-600 !text-white"
            onClick={() => (paused ? resumeRecording() : pauseRecording())}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            type="button"
            className="!h-8 gap-1 !px-2 !text-xs !border-rose-500/50 !bg-rose-700 !text-white"
            onClick={() => void endRecording()}
          >
            <Square size={13} /> End
          </Button>
          <span className="tabular-nums text-[11px] text-[var(--pv-muted)]">{elapsedLabel}</span>
          {micLabel && (
            <span
              className="max-w-[9rem] truncate text-[10px] text-[var(--pv-muted-2)]"
              title={micLabel}
            >
              {micLabel}
            </span>
          )}
          <span
            className="inline-block h-2 w-10 overflow-hidden rounded-full bg-[var(--pv-border)]"
            title="Mic level — bar should move when you speak"
            aria-hidden
          >
            <span
              className={cn(
                "block h-full rounded-full transition-[width] duration-100",
                inputLevel > 0.008 ? "bg-emerald-500" : "bg-amber-400"
              )}
              style={{ width: `${Math.min(100, Math.round(inputLevel * 280))}%` }}
            />
          </span>
        </>
      )}

      {hasTranscript && !recording && (
        <>
          <Button
            type="button"
            className="!h-8 !w-8 !p-0 !border-cyan-500/40 !bg-cyan-600/20 !text-cyan-200 hover:!bg-cyan-600/30"
            title="Open transcript"
            disabled={disabled || uploading || transcribing}
            onClick={() => void openTranscript()}
          >
            <FileText size={14} />
          </Button>
          <Button
            type="button"
            className="!h-8 !w-8 !p-0 !border-[var(--pv-border-strong)] !bg-[var(--pv-btn)] !text-[var(--pv-muted-2)] hover:!bg-[var(--pv-border)]"
            title={copied ? "Copied" : "Copy transcript"}
            disabled={disabled || uploading || transcribing}
            onClick={() => void copyFromButton()}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </Button>
        </>
      )}

      {(uploading || transcribing) && (
        <span className="text-[11px] text-cyan-300">
          {uploading ? "Saving…" : "Transcribing…"}
        </span>
      )}

      {error && (
        <span className="max-w-[18rem] text-[11px] leading-snug text-rose-600" title={error}>
          {error}
        </span>
      )}

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-[100] min-w-[10rem] rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-card)] py-1 shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-[var(--pv-fg-soft)] hover:bg-[var(--pv-hover)] disabled:opacity-40"
            disabled={!hasAudio}
            onClick={() => void startRecording(true)}
          >
            Re-record
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-[var(--pv-fg-soft)] hover:bg-[var(--pv-hover)] disabled:opacity-40"
            disabled={!hasAudio || transcribing}
            onClick={() => void transcribe()}
          >
            Transcribe
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-[var(--pv-hover)] disabled:opacity-40"
            disabled={!hasAudio}
            onClick={() => void removeDictation()}
          >
            Remove
          </button>
        </div>
      )}

      <Modal
        open={transcriptOpen}
        onClose={() => setTranscriptOpen(false)}
        title={`Visit dictation — ${patientName}`}
        wide
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--pv-muted)]">
            Edit freely — changes autosave as you type.
            {saveStatus === "saving"
              ? " Saving…"
              : saveStatus === "saved"
                ? " Saved."
                : saveStatus === "error"
                  ? " Save failed."
                  : ""}
          </p>
          <Textarea
            value={transcript}
            onChange={(e) => queueTranscriptSave(e.target.value)}
            className="!min-h-[40vh] !text-sm leading-relaxed"
            placeholder="Transcript will appear here after you transcribe…"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="!gap-1.5"
              disabled={!transcript.trim()}
              onClick={() => void copyTranscript()}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setTranscriptOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
