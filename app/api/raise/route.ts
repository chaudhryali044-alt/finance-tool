import { NextRequest, NextResponse } from "next/server";
import { groqWithFallback } from "@/lib/groq";

const SERPER_API_KEY = process.env.SERPER_API_KEY!;

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  category: string;
}

async function serperSearch(query: string, category: string): Promise<SearchResult[]> {
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
      category,
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

    // All search batches run in parallel (FIX 5)
    const searchBatches: [string, string][] = [
      // Company context
      [`${companyName} ${sector} company news funding 2025 2026`, "Company News"],
      [`${companyName} revenue growth traction metrics`, "Company Metrics"],

      // Batch 1 — Fund activity
      [`${sector} venture capital new fund close 2025 OR 2026`, "Fund Activity"],
      [`${sector} private equity fund raises capital 2025 OR 2026`, "Fund Activity"],
      [`${geography} ${sector} investor first close final close 2025 2026`, "Fund Activity"],
      [`${sector} ${stage} investor AUM billion 2025 2026`, "Fund Activity"],

      // Batch 2 — Recent investments
      [`${sector} ${stage} investor invests backs leads round 2026`, "Recent Investments"],
      [`${sector} ${stage} portfolio company announcement investment 2026`, "Recent Investments"],
      [`${geography} ${sector} series A OR series B OR growth investment 2026`, "Recent Investments"],

      // Batch 3 — Social signals
      [`${sector} ${stage} investor site:twitter.com announcement investment`, "Social Signals"],
      [`${sector} fund manager site:linkedin.com fund raise deploy 2026`, "Social Signals"],

      // Batch 4 — Mandate and strategy
      [`${sector} venture capital fund size target ${geography} 2025 2026`, "Fund Mandate"],
      [`${sector} ${stage} investment thesis stage geography focus`, "Fund Mandate"],
      [`${geography} ${sector} family office sovereign wealth fund investment 2026`, "Fund Mandate"],

      // Batch 5 — Market context
      [`${sector} M&A deal activity valuations 2026`, "Market Context"],
      [`${geography} startup ecosystem venture activity ${sector} 2026`, "Market Context"],
    ];

    const settledResults = await Promise.allSettled(
      searchBatches.map(([q, cat]) => serperSearch(q, cat))
    );

    const allResults: SearchResult[] = settledResults.flatMap((r) =>
      r.status === "fulfilled" ? r.value : []
    );

    const uniqueResults = allResults.filter(
      (r, i, arr) => r.link && arr.findIndex((x) => x.link === r.link) === i
    );

    const sourceCount = uniqueResults.length;
    const dataConfidence = sourceCount >= 5 ? "High" : sourceCount >= 2 ? "Medium" : "Low";

    const signalContext = uniqueResults
      .map((r) => `[${r.category}] ${r.title} — ${r.snippet} [${r.link}]`)
      .join("\n");

    const prompt = `You are a Managing Director at Goldman Sachs with 20 years of experience in capital raising across venture capital, private equity, and institutional fundraising globally.

You have been given:
1. A company description and funding requirements
2. Real news signals about relevant investors scraped from the web
3. Recent fund activity data for the sector, stage, and geography

COMPANY: ${companyDescription}
SECTOR: ${sector}
STAGE: ${stage}
RAISING: ${raiseAmount}
GEOGRAPHY: ${geography}

MARKET SIGNALS FOUND (${sourceCount} sources):
${signalContext || "Limited signals found — use your deep sector knowledge to match investors."}

Your task is to generate a highly specific, data-grounded investor matching report.

For each investor:
- Explain precisely why they are a fit based on their actual known investment history
- Reference specific portfolio companies they have backed that are comparable
- Assess their current fund cycle based on the news signals provided
- Give a specific outreach angle — what angle would actually get a response from this investor
- Be brutally honest about fit — if an investor is a stretch, say so and explain why

Write like you are briefing a junior banker before an investor roadshow. Be specific, be direct, no generic statements.

Generate minimum 8 investors. Return a JSON object with this exact structure:
{
  "companySummary": "2-3 sentence company summary grounded in the description provided",
  "investors": [
    {
      "name": "Exact investor name",
      "type": "VC|PE|Angel|Family Office|SWF|Corporate",
      "chequeSize": "e.g. $500K–$2M",
      "sectorFocus": ["SaaS", "Fintech"],
      "geographicFocus": "Global / US / Europe / GCC",
      "whyTheyFit": "Two specific sentences referencing their actual portfolio and mandate.",
      "outreachAngle": "One sentence with a specific, non-generic outreach angle.",
      "fundActivity": "Recently Active|Active|Quiet|Unknown",
      "recentSignal": "Most recent news signal about this investor or null",
      "fundStatus": "Raising|Deploying|Harvesting|Unknown",
      "sourceLinks": ["url1"]
    }
  ]
}

Return only the JSON object, no markdown fences.`;

    let groqResult: { content: string; modelUsed: string };
    try {
      groqResult = await groqWithFallback({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 5000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "RATE_LIMIT_ALL_MODELS") {
        return NextResponse.json(
          { error: "Analysis temporarily unavailable — please try again in a few minutes." },
          { status: 503 }
        );
      }
      throw err;
    }

    let parsed: { companySummary?: string; investors?: unknown[] };
    try {
      const jsonMatch = groqResult.content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : groqResult.content);
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
      meta: {
        modelUsed: groqResult.modelUsed,
        generatedAt: new Date().toISOString(),
        sourceCount,
        searchCount: searchBatches.length,
        dataConfidence,
        sources: uniqueResults.map((r) => ({
          title: r.title,
          url: r.link,
          category: r.category,
          snippet: r.snippet,
        })),
        rawSignals: uniqueResults.map((r) => ({
          headline: r.title,
          url: r.link,
          category: r.category,
          snippet: r.snippet,
        })),
      },
    });
  } catch (error) {
    console.error("Raise API error:", error);
    return NextResponse.json(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
