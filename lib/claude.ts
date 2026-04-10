const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You are a project state extractor. Given a log entry and current project state, return a JSON object with four fields:
- state: updated project current_state as concise markdown (max 300 words). Focus on: phase, decisions made, next action, key dates, blockers.
- tasks: array of clear next actions or to-dos extracted from the log. Empty array if none.
- status: infer project status only if clearly implied by the log. Use one of: pending, in-dev, active, delivered, on-hold. Return null if status is not clearly implied — do not guess.
- budget: extract any budget or fee figure mentioned (£, $, €, or phrases like 'fee is', 'budget of', 'invoiced for'). Return the raw string (e.g. '£2,400') or null if not mentioned.
Return ONLY valid JSON. No preamble, no markdown fences.`;

const STATUS_VALUES = new Set([
  "pending",
  "in-dev",
  "active",
  "delivered",
  "on-hold",
]);

export type ExtractedProjectState = {
  state: string;
  tasks: string[];
  status: "pending" | "in-dev" | "active" | "delivered" | "on-hold" | null;
  budget: string | null;
};

function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/m, "").trim();
  }
  return t;
}

function normalizeStatus(
  v: unknown
): ExtractedProjectState["status"] {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  return STATUS_VALUES.has(v) ? (v as ExtractedProjectState["status"]) : null;
}

function tryParseExtractedJson(text: string): ExtractedProjectState | null {
  const t = stripCodeFences(text);
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    if (!j || typeof j !== "object") return null;
    if (typeof j.state !== "string") return null;
    const tasksRaw = j.tasks;
    const tasks = Array.isArray(tasksRaw)
      ? tasksRaw.filter((x): x is string => typeof x === "string")
      : [];
    const budget =
      j.budget === null || j.budget === undefined
        ? null
        : typeof j.budget === "string"
          ? j.budget
          : null;
    return {
      state: j.state,
      tasks,
      status: normalizeStatus(j.status),
      budget,
    };
  } catch {
    return null;
  }
}

export async function extractProjectState(params: {
  projectName: string;
  currentState: string | null;
  logContent: string;
}): Promise<ExtractedProjectState> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const userMessage = `PROJECT: ${params.projectName}
CURRENT STATE:
${params.currentState?.trim() || "No state yet"}

NEW LOG ENTRY:
${params.logContent}

Return the JSON object as specified.`;

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

  const parsed = tryParseExtractedJson(text);
  if (parsed) {
    return parsed;
  }

  return {
    state: text,
    tasks: [],
    status: null,
    budget: null,
  };
}
