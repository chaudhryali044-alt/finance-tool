import Groq from "groq-sdk";

// ─── Types ─────────────────────────────────────────────────────────────────

export type TaskStatus = "success" | "rate_limited" | "token_limit" | "unavailable";

export interface TaskResult {
  content: string;
  model: string;
  status: TaskStatus;
}

export interface SynthesisResult {
  content: string;
  model: string;
  fallback: boolean;
}

export interface TruncatedSignal {
  headline?: string;
  source?: string;
  date?: string;
  snippet?: string;
}

interface ModelStep {
  name: string;
  call: (prompt: string, maxTokens: number) => Promise<string>;
  maxTokens: number;
  promptType: "full" | "compact";
}

// ─── Pre-processing ────────────────────────────────────────────────────────

export function truncateSignals(
  signals: Array<{ title?: string; link?: string; snippet?: string; date?: string }>
): TruncatedSignal[] {
  return signals.slice(0, 10).map((s) => ({
    headline: s.title
      ?.replace(/<[^>]*>/g, "")
      .replace(/[^\w\s.,!?'"()\-:]/g, "")
      .slice(0, 100),
    source: s.link
      ?.replace(/^https?:\/\//, "")
      .split("/")[0],
    date: s.date,
    snippet: s.snippet
      ?.replace(/<[^>]*>/g, "")
      .replace(/[^\w\s.,!?'"()\-:]/g, "")
      .slice(0, 150),
  }));
}

export function formatSignalsForPrompt(signals: TruncatedSignal[]): string {
  if (signals.length === 0) return "No signals found.";
  return signals
    .map((s, i) => `${i + 1}. ${s.headline ?? ""}${s.snippet ? ` — ${s.snippet}` : ""}${s.source ? ` [${s.source}]` : ""}`)
    .join("\n");
}

// ─── Model callers ─────────────────────────────────────────────────────────

function makeHttpError(status: number): Error & { httpStatus: number } {
  const err = new Error(`HTTP ${status}`) as Error & { httpStatus: number };
  err.httpStatus = status;
  return err;
}

async function callGroq(modelId: string, prompt: string, maxTokens: number): Promise<string> {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY! });
  try {
    const res = await client.chat.completions.create({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens,
    });
    return res.choices[0]?.message?.content ?? "";
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status) throw makeHttpError(status);
    throw err;
  }
}

async function callDeepSeek(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw makeHttpError(503);

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw makeHttpError(res.status);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw makeHttpError(503);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );
  if (!res.ok) throw makeHttpError(res.status);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return text;
}

async function callMistral(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw makeHttpError(503);

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw makeHttpError(res.status);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ─── Chain runner ──────────────────────────────────────────────────────────

async function tryStep(
  step: ModelStep,
  fullPrompt: string,
  compactPrompt: string
): Promise<{ content: string } | { rateLimited: true } | { tokenLimit: true } | { failed: true }> {
  const initialPrompt = step.promptType === "full" ? fullPrompt : compactPrompt;

  try {
    const content = await step.call(initialPrompt, step.maxTokens);
    return { content };
  } catch (err: unknown) {
    const status = (err as { httpStatus?: number })?.httpStatus ?? (err as { status?: number })?.status;

    if (status === 429) return { rateLimited: true };

    // 413 or 400 — try compact if we started with full
    if ((status === 413 || status === 400) && step.promptType === "full") {
      console.warn(`[Triangulate] ${step.name}: prompt too large — retrying with compact`);
      try {
        const content = await step.call(compactPrompt, step.maxTokens);
        return { content };
      } catch (err2: unknown) {
        const s2 = (err2 as { httpStatus?: number })?.httpStatus ?? (err2 as { status?: number })?.status;
        if (s2 === 429) return { rateLimited: true };
        return { tokenLimit: true };
      }
    }

    return { failed: true };
  }
}

export async function runModelChain(
  chainName: string,
  steps: ModelStep[],
  fullPrompt: string,
  compactPrompt: string
): Promise<TaskResult> {
  for (const step of steps) {
    console.log(`[${chainName}] Trying ${step.name}...`);
    const result = await tryStep(step, fullPrompt, compactPrompt);

    if ("content" in result && result.content) {
      console.log(`[${chainName}] ✓ ${step.name} succeeded`);
      return { content: result.content, model: step.name, status: "success" };
    }

    if ("rateLimited" in result) {
      console.warn(`[${chainName}] ${step.name} rate limited — trying next`);
      continue;
    }

    if ("tokenLimit" in result) {
      console.warn(`[${chainName}] ${step.name} token limit — trying next`);
      continue;
    }

    console.warn(`[${chainName}] ${step.name} failed — trying next`);
  }

  console.error(`[${chainName}] All models unavailable`);
  return { content: "", model: "none", status: "unavailable" };
}

// ─── Task chains (exported for use in routes) ─────────────────────────────

export function buildLightChain(): ModelStep[] {
  return [
    { name: "Groq Llama 8b", call: (p, t) => callGroq("llama-3.1-8b-instant", p, t), maxTokens: 1200, promptType: "full" },
    { name: "Groq Mixtral 8x7b", call: (p, t) => callGroq("mixtral-8x7b-32768", p, t), maxTokens: 800, promptType: "full" },
  ];
}

export function buildStrategicChain(): ModelStep[] {
  return [
    { name: "Groq Llama 70b", call: (p, t) => callGroq("llama-3.3-70b-versatile", p, t), maxTokens: 4000, promptType: "full" },
    { name: "Groq Mixtral 8x7b", call: (p, t) => callGroq("mixtral-8x7b-32768", p, t), maxTokens: 2000, promptType: "compact" },
    { name: "DeepSeek", call: (p, t) => callDeepSeek(p, t), maxTokens: 2000, promptType: "compact" },
  ];
}

export function buildFinancialChain(): ModelStep[] {
  return [
    { name: "DeepSeek", call: (p, t) => callDeepSeek(p, t), maxTokens: 2000, promptType: "full" },
    { name: "Groq Llama 70b", call: (p, t) => callGroq("llama-3.3-70b-versatile", p, t), maxTokens: 2000, promptType: "compact" },
    { name: "Gemini Flash", call: (p, t) => callGemini(p, t), maxTokens: 2000, promptType: "compact" },
  ];
}

export function buildMarketChain(): ModelStep[] {
  return [
    { name: "Gemini Flash", call: (p, t) => callGemini(p, t), maxTokens: 2000, promptType: "full" },
    { name: "Groq Llama 8b", call: (p, t) => callGroq("llama-3.1-8b-instant", p, t), maxTokens: 800, promptType: "compact" },
    { name: "Mistral Small", call: (p, t) => callMistral(p, t), maxTokens: 1000, promptType: "compact" },
  ];
}

// ─── Synthesis ─────────────────────────────────────────────────────────────

export async function runSynthesis(
  taskA: TaskResult,
  taskB: TaskResult,
  taskC: TaskResult,
  synthPrompt: string
): Promise<SynthesisResult> {
  const available = [
    taskA.status === "success" ? `STRATEGIC ANALYSIS:\n${taskA.content}` : null,
    taskB.status === "success" ? `FINANCIAL ANALYSIS:\n${taskB.content}` : null,
    taskC.status === "success" ? `MARKET INTELLIGENCE:\n${taskC.content}` : null,
  ].filter(Boolean);

  if (available.length === 0) {
    return { content: "Insufficient data for analysis.", model: "none", fallback: true };
  }

  const combinedInput = available.join("\n\n---\n\n");
  const fullSynthPrompt = `${synthPrompt}\n\n${combinedInput}`;

  try {
    const content = await callGroq("llama-3.1-8b-instant", fullSynthPrompt, 1500);
    if (content) {
      console.log("[Synthesis] ✓ Groq Llama 8b succeeded");
      return { content, model: "Groq Llama 8b", fallback: false };
    }
  } catch (err: unknown) {
    const status = (err as { httpStatus?: number })?.httpStatus ?? (err as { status?: number })?.status;
    console.warn(`[Synthesis] Groq Llama 8b failed (${status}) — using concatenation fallback`);
  }

  // Fallback: concatenate with section headers
  const fallbackContent = available.join("\n\n");
  return { content: fallbackContent, model: "concatenated", fallback: true };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export function determineAnalysisQuality(
  taskA: TaskResult,
  taskB: TaskResult,
  taskC: TaskResult,
  synthesis: SynthesisResult
): "Full" | "Partial" | "Degraded" {
  const successCount = [taskA, taskB, taskC].filter((t) => t.status === "success").length;
  if (successCount === 3 && !synthesis.fallback) return "Full";
  if (successCount >= 1) return "Partial";
  return "Degraded";
}

export function safeParseJSON(text: string): Record<string, unknown> | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
