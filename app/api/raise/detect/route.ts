import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

export async function POST(req: NextRequest) {
  try {
    const { input } = await req.json();
    if (!input?.trim()) {
      return NextResponse.json({ type: "company", confidence: "low", extracted: {} });
    }

    const client = new Groq({ apiKey: process.env.GROQ_API_KEY! });
    const res = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content: `Is this input a specific company name or a description of a company/deal?
Input: "${input.slice(0, 300)}"

Reply with JSON only, no markdown or explanation:
{"type":"company","confidence":"high","extracted":{"sector":"","stage":"","geography":"","amount":"","description":""}}

Rules:
- type "company": a proper noun / known brand name (e.g. "Revolut", "Tesla", "Acme Ltd")
- type "description": natural language describing a business, deal, or fundraise
- extracted.sector: one of SaaS, Fintech, Healthcare, Logistics, Consumer, Real Estate, Energy, Other
- extracted.stage: one of Pre-Seed, Seed, Series A, Series B, Series C, Growth, Pre-IPO — or empty
- extracted.geography: country or region inferred (e.g. "United Kingdom", "UAE", "US", "GCC") — or empty
- extracted.amount: currency symbol + number if mentioned (e.g. "£3m", "$2m") — or empty
- extracted.description: clean 1-sentence summary of the company/deal — or empty`,
        },
      ],
      temperature: 0.1,
      max_tokens: 250,
    });

    const text = res.choices[0]?.message?.content ?? "{}";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ type: "company", confidence: "low", extracted: {} });
    }
    const parsed = JSON.parse(match[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[detect] error:", err);
    return NextResponse.json({ type: "company", confidence: "low", extracted: {} });
  }
}
