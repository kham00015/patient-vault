"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CLINIC_NAME } from "@/lib/branding";
import { Check, Copy, Mic, Pause, Play, Square, UserRound } from "lucide-react";

type StatusPayload = {
  enabled: boolean;
  testMode: boolean;
  authenticated: boolean;
  actorEmail?: string;
  transcribeConfigured?: boolean;
  bedrockConfigured?: boolean;
  keyRequired?: boolean;
  error?: string;
};

type PatientHit = {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  mrn?: string | null;
};

type HpiVisitKind = "NEW_PATIENT" | "FOLLOW_UP";

const TARGET_RATE = 16000;
const MAX_SECONDS = 900; // 15 min

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

function encodeWav(samples: Int16Array, sampleRate: number) {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    view.setInt16(offset, samples[i] ?? 0, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function formatElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function recorderKeyFromLocation() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("key") ?? "";
}

function withKey(path: string) {
  const key = recorderKeyFromLocation();
  if (!key) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}key=${encodeURIComponent(key)}`;
}

export default function VisitRecorderPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusError, setStatusError] = useState("");
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<PatientHit[]>([]);
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [visitKind, setVisitKind] = useState<HpiVisitKind>("FOLLOW_UP");
  const [phase, setPhase] = useState<"idle" | "recording" | "paused" | "processing">("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [hpi, setHpi] = useState("");
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [copied, setCopied] = useState<"hpi" | "transcript" | null>(null);
  const [wavePoints, setWavePoints] = useState<number[]>(() => Array(48).fill(0));

  const chunksRef = useRef<Float32Array[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const muteRef = useRef<GainNode | null>(null);
  const pausedRef = useRef(false);
  const startedWallRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveRef = useRef<number[]>(Array(48).fill(0));
  const waveRafRef = useRef(0);

  const stopTracks = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (waveRafRef.current) {
      cancelAnimationFrame(waveRafRef.current);
      waveRafRef.current = 0;
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
    pausedRef.current = false;
    waveRef.current = Array(48).fill(0);
    setWavePoints(Array(48).fill(0));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(withKey("/api/visit-recorder/status"), { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as StatusPayload;
        if (cancelled) return;
        if (!res.ok) {
          setStatus(data);
          setStatusError(data.error || "Visit recorder is not available");
          return;
        }
        setStatus(data);
        setStatusError("");
      })
      .catch(() => {
        if (!cancelled) setStatusError("Could not reach visit recorder API");
      });
    return () => {
      cancelled = true;
      stopTracks();
    };
  }, [stopTracks]);

  useEffect(() => {
    if (!status?.enabled) return;
    const t = window.setTimeout(() => {
      const q = query.trim();
      fetch(withKey(`/api/visit-recorder/patients${q ? `?q=${encodeURIComponent(q)}` : ""}`), {
        credentials: "include",
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Could not load patients");
          setPatients(data.patients ?? []);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Patient search failed"));
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, status?.enabled]);

  const patientLabel = useMemo(() => {
    if (!patient) return "";
    return patient.mrn ? `${patient.name} · MRN ${patient.mrn}` : patient.name;
  }, [patient]);

  function tickElapsed() {
    if (pausedRef.current) return;
    const live = Date.now() - startedWallRef.current;
    const totalSec = Math.floor((accumulatedMsRef.current + live) / 1000);
    setElapsedSec(totalSec);
    if (totalSec >= MAX_SECONDS) {
      void endRecording();
    }
  }

  async function startRecording() {
    if (!patient) {
      setError("Select a patient first");
      return;
    }
    setError("");
    setTranscript("");
    setHpi("");
    setDocumentName(null);
    chunksRef.current = [];
    accumulatedMsRef.current = 0;
    pausedRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioCtx();
      if (context.state === "suspended") await context.resume();

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < input.length; i++) {
          const v = Math.abs(input[i] ?? 0);
          if (v > peak) peak = v;
        }
        const next = waveRef.current.slice(1);
        next.push(pausedRef.current ? 0 : Math.min(1, peak * 3.2));
        waveRef.current = next;

        if (pausedRef.current) return;
        chunksRef.current.push(new Float32Array(input));
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
      startedWallRef.current = Date.now();
      waveRef.current = Array(48).fill(0);
      setWavePoints(Array(48).fill(0));
      setElapsedSec(0);
      setPhase("recording");
      timerRef.current = setInterval(tickElapsed, 250);
      const paintWave = () => {
        setWavePoints([...waveRef.current]);
        waveRafRef.current = requestAnimationFrame(paintWave);
      };
      waveRafRef.current = requestAnimationFrame(paintWave);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Microphone access denied. Allow mic permission and try again."
      );
      stopTracks();
      setPhase("idle");
    }
  }

  function pauseRecording() {
    if (phase !== "recording") return;
    pausedRef.current = true;
    accumulatedMsRef.current += Date.now() - startedWallRef.current;
    setPhase("paused");
  }

  function resumeRecording() {
    if (phase !== "paused") return;
    pausedRef.current = false;
    startedWallRef.current = Date.now();
    setPhase("recording");
  }

  async function endRecording() {
    if (phase !== "recording" && phase !== "paused") return;
    if (!patient) return;

    if (!pausedRef.current) {
      accumulatedMsRef.current += Date.now() - startedWallRef.current;
    }
    const context = contextRef.current;
    const sampleRate = context?.sampleRate ?? 48000;
    const chunks = [...chunksRef.current];
    stopTracks();
    setPhase("processing");
    setError("");

    if (chunks.length === 0) {
      setError("No audio captured");
      setPhase("idle");
      return;
    }

    try {
      const merged = mergeFloat32(chunks);
      const down = downsample(merged, sampleRate, TARGET_RATE);
      const pcm = floatTo16BitPCM(down);
      const pcmBytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      const pcmBlob = new Blob([pcmBytes], { type: "application/octet-stream" });
      const wavBlob = encodeWav(pcm, TARGET_RATE);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");

      const form = new FormData();
      form.append("pcm", pcmBlob, "audio.pcm");
      form.append("audio", wavBlob, `visit-${stamp}.wav`);
      form.append("sampleRate", String(TARGET_RATE));
      form.append("visitKind", visitKind);

      const res = await fetch(withKey(`/api/visit-recorder/${patient.id}/process`), {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Processing failed (${res.status})`);

      setTranscript(typeof data.transcript === "string" ? data.transcript : "");
      setHpi(typeof data.hpi === "string" ? data.hpi : "");
      setDocumentName(typeof data.documentName === "string" ? data.documentName : null);
      setPhase("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Processing failed");
      setPhase("idle");
    }
  }

  async function copyText(kind: "hpi" | "transcript", value: string) {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  }

  if (statusError && !status?.enabled) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
        <h1 className="text-2xl font-semibold">{CLINIC_NAME}</h1>
        <p className="text-sm text-[var(--pv-muted)]">Visit recorder</p>
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {statusError}
        </p>
        <p className="text-xs text-[var(--pv-muted)]">
          For password-free testing set <code>VISIT_RECORDER_TEST_MODE=1</code> in env, then restart
          the app. Turn it off before real clinic use.
        </p>
        <a className="text-sm text-cyan-300 underline" href="/login">
          Or sign in
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6 pb-24">
      <header className="mb-5">
        <p className="text-xs uppercase tracking-wider text-[var(--pv-muted)]">{CLINIC_NAME}</p>
        <h1 className="text-2xl font-semibold">Visit recorder</h1>
        <p className="mt-1 text-sm text-[var(--pv-muted)]">
          Record the visit → audio file + transcript + HPI draft. Same AWS Transcribe Medical / Bedrock
          stack (BAA-covered services when configured under your AWS BAA).
        </p>
      </header>

      {status?.testMode && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Testing mode — no password. Actions attributed to {status.actorEmail ?? "test user"}. Turn
          off <code>VISIT_RECORDER_TEST_MODE</code> before real clinic use.
        </div>
      )}

      <section className="mb-5 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-card)] p-4">
        <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
          <UserRound size={14} /> Patient
        </label>
        {patient ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-medium">{patientLabel}</p>
            <Button
              type="button"
              variant="ghost"
              className="!py-1.5 !text-xs"
              disabled={phase !== "idle"}
              onClick={() => setPatient(null)}
            >
              Change
            </Button>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or MRN"
              className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg-deep)] px-3 py-3 text-base"
            />
            <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[var(--pv-border)]">
              {patients.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 border-b border-[var(--pv-border)] px-3 py-3 text-left last:border-b-0 hover:bg-[var(--pv-btn)]"
                    onClick={() => setPatient(p)}
                  >
                    <span className="font-medium">{p.name}</span>
                    {p.mrn && <span className="text-xs text-[var(--pv-muted)]">MRN {p.mrn}</span>}
                  </button>
                </li>
              ))}
              {patients.length === 0 && (
                <li className="px-3 py-3 text-sm text-[var(--pv-muted)]">No patients found</li>
              )}
            </ul>
          </>
        )}
      </section>

      <section className="mb-5 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-card)] p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
          HPI type
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={visitKind === "NEW_PATIENT" ? "primary" : "ghost"}
            className="flex-1 !py-3"
            disabled={phase !== "idle"}
            onClick={() => setVisitKind("NEW_PATIENT")}
          >
            New patient
          </Button>
          <Button
            type="button"
            variant={visitKind === "FOLLOW_UP" ? "primary" : "ghost"}
            className="flex-1 !py-3"
            disabled={phase !== "idle"}
            onClick={() => setVisitKind("FOLLOW_UP")}
          >
            Follow-up
          </Button>
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-card)] p-4">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
              Recording
            </p>
            <p className="text-3xl font-semibold tabular-nums">{formatElapsed(elapsedSec)}</p>
          </div>
          <p className="text-sm capitalize text-[var(--pv-fg-soft)]">
            {phase === "idle" ? "Ready" : phase}
          </p>
        </div>

        {(phase === "recording" || phase === "paused") && (
          <div
            className="mb-4 overflow-hidden rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg-deep)] px-2 py-3"
            aria-hidden
          >
            <svg viewBox="0 0 100 28" className="h-14 w-full" preserveAspectRatio="none">
              <line
                x1="0"
                y1="14"
                x2="100"
                y2="14"
                stroke="currentColor"
                strokeOpacity="0.15"
                strokeWidth="0.4"
              />
              <polyline
                fill="none"
                stroke={phase === "paused" ? "var(--pv-muted)" : "#22d3ee"}
                strokeWidth="1.4"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={wavePoints
                  .map((amp, i) => {
                    const x = (i / (wavePoints.length - 1)) * 100;
                    const y = 14 - amp * 12;
                    return `${x.toFixed(2)},${y.toFixed(2)}`;
                  })
                  .join(" ")}
              />
              <polyline
                fill="none"
                stroke={phase === "paused" ? "var(--pv-muted)" : "#22d3ee"}
                strokeWidth="1.4"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeOpacity="0.45"
                points={wavePoints
                  .map((amp, i) => {
                    const x = (i / (wavePoints.length - 1)) * 100;
                    const y = 14 + amp * 12;
                    return `${x.toFixed(2)},${y.toFixed(2)}`;
                  })
                  .join(" ")}
              />
            </svg>
            <p className="mt-1 text-center text-[11px] text-[var(--pv-muted)]">
              {phase === "paused" ? "Paused — voice line frozen" : "Live voice level"}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          {phase === "idle" && (
            <Button
              type="button"
              variant="primary"
              className="!h-14 !text-lg"
              disabled={!patient || !status?.enabled}
              onClick={() => void startRecording()}
            >
              <Mic size={20} /> Record
            </Button>
          )}
          {phase === "recording" && (
            <>
              <Button type="button" className="!h-14 !text-lg" onClick={pauseRecording}>
                <Pause size={20} /> Pause
              </Button>
              <Button
                type="button"
                variant="danger"
                className="!h-14 !text-lg"
                onClick={() => void endRecording()}
              >
                <Square size={20} /> End recording
              </Button>
            </>
          )}
          {phase === "paused" && (
            <>
              <Button
                type="button"
                variant="primary"
                className="!h-14 !text-lg"
                onClick={resumeRecording}
              >
                <Play size={20} /> Resume
              </Button>
              <Button
                type="button"
                variant="danger"
                className="!h-14 !text-lg"
                onClick={() => void endRecording()}
              >
                <Square size={20} /> End recording
              </Button>
            </>
          )}
          {phase === "processing" && (
            <p className="py-4 text-center text-cyan-300">
              Saving audio · transcribing · drafting HPI…
            </p>
          )}
        </div>
      </section>

      {error && (
        <p className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {(transcript || hpi) && (
        <section className="space-y-4">
          {documentName && (
            <p className="text-xs text-[var(--pv-muted)]">Audio saved to chart: {documentName}</p>
          )}
          {transcript && (
            <div className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-card)] p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
                  Transcript
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="!py-1.5 !text-xs"
                  onClick={() => void copyText("transcript", transcript)}
                >
                  {copied === "transcript" ? <Check size={14} /> : <Copy size={14} />}
                  {copied === "transcript" ? "Copied" : "Copy"}
                </Button>
              </div>
              <Textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
            </div>
          )}
          {hpi && (
            <div className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-card)] p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
                  HPI draft
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="!py-1.5 !text-xs"
                  onClick={() => void copyText("hpi", hpi)}
                >
                  {copied === "hpi" ? <Check size={14} /> : <Copy size={14} />}
                  {copied === "hpi" ? "Copied" : "Copy"}
                </Button>
              </div>
              <Textarea value={hpi} onChange={(e) => setHpi(e.target.value)} rows={10} />
            </div>
          )}
        </section>
      )}
    </main>
  );
}
