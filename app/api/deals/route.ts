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

async function fetchSecEdgar(company: string): Promise<{ text: string; url: string }> {
  try {
    const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${company}"`)}&forms=10-K,10-Q&dateRange=custom&startdt=2024-01-01`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Meridian research@meridian.app" },
    });
    if (!res.ok) return { text: "", url: "" };
    const data = await res.json();
    const hits = data.hits?.hits ?? [];
    if (hits.length === 0) return { text: "", url: "" };

    const lines = hits.slice(0, 5).map(
      (h: { _source?: { period_of_report?: string; form_type?: string; entity_name?: string; file_date?: string } }) => {
        const src = h._source ?? {};
        return `SEC ${src.form_type ?? "filing"}: ${src.entity_name ?? company} — Period: ${src.period_of_report ?? "N/A"} — Filed: ${src.file_date ?? "N/A"}`;
      }
    );
    const edgarUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(company)}&type=10-K&dateb=&owner=include&count=10`;
    return { text: lines.join("\n"), url: edgarUrl };
  } catch {
    return { text: "", url: "" };
  }
}

async function fetchCompaniesHouse(company: string): Promise<{ text: string; url: string; filingHistoryText: string }> {
  try {
    const searchRes = await fetch(
      `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(company)}&items_per_page=3`,
      { headers: { Authorization: "Basic " + Buffer.from(":").toString("base64") } }
    );
    if (!searchRes.ok) return { text: "", url: "", filingHistoryText: "" };
    const searchData = await searchRes.json();
    const items = searchData.items ?? [];
    if (items.length === 0) return { text: "", url: "", filingHistoryText: "" };

    const topCompany = items[0] as {
      title?: string;
      company_number?: string;
      date_of_creation?: string;
      company_status?: string;
    };
    const companyNumber = topCompany.company_number ?? "";
    const chUrl = `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`;

    const summaryText = `Companies House: ${topCompany.title ?? company} — Number: ${companyNumber} — Incorporated: ${topCompany.date_of_creation ?? "N/A"} — Status: ${topCompany.company_status ?? "N/A"}`;

    // Fetch filing history for director changes and debt signals
    let filingHistoryText = "";
    if (companyNumber) {
      try {
        const histRes = await fetch(
          `https://api.company-information.service.gov.uk/company/${companyNumber}/filing-history?items_per_page=20`,
          { headers: { Authorization: "Basic " + Buffer.from(":").toString("base64") } }
        );
        if (histRes.ok) {
          const histData = await histRes.json();
          const filings = (histData.items ?? []) as Array<{
            description?: string;
            date?: string;
            type?: string;
          }>;
          const interestingTypes = ["CH01", "CH02", "TM01", "AP01", "CS01", "AA", "MR01", "MR04"];
          const relevant = filings
            .filter((f) => interestingTypes.some((t) => (f.type ?? "").startsWith(t)))
            .slice(0, 10);
          if (relevant.length > 0) {
            filingHistoryText = relevant
              .map((f) => `Filing ${f.type}: ${f.description ?? "N/A"} — ${f.date ?? "N/A"}`)
              .join("\n");
          }
        }
      } catch {
        // filing history optional
      }
    }

    return { text: summaryText, url: chUrl, filingHistoryText };
  } catch {
    return { text: "", url: "", filingHistoryText: "" };
  }
}

function detectGeography(results: SearchResult[]): "US" | "UK" | "Other" {
  const text = results.map((r) => `${r.title} ${r.snippet}`).join(" ").toLowerCase();
  const usScore = (text.match(/\b(nasdaq|nyse|sec edgar|wall street|new york|san francisco|silicon valley|united states)\b/g) ?? []).length;
  const ukScore = (text.match(/\b(london stock exchange|lse|ftse|companies house|united kingdom|london|manchester|uk plc)\b/g) ?? []).length;
  if (usScore > ukScore && usScore > 0) return "US";
  if (ukScore >= usScore && ukScore > 0) return "UK";
  return "Other";
}

