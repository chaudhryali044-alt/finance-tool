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

async function fetchSecEdgar(company: string): Promise<string> {
  try {
    const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(company)}&dateRange=custom&startdt=2024-01-01&forms=10-K,10-Q`;
    const res = await fetch(url, { headers: { "User-Agent": "Meridian research@meridian.app" } });
    if (!res.ok) return "";
    const data = await res.json();
    const hits = data.hits?.hits ?? [];
    if (hits.length === 0) return "";
    return hits
      .slice(0, 3)
      .map((h: { _source?: { period_of_report?: string; form_type?: string; entity_name?: string }; _id?: string }) => {
        const src = h._source ?? {};
        return `SEC ${src.form_type ?? "filing"}: ${src.entity_name ?? company} — Period: ${src.period_of_report ?? "N/A"} — https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(company)}&type=10-K`;
      })
      .join("\n");
  } catch {
    return "";
  }
}

async function fetchCompaniesHouse(company: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(company)}&items_per_page=3`,
      {
        headers: {
          Authorization: "Basic " + Buffer.from(":").toString("base64"),
        },
      }
    );
    if (!res.ok) return "";
    const data = await res.json();
    const items = data.items ?? [];
    if (items.length === 0) return "";
    return items
      .slice(0, 2)
      .map((c: { title?: string; company_number?: string; date_of_creation?: string; company_status?: string }) =>
        `Companies House: ${c.title ?? company} — Number: ${c.company_number ?? "N/A"} — Incorporated: ${c.date_of_creation ?? "N/A"} — Status: ${c.company_status ?? "N/A"} — https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`
      )
      .join("\n");
  } catch {
    return "";
  }
}

function detectGeography(results: { title: string; snippet: string }[]): "US" | "UK" | "Other" {
  const text = results.map((r) => `${r.title} ${r.snippet}`).join(" ").toLowerCase();
  const usScore = (text.match(/\b(nasdaq|nyse|sec|wall street|new york|san francisco|silicon valley|united states|\.com)\b/g) ?? []).length;
  const ukScore = (text.match(/\b(london stock exchange|lse|ftse|companies house|united kingdom|london|manchester|uk|britain)\b/g) ?? []).length;
  if (usScore > ukScore && usScore > 0) return "US";
  if (ukScore >= usScore && ukScore > 0) return "UK";
  return "Other";
}

export async function POST(req: NextRequest) {
  try {
    const { query, dealType } = await req.json();

    const isSector = /\b(sector|industry|market|saas|fintech|healthcare|logistics|consumer|real estate|energy|tech|software|pharma|biotech)\b/i.test(query) && !query.match(/^[A-Z][a-z]+ [A-Z][a-z]+/) && query.split(" ").length <= 4;

    const searchQueries = isSector
      ? [
          `${query} M&A activity 2026`,
          `${query} acquisition targets UK OR US OR GCC`,
          `${query} private equity deals 2026`,
          `${query} merger deal announcement 2025 2026`,
        ]
      : [
          `${query} acquisition OR merger OR buyout 2025 2026`,
          `${query} CEO OR founder departure 2025 2026`,
          `${query} private equity OR investor 2025 2026`,
          `${query} revenue OR growth OR results 2026`,
          `${query} site:linkedin.com OR site:twitter.com`,
          `${query} financial results OR annual report`,
        ];

    const allResults = (await Promise.all(searchQueries.map(serperSearch))).flat();

    let secData = "";
    let chData = "";

    if (!isSector) {
      const geo = detectGeography(allResults);
      if (geo === "US") secData = await fetchSecEdgar(query);
      if (geo === "UK") chData = await fetchCompaniesHouse(query);
    }

    const sourcesContext = allResults
      .map((r) => `• ${r.title} — ${r.snippet} [${r.link}]`)
      .join("\n");

    const financialContext = [
      secData ? `SEC EDGAR DATA:\n${secData}` : "",
      chData ? `COMPANIES HOUSE DATA:\n${chData}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const prompt = `
You are a senior M&A banker at a top investment bank. Analyse the provided news signals and company data to generate a professional deal signal report.

SUBJECT: ${query}
DEAL TYPE FOCUS: ${dealType}
${isSector ? "ANALYSIS TYPE: Sector scan" : "ANALYSIS TYPE: Company-specific"}

NEWS SIGNALS FOUND:
${sourcesContext || "No signals found."}

${financialContext ? `FINANCIAL DATA:\n${financialContext}` : "No financial data available."}

Return a JSON object with exactly this structure:
{
  "companyName": "${query}",
  "sector": "detected sector",
  "signalStrength": "HIGH|MEDIUM|LOW|UNKNOWN",
  "dataConfidence": "High|Medium|Low",
  "signals": [
    { "text": "Signal description", "found": true, "source": "url or empty" }
  ],
  "financials": {
    "revenue": "if available",
    "ebitdaMargin": "if available",
    "revenueGrowth": "if available",
    "keyMetrics": "if available",
    "evRange": "indicative EV range using sector multiples",
    "source": "SEC EDGAR or Companies House or null",
    "sourceUrl": "url or null"
  },
  "likelyAcquirers": [
    {
      "name": "Acquirer name",
      "type": "Strategic|Financial",
      "rationale": "Two sentences on strategic rationale.",
      "dealStructure": "Most likely deal structure",
      "precedentTransaction": "A relevant precedent deal",
      "likelihood": "High|Medium|Low"
    }
  ],
  "mandateBrief": "Full professional mandate brief text with sections: Situation Overview, Deal Signals Detected, Financial Overview, Acquirer Universe, Strategic Rationale, Deal Structure Considerations, Key Risks, Recommended Next Steps. Write like a professional analyst. Minimum 400 words."
}

For financials: only include if actual data was provided. Never fabricate numbers. Return only the JSON object.
`;

    const completion = await getGroq().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 5000,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: Record<string, unknown>;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      parsed = {};
    }

    return NextResponse.json({
      companyName: query,
      sector: parsed.sector ?? "Unknown",
      dealType,
      signalStrength: parsed.signalStrength ?? "UNKNOWN",
      dataConfidence: parsed.dataConfidence ?? "Low",
      lastUpdated: new Date().toISOString(),
      signals: parsed.signals ?? [],
      financials: parsed.financials ?? null,
      likelyAcquirers: parsed.likelyAcquirers ?? [],
      mandateBrief: parsed.mandateBrief ?? "",
    });
  } catch (error) {
    console.error("Deals API error:", error);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
