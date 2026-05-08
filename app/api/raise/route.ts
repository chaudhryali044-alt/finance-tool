import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const SERPER_API_KEY = process.env.SERPER_API_KEY!;
function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY! });
}

async function serperSearch(query: string): Promise<{ title: string; link: string; snippet: string }[]> {
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 5 }),
    });
    const data = await res.json();
    return (data.organic ?? []).slice(0, 5).map((r: { title?: string; link?: string; snippet?: string }) => ({
      title: r.title ?? "",
      link: r.link ?? "",
      snippet: r.snippet ?? "",
    }));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyName, description, sector, stage, amount, currency, geography } = body;

    const raiseAmount = `${currency ?? "USD"} ${amount}`;
    const companyDescription = description || companyName;

    // Search for company news
    const companyNews = await serperSearch(`${companyName} ${sector} startup news 2025 2026`);

    // Search for investor activity
    const investorTypes = [
      `${sector} venture capital fund 2025 2026 new investment`,
      `${sector} private equity fund ${stage} 2025 2026`,
      `${geography} ${sector} investor fund activity 2025 2026`,
      `${stage} ${sector} investor cheque size 2025`,
    ];

    const investorSearchResults = await Promise.all(
      investorTypes.map((q) => serperSearch(q))
    );
    const allInvestorSignals = investorSearchResults.flat();

    const newsContext = [
      ...companyNews.map((r) => `Company news: ${r.title} — ${r.snippet} [${r.link}]`),
      ...allInvestorSignals.map((r) => `Investor signal: ${r.title} — ${r.snippet} [${r.link}]`),
    ].join("\n");

    const prompt = `
You are a senior investment banker with deep knowledge of global venture capital, private equity, family offices, and institutional investors.

Generate a matched investor list for this capital raise:

COMPANY: ${companyDescription}
SECTOR: ${sector}
STAGE: ${stage}
RAISING: ${raiseAmount}
GEOGRAPHY: ${geography}

RECENT MARKET SIGNALS:
${newsContext || "No recent signals found."}

Generate a matched investor list with minimum 8 investors. Return a JSON object with this exact structure:
{
  "companySummary": "2-3 sentence company summary",
  "investors": [
    {
      "name": "Investor name",
      "type": "VC|PE|Angel|Family Office|SWF|Corporate",
      "chequeSize": "e.g. $500K–$2M",
      "sectorFocus": ["SaaS", "Fintech"],
      "geographicFocus": "Global / US / Europe / GCC",
      "whyTheyFit": "Two sentences explaining the fit.",
      "outreachAngle": "One sentence outreach angle.",
      "fundActivity": "Recently Active|Active|Quiet|Unknown",
      "sourceLinks": ["url1"]
    }
  ]
}

Be specific and accurate. Use real, well-known investors. Ground responses in the signals provided. Return only the JSON object, no markdown.
`;

    const completion = await getGroq().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: { companySummary?: string; investors?: unknown[] };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      parsed = { companySummary: "Analysis complete.", investors: [] };
    }

    return NextResponse.json({
      companyName,
      sector,
      stage,
      amount: raiseAmount,
      geography,
      companySummary: parsed.companySummary ?? "",
      investors: parsed.investors ?? [],
    });
  } catch (error) {
    console.error("Raise API error:", error);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
