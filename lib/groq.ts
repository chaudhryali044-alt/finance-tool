import Groq from "groq-sdk";

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
];

interface GroqMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

interface GroqOptions {
  messages: GroqMessage[];
  temperature?: number;
  max_tokens?: number;
}

export async function groqWithFallback(
  options: GroqOptions
): Promise<{ content: string; modelUsed: string }> {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY! });

  for (const model of GROQ_MODELS) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.max_tokens ?? 4000,
      });
      const content = completion.choices[0]?.message?.content ?? "{}";
      console.log(`[Groq] Used model: ${model}`);
      return { content, modelUsed: model };
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const errType = (err as { error?: { type?: string } })?.error?.type;
      const isRateLimit = status === 429 || errType === "rate_limit_exceeded";

      if (isRateLimit) {
        console.warn(`[Groq] Model ${model} rate limited — trying next model...`);
        continue;
      }
      // Non-rate-limit error: re-throw immediately
      throw err;
    }
  }

  throw new Error("RATE_LIMIT_ALL_MODELS");
}
