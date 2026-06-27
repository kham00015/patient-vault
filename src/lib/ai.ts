type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export async function chatWithAI(params: {
  messages: ChatMessage[];
  patientData?: string;
  pastConversations?: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      response:
        "AI is not configured. Set OPENAI_API_KEY on the server. " +
        "For HIPAA production, use Azure OpenAI or AWS Bedrock with a signed BAA.",
      configured: false,
    };
  }

  const systemContent = `You are a clinical decision-support assistant for licensed healthcare providers.
You help analyze patient charts. You do NOT replace clinical judgment.
Never fabricate medical data. If information is missing, say so.
${params.patientData ? `\n\n=== PATIENT CHART ===\n${params.patientData}` : ""}
${params.pastConversations ? `\n\n=== PAST CONVERSATIONS ===\n${params.pastConversations}` : ""}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemContent }, ...params.messages],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return {
    response: data.choices?.[0]?.message?.content ?? "No response",
    configured: true,
  };
}

export async function organizeChartWithAI(chartText: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const systemPrompt = `Organize patient chart data into JSON sections.
Return ONLY valid JSON:
{
  "pmh": "",
  "echo": "",
  "pft": "",
  "sleep": "",
  "labs": "",
  "imaging": "",
  "medications": "",
  "social": ""
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: chartText },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) throw new Error("AI organize failed");
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(text) as Record<string, string>;
}
