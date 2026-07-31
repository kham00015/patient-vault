import {
  TranscribeStreamingClient,
  StartMedicalStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";

function getRegion() {
  return (
    process.env.TRANSCRIBE_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    "us-east-1"
  );
}

export function isTranscribeConfigured() {
  if (process.env.TRANSCRIBE_DISABLED === "1") return false;
  const hasKeys = Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim()
  );
  const assumeRoleOk =
    process.env.NODE_ENV === "production" || process.env.AWS_USE_INSTANCE_ROLE === "1";
  return hasKeys || assumeRoleOk || Boolean(process.env.AWS_PROFILE?.trim());
}

/**
 * Transcribe Medical from raw PCM s16le mono audio.
 * Specialty PRIMARYCARE works well for clinic visit conversations.
 */
export async function transcribeMedicalConversation(
  pcm: Buffer,
  sampleRateHertz = 16000
): Promise<string> {
  if (!isTranscribeConfigured()) {
    throw new Error(
      "Amazon Transcribe Medical is not configured. Set AWS credentials/role and enable Transcribe Medical."
    );
  }
  if (pcm.byteLength < 3200) {
    throw new Error("Recording too short. Speak for a few seconds, then stop.");
  }

  const client = new TranscribeStreamingClient({ region: getRegion() });
  const chunkSize = 8 * 1024;

  async function* audioStream() {
    for (let offset = 0; offset < pcm.byteLength; offset += chunkSize) {
      yield {
        AudioEvent: {
          AudioChunk: pcm.subarray(offset, Math.min(offset + chunkSize, pcm.byteLength)),
        },
      };
    }
  }

  const response = await client.send(
    new StartMedicalStreamTranscriptionCommand({
      LanguageCode: "en-US",
      MediaSampleRateHertz: sampleRateHertz,
      MediaEncoding: "pcm",
      Specialty: "PRIMARYCARE",
      Type: "CONVERSATION",
      AudioStream: audioStream(),
    })
  );

  const parts: string[] = [];
  if (!response.TranscriptResultStream) {
    throw new Error("Transcribe Medical returned no transcript stream");
  }

  for await (const event of response.TranscriptResultStream) {
    const results = event.TranscriptEvent?.Transcript?.Results ?? [];
    for (const result of results) {
      if (result.IsPartial) continue;
      const text = result.Alternatives?.[0]?.Transcript?.trim();
      if (text) parts.push(text);
    }
  }

  const transcript = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!transcript) {
    throw new Error("No speech detected. Check the microphone and try again.");
  }
  return transcript;
}