export async function POST(req: NextRequest) {
  try {
    const { query, dealType } = await req.json();

    const isSector = /\b(sector|industry|market|saas|fintech|healthcare|logistics|consumer|real estate|energy|tech|software|pharma|biotech)\b/i.test(query)
      && !query.match(/^[A-Z][a-z]+ [A-Z][a-z]+/)
      && query.split(" ").length <= 4;

    // All search batches defined by category (FIX 2 deep scraping)
    const searchBatches: [string, string][] = isSector
      ? [
          [`${query} M&A activity deals 2026`, "Deal Signals"],
          [`${query} acquisition targets UK OR US OR GCC 2026`, "Deal Signals"],
          [`${query} private equity deals buyout 2026`, "Deal Signals"],
          [`${query} merger deal announcement 2025 2026`, "Deal Signals"],
          [`${query} strategic acquirer consolidation 2026`, "Strategic Signals"],
          [`${query} investment banker advisor hired 2026`, "Strategic Signals"],
          [`${query} revenue growth decline results 2026`, "Financial Signals"],
          [`${query} IPO listing plans funding round 2026`, "Financial Signals"],
        ]
      : [
          // Batch 1 — Deal signals
          [`${query} acquisition OR acquired OR merger 2025 2026`, "Deal Signals"],
          [`${query} buyout OR private equity OR PE firm 2026`, "Deal Signals"],
          [`${query} strategic review OR sale process 2026`, "Deal Signals"],
          [`${query} investment banker OR advisor hired 2026`, "Deal Signals"],
          [`${query} takeover bid OR offer OR approach 2026`, "Deal Signals"],
          // Batch 2 — Leadership signals
          [`${query} CEO departure OR resignation OR steps down`, "Leadership Signals"],
          [`${query} founder exit OR transition OR succession`, "Leadership Signals"],
          [`${query} CFO leaves OR new CFO appointed 2026`, "Leadership Signals"],
          [`${query} board changes OR new chairman 2026`, "Leadership Signals"],
          [`${query} management buyout OR MBO 2026`, "Leadership Signals"],
          // Batch 3 — Financial signals
          [`${query} revenue growth OR decline results 2026`, "Financial Signals"],
          [`${query} funding round OR raises capital 2026`, "Financial Signals"],
          [`${query} IPO OR listing plans OR postponed 2026`, "Financial Signals"],
          [`${query} debt refinancing OR restructuring 2026`, "Financial Signals"],
          [`${query} cost cutting OR layoffs OR restructure 2026`, "Financial Signals"],
          // Batch 4 — Strategic signals
          [`${query} strategic partnership OR joint venture 2026`, "Strategic Signals"],
          [`${query} market share OR competition OR disruption`, "Strategic Signals"],
          [`${query} expansion OR enters market 2026`, "Strategic Signals"],
          [`${query} divestiture OR sells division OR carve out`, "Strategic Signals"],
          // Batch 5 — Social signals
          [`${query} site:twitter.com acquisition OR merger`, "Social Signals"],
          [`${query} site:linkedin.com strategic OR investment`, "Social Signals"],
        ];

    // Run all Serper searches + financial data fetches in parallel (FIX 5)
    const [searchSettled, secResult, chResult] = await Promise.all([
      Promise.allSettled(searchBatches.map(([q, cat]) => serperSearch(q, cat))),
      isSector ? Promise.resolve({ text: "", url: "" }) : fetchSecEdgar(query),
      isSector ? Promise.resolve({ text: "", url: "", filingHistoryText: "" }) : fetchCompaniesHouse(query),
    ]);

    const allResults: SearchResult[] = searchSettled.flatMap((r) =>
      r.status === "fulfilled" ? r.value : []
    );

    const uniqueResults = allResults.filter(
      (r, i, arr) => r.link && arr.findIndex((x) => x.link === r.link) === i
    );

    const geo = isSector ? "Other" : detectGeography(uniqueResults);
    const useSecData = geo === "US" && secResult.text;
    const useChData = geo === "UK" && chResult.text;

    const sourceCount = uniqueResults.length + (useSecData ? 1 : 0) + (useChData ? 1 : 0);
    const dataConfidence = sourceCount >= 5 ? "High" : sourceCount >= 2 ? "Medium" : "Low";

    // Build signals context grouped by category
    const categorised = new Map<string, SearchResult[]>();
    for (const r of uniqueResults) {
      if (!categorised.has(r.category)) categorised.set(r.category, []);
      categorised.get(r.category)!.push(r);
    }

    const signalContext = Array.from(categorised.entries())
      .map(([cat, results]) =>
        `=== ${cat} ===\n` + results.map((r) => `• ${r.title} — ${r.snippet} [${r.link}]`).join("\n")
      )
      .join("\n\n");

    const financialContext = [
      useSecData ? `SEC EDGAR FILINGS:\n${secResult.text}\nSource: ${secResult.url}` : "",
      useChData ? `COMPANIES HOUSE:\n${chResult.text}\n${chResult.filingHistoryText ? `Filing History:\n${chResult.filingHistoryText}` : ""}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const prompt = `You are a senior M&A banker at Lazard with deep expertise in identifying acquisition targets and advising on cross-border transactions globally.

You have been given:
1. Company/sector: "${query}" — Deal type focus: "${dealType}"
2. Real news signals scraped from the web, grouped by signal category
3. ${financialContext ? "Financial data from SEC EDGAR or Companies House" : "No financial filing data (private or non-UK/US company)"}
4. ${isSector ? "ANALYSIS TYPE: Sector scan" : "ANALYSIS TYPE: Company-specific analysis"}

SIGNALS FOUND (${sourceCount} sources across ${searchBatches.length} searches):
${signalContext || "No signals found — provide analysis based on sector knowledge."}

${financialContext ? `FINANCIAL DATA:\n${financialContext}` : ""}

Your task is to generate a professional deal signal report that a Managing Director would be comfortable presenting to a client.

DEAL SIGNAL ASSESSMENT: Assess overall acquisition signal strength with specific reasoning. Reference actual signals found.

FINANCIAL ANALYSIS: ${financialContext ? "Calculate EV/Revenue and EV/EBITDA multiples using sector benchmarks. State methodology clearly. Provide indicative enterprise value range." : "Explicitly state financial data unavailable for this company. Do not fabricate numbers."}

ACQUIRER UNIVERSE: For each potential acquirer, name specific companies or funds. Explain strategic logic, synergies, market position. Reference comparable acquisitions they have made. Assess deal structure. Give likelihood with reasoning.

KEY SIGNALS ANALYSIS: Analyse each signal category and connect them — e.g. CEO departure + PE investor + revenue slowdown = high probability strategic review underway.

RISKS AND CONSIDERATIONS: Specific regulatory, financial, strategic, timing risks.

RECOMMENDED NEXT STEPS: What a banker should do with this intelligence — specific and actionable.

Write in the voice of a senior analyst at a bulge bracket bank. Professional, specific, direct. No filler sentences.

Return a JSON object with exactly this structure:
{
  "companyName": "${query}",
  "sector": "detected sector",
  "signalStrength": "HIGH|MEDIUM|LOW|UNKNOWN",
  "dataConfidence": "${dataConfidence}",
  "signals": [
    { "text": "Specific signal description with source detail", "found": true, "source": "url or empty string", "category": "Deal Signals|Leadership Signals|Financial Signals|Strategic Signals|Social Signals" }
  ],
  "financials": {
    "revenue": "only if actual data provided, else null",
    "ebitdaMargin": "only if actual data provided, else null",
    "revenueGrowth": "only if actual data provided, else null",
    "keyMetrics": "only if actual data provided, else null",
    "evRange": "indicative EV range with methodology, or null if no financial data",
    "source": "SEC EDGAR|Companies House|null",
    "sourceUrl": "url or null"
  },
  "likelyAcquirers": [
    {
      "name": "Specific company or fund name",
      "type": "Strategic|Financial",
      "rationale": "Two detailed sentences referencing actual deals they have done.",
      "dealStructure": "Most likely deal structure and rationale",
      "precedentTransaction": "Specific named comparable acquisition",
      "likelihood": "High|Medium|Low"
    }
  ],
  "mandateBrief": "Full professional mandate brief covering: DEAL SIGNAL ASSESSMENT, FINANCIAL ANALYSIS, ACQUIRER UNIVERSE, KEY SIGNALS ANALYSIS, RISKS AND CONSIDERATIONS, RECOMMENDED NEXT STEPS. Write like a senior Lazard analyst. Minimum 500 words."
}

Return only the JSON object. No markdown fences. Never fabricate financial numbers.`;

    let groqResult: { content: string; modelUsed: string };
    try {
      groqResult = await groqWithFallback({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 6000,
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

    let parsed: Record<string, unknown>;
    try {
      const jsonMatch = groqResult.content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : groqResult.content);
    } catch {
      parsed = {};
    }

    // Build sources list including financial data sources
    const allSources = [
      ...uniqueResults.map((r) => ({ title: r.title, url: r.link, category: r.category, snippet: r.snippet })),
      ...(useSecData ? [{ title: "SEC EDGAR Filings", url: secResult.url, category: "Financial Data", snippet: secResult.text.slice(0, 150) }] : []),
      ...(useChData ? [{ title: "Companies House", url: chResult.url, category: "Financial Data", snippet: chResult.text.slice(0, 150) }] : []),
    ];

    return NextResponse.json({
      companyName: query,
      sector: parsed.sector ?? "Unknown",
      dealType,
      signalStrength: parsed.signalStrength ?? "UNKNOWN",
      dataConfidence: parsed.dataConfidence ?? dataConfidence,
      lastUpdated: new Date().toISOString(),
      signals: parsed.signals ?? [],
      financials: parsed.financials ?? null,
      likelyAcquirers: parsed.likelyAcquirers ?? [],
      mandateBrief: parsed.mandateBrief ?? "",
      meta: {
        modelUsed: groqResult.modelUsed,
        generatedAt: new Date().toISOString(),
        sourceCount,
        searchCount: searchBatches.length,
        dataConfidence,
        sources: allSources,
        rawSignals: uniqueResults.map((r) => ({
          headline: r.title,
          url: r.link,
          category: r.category,
          snippet: r.snippet,
        })),
      },
    });
  } catch (error) {
    console.error("Deals API error:", error);
    return NextResponse.json(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
