const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You are a project state extractor. Given a log entry and the current project state, return an updated current_state as plain markdown. 
Be concise — this is a snapshot, not a document. Max 300 words.
Focus on: what phase the project is in, what was just decided or completed, what the immediate next action is, any key dates or blockers.
Return ONLY the updated markdown, no preamble.`;

export async function extractProjectState(params: {
  projectName: string;
  currentState: string | null;
  logContent: string;
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const userMessage = `PROJECT: ${params.projectName}
CURRENT STATE:
${params.currentState?.trim() || "No state yet"}

NEW LOG ENTRY:
${params.logContent}

Return the updated project state.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const block = data.content?.find((c) => c.type === "text");
  const text = block?.text?.trim() ?? "";
  if (!text) {
    throw new Error("Empty response from Claude");
  }
  return text;
}
