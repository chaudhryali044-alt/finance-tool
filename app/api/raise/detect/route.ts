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
          content: `Extract deal parameters from this input and classify it.
Input: "${input.slice(0, 400)}"

Reply with JSON only — no markdown, no explanation:
{
  "type": "company or description",
  "confidence": "high or low",
  "isDescription": true,
  "companyName": "If a specific real company name is explicitly mentioned (e.g. Monzo, Tesla, Revolut, Acme Ltd), extract it exactly. Return null if the input is a generic description with no specific company name.",
  "companyType": "e.g. SaaS platform, diagnostics company, marketplace",
  "sector": "one of: SaaS, Fintech, Healthcare, Logistics, Consumer, Real Estate, Energy, Other",
  "subSector": "e.g. payments, telemedicine, B2B logistics",
  "stage": "one of: Pre-Seed, Seed, Series A, Series B, Series C, Growth, Pre-IPO — or empty",
  "amount": "currency symbol + number if mentioned e.g. £3m or $2m — or empty",
  "currency": "GBP, USD, EUR, AED, SGD, CAD, AUD — or empty",
  "geography": "country or region e.g. United Kingdom, UAE, US, GCC — or empty",
  "useOfFunds": "what the capital will be used for if mentioned — or empty",
  "keyStrengths": ["up to 3 notable strengths mentioned"],
  "displayName": "if type=company return the company name; if type=description return: Undisclosed [geography] [sector] Company e.g. Undisclosed UK Fintech Company"
}

Classification rules:
- type "company": a proper noun / known brand (e.g. "Revolut", "Tesla", "Acme Ltd")
- type "description": natural language describing a business, deal, or fundraise`,
        },
      ],
      temperature: 0.1,
      max_tokens: 400,
    });

    const text = res.choices[0]?.message?.content ?? "{}";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ type: "company", confidence: "low", extracted: {} });
    }
    const parsed = JSON.parse(match[0]);
    // Move top-level fields into extracted for backward compat with page.tsx
    return NextResponse.json({
      type: parsed.type ?? "company",
      confidence: parsed.confidence ?? "low",
      extracted: {
        sector: parsed.sector,
        stage: parsed.stage,
        geography: parsed.geography,
        amount: parsed.amount,
        currency: parsed.currency,
        description: parsed.companyType,
        subSector: parsed.subSector,
        useOfFunds: parsed.useOfFunds,
        keyStrengths: parsed.keyStrengths ?? [],
        displayName: parsed.displayName,
        companyType: parsed.companyType,
        companyName: parsed.companyName ?? null,
      },
    });
  } catch (err) {
    console.error("[detect] error:", err);
    return NextResponse.json({ type: "company", confidence: "low", extracted: {} });
  }
}
