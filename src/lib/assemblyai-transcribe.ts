/**
 * AssemblyAI pre-recorded transcription for AI Listen.
 * Visit recorder stays on Amazon Transcribe Medical.
 */

function getApiKey() {
  return process.env.ASSEMBLYAI_API_KEY?.trim() || "";
}

function getBaseUrl() {
  return (
    process.env.ASSEMBLYAI_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://api.assemblyai.com"
  );
}

export function isAssemblyAiConfigured() {
  if (process.env.ASSEMBLYAI_DISABLED === "1") return false;
  return Boolean(getApiKey());
}

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.byteLength;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

async function assemblyFetch(path: string, init?: RequestInit) {
  const apiKey = getApiKey();
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

/**
 * Transcribe raw PCM s16le mono audio via AssemblyAI (upload + async job).
 */
export async function transcribeWithAssemblyAi(
  pcm: Buffer,
  sampleRateHertz = 16000,
  options?: { timeoutMs?: number }
): Promise<string> {
  if (!isAssemblyAiConfigured()) {
    throw new Error(
      "AssemblyAI is not configured. Set ASSEMBLYAI_API_KEY in the environment."
    );
  }
  if (pcm.byteLength < 3200) {
    throw new Error("Recording too short. Speak for a few seconds, then stop.");
  }

  const wav = pcmToWav(pcm, sampleRateHertz);
  const durationSec = pcm.byteLength / (sampleRateHertz * 2);
  // Long visits need more poll time; cap under route maxDuration headroom.
  const timeoutMs =
    options?.timeoutMs ??
    Math.min(280_000, Math.max(120_000, Math.ceil(durationSec * 400) + 90_000));

  const uploadRes = await assemblyFetch("/v2/upload", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(wav),
  });
  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => "");
    throw new Error(
      `AssemblyAI upload failed (${uploadRes.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`
    );
  }
  const uploadJson = (await uploadRes.json()) as { upload_url?: string };
  if (!uploadJson.upload_url) {
    throw new Error("AssemblyAI upload did not return upload_url");
  }

  const createRes = await assemblyFetch("/v2/transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_url: uploadJson.upload_url,
      speech_models: ["universal-3-5-pro", "universal-2"],
      language_code: "en",
      domain: "medical-v1",
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    }),
  });
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "");
    throw new Error(
      `AssemblyAI transcript create failed (${createRes.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`
    );
  }
  const created = (await createRes.json()) as { id?: string };
  if (!created.id) {
    throw new Error("AssemblyAI did not return a transcript id");
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const pollRes = await assemblyFetch(`/v2/transcript/${created.id}`);
    if (!pollRes.ok) {
      const detail = await pollRes.text().catch(() => "");
      throw new Error(
        `AssemblyAI poll failed (${pollRes.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`
      );
    }
    const job = (await pollRes.json()) as {
      status?: string;
      text?: string | null;
      error?: string | null;
      utterances?: Array<{ speaker?: string; text?: string }> | null;
    };
    if (job.status === "completed") {
      const utterances = Array.isArray(job.utterances) ? job.utterances : [];
      let transcript = "";
      if (utterances.length > 0) {
        transcript = utterances
          .map((u) => {
            const speaker = u.speaker ? `Speaker ${u.speaker}` : "Speaker";
            return `${speaker}: ${(u.text ?? "").trim()}`;
          })
          .filter((line) => line.replace(/^Speaker(?: \w+)?:/, "").trim())
          .join("\n");
      }
      if (!transcript) {
        transcript = (job.text ?? "").replace(/\s+/g, " ").trim();
      }
      if (!transcript) {
        throw new Error("No speech detected. Check the microphone and try again.");
      }
      return transcript;
    }
    if (job.status === "error") {
      throw new Error(job.error || "AssemblyAI transcription failed");
    }
  }

  throw new Error("AssemblyAI transcription timed out. Try a shorter recording.");
}
