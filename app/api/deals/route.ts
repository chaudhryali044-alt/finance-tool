import { NextRequest, NextResponse } from "next/server";
import {
  truncateSignals,
  formatSignalsForPrompt,
  buildStrategicChain,
  buildFinancialChain,
  buildMarketChain,
  runModelChain,
  runSynthesis,
  determineAnalysisQuality,
  safeParseJSON,
} from "@/lib/triangulate";

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
    const res = await fetch(url, { headers: { "User-Agent": "Meridian research@meridian.app" } });
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
    return {
      text: lines.join("\n"),
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(company)}&type=10-K`,
    };
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

    const top = items[0] as { title?: string; company_number?: string; date_of_creation?: string; company_status?: string };
    const num = top.company_number ?? "";
    const chUrl = `https://find-and-update.company-information.service.gov.uk/company/${num}`;
    const summaryText = `Companies House: ${top.title ?? company} — Number: ${num} — Incorporated: ${top.date_of_creation ?? "N/A"} — Status: ${top.company_status ?? "N/A"}`;

    let filingHistoryText = "";
    if (num) {
      try {
        const histRes = await fetch(
          `https://api.company-information.service.gov.uk/company/${num}/filing-history?items_per_page=20`,
          { headers: { Authorization: "Basic " + Buffer.from(":").toString("base64") } }
        );
        if (histRes.ok) {
          const histData = await histRes.json();
          const filings = (histData.items ?? []) as Array<{ description?: string; date?: string; type?: string }>;
          const relevant = filings
            .filter((f) => ["CH01", "CH02", "TM01", "AP01", "CS01", "AA", "MR01", "MR04"].some((t) => (f.type ?? "").startsWith(t)))
            .slice(0, 8);
          if (relevant.length > 0) {
            filingHistoryText = relevant.map((f) => `Filing ${f.type}: ${f.description ?? "N/A"} — ${f.date ?? "N/A"}`).join("\n");
          }
        }
      } catch { /* optional */ }
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

    // ── Step 1: Parallel Serper searches + financial data ─────────────────
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
          [`${query} acquisition OR acquired OR merger 2025 2026`, "Deal Signals"],
          [`${query} buyout OR private equity OR PE firm 2026`, "Deal Signals"],
          [`${query} strategic review OR sale process 2026`, "Deal Signals"],
          [`${query} investment banker OR advisor hired 2026`, "Deal Signals"],
          [`${query} takeover bid OR offer OR approach 2026`, "Deal Signals"],
          [`${query} CEO departure OR resignation OR steps down`, "Leadership Signals"],
          [`${query} founder exit OR transition OR succession`, "Leadership Signals"],
          [`${query} CFO leaves OR new CFO appointed 2026`, "Leadership Signals"],
          [`${query} board changes OR new chairman 2026`, "Leadership Signals"],
          [`${query} management buyout OR MBO 2026`, "Leadership Signals"],
          [`${query} revenue growth OR decline results 2026`, "Financial Signals"],
          [`${query} funding round OR raises capital 2026`, "Financial Signals"],
          [`${query} IPO OR listing plans OR postponed 2026`, "Financial Signals"],
          [`${query} debt refinancing OR restructuring 2026`, "Financial Signals"],
          [`${query} cost cutting OR layoffs OR restructure 2026`, "Financial Signals"],
          [`${query} strategic partnership OR joint venture 2026`, "Strategic Signals"],
          [`${query} market share OR competition OR disruption`, "Strategic Signals"],
          [`${query} expansion OR enters market 2026`, "Strategic Signals"],
          [`${query} divestiture OR sells division OR carve out`, "Strategic Signals"],
          [`${query} site:twitter.com acquisition OR merger`, "Social Signals"],
          [`${query} site:linkedin.com strategic OR investment`, "Social Signals"],
        ];

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

    // ── Step 2: Truncate signals before any AI call ───────────────────────
    const truncated = truncateSignals(uniqueResults);
    const signalText = formatSignalsForPrompt(truncated);

    const financialDataText = [
      useSecData ? `SEC EDGAR:\n${secResult.text}` : "",
      useChData ? `COMPANIES HOUSE:\n${chResult.text}\n${chResult.filingHistoryText}` : "",
    ].filter(Boolean).join("\n\n");

    // ── Step 3: Build prompts for each task ────────────────────────────────

    // Task A — Strategic Analysis
    const strategicFull = `You are a senior M&A banker at Lazard with deep expertise in identifying acquisition targets globally.

Write the strategic deal thesis for this company/sector. Explain why this would be an acquisition target, the strategic rationale for potential acquirers, and what market and sector dynamics support a deal. Connect multiple signals together — e.g. CEO departure + PE investor + revenue slowdown suggests strategic review underway. Maximum 400 words.

SUBJECT: ${query}
DEAL TYPE: ${dealType}
ANALYSIS TYPE: ${isSector ? "Sector scan" : "Company-specific"}

SIGNALS:
${signalText}`;

    const strategicCompact = `Write the strategic deal thesis for "${query}" as a potential ${dealType}. Connect signals together and explain market dynamics. Maximum 300 words. Be concise and direct.

SIGNALS: ${signalText.slice(0, 400)}`;

    // Task B — Financial Analysis
    const financialFull = `You are a financial analyst specialising in M&A valuation. Based on the signals and any financial data provided, write a financial analysis.

If financial data from SEC EDGAR or Companies House is available, calculate an indicative EV range using appropriate sector multiples. State your methodology. If no financial data is available, explicitly state this and explain why — never fabricate numbers. Maximum 400 words.

SUBJECT: ${query}
${financialDataText ? `FINANCIAL DATA:\n${financialDataText}` : "FINANCIAL DATA: Not available (private or non-UK/US company)"}

SIGNALS:
${signalText}`;

    const financialCompact = `Write a financial analysis for "${query}" M&A opportunity. ${financialDataText ? "Use the financial data provided to estimate EV range with sector multiples." : "Note that no financial data is available."} Never fabricate numbers. Maximum 300 words. Be concise and direct.

${financialDataText ? `FINANCIAL DATA: ${financialDataText.slice(0, 300)}` : ""}`;

    // Task C — Market Intelligence (structured JSON)
    const marketFull = `You are an M&A market intelligence expert. Based on the signals, identify 3-5 specific potential acquirers and detect 6-10 deal signals. Return ONLY valid JSON, no markdown.

SUBJECT: ${query} | DEAL TYPE: ${dealType}

SIGNALS:
${signalText}

Return this exact JSON:
{"signalStrength":"HIGH|MEDIUM|LOW|UNKNOWN","sector":"detected sector","signals":[{"text":"string","found":true,"source":"url or empty","category":"Deal Signals|Leadership Signals|Financial Signals|Strategic Signals|Social Signals"}],"likelyAcquirers":[{"name":"string","type":"Strategic|Financial","rationale":"Two sentences with specific past deals referenced.","dealStructure":"string","precedentTransaction":"string","likelihood":"High|Medium|Low"}]}`;

    const marketCompact = `Identify acquirers and signals for "${query}". Return ONLY valid JSON: {"signalStrength":"HIGH|MEDIUM|LOW|UNKNOWN","sector":"string","signals":[{"text":"string","found":true,"source":"","category":"string"}],"likelyAcquirers":[{"name":"string","type":"Strategic|Financial","rationale":"string","dealStructure":"string","precedentTransaction":"string","likelihood":"High|Medium|Low"}]}. Respond in maximum 300 words total. Be concise and direct.`;

    // Synthesis prompt
    const synthPrompt = `You are synthesising three separate AI analyses of the same M&A deal opportunity into a professional mandate brief. Combine them into one coherent report structured as:

DEAL SIGNAL ASSESSMENT
FINANCIAL ANALYSIS
ACQUIRER UNIVERSE
KEY SIGNALS ANALYSIS
RISKS AND CONSIDERATIONS
RECOMMENDED NEXT STEPS

Where analyses agree, present as consensus. Where they disagree, present both views. Prioritise specific data points over generic statements. Write like a senior Lazard analyst. Output must read as one unified professional note. Maximum 600 words total.`;

    // ── Step 4: Run all three tasks in parallel ────────────────────────────
    const [taskAResult, taskBResult, taskCResult] = await Promise.all([
      runModelChain("Strategic", buildStrategicChain(), strategicFull, strategicCompact),
      runModelChain("Financial", buildFinancialChain(), financialFull, financialCompact),
      runModelChain("Market", buildMarketChain(), marketFull, marketCompact),
    ]);

    // ── Step 5: Synthesis ──────────────────────────────────────────────────
    const synthesis = await runSynthesis(taskAResult, taskBResult, taskCResult, synthPrompt);

    // ── Step 6: Assemble response ──────────────────────────────────────────
    const taskCParsed = safeParseJSON(taskCResult.content);

    const signals = (taskCParsed?.signals as unknown[]) ?? [];
    const likelyAcquirers = (taskCParsed?.likelyAcquirers as unknown[]) ?? [];
    const signalStrength = (taskCParsed?.signalStrength as string) ?? "UNKNOWN";
    const detectedSector = (taskCParsed?.sector as string) ?? "Unknown";

    // Try to extract financials from Task B narrative
    let financials = null;
    if (financialDataText && taskBResult.status === "success") {
      financials = {
        keyMetrics: taskBResult.content.slice(0, 600),
        source: useSecData ? "SEC EDGAR" : useChData ? "Companies House" : null,
        sourceUrl: useSecData ? secResult.url : useChData ? chResult.url : null,
      };
    }

    const analysisQuality = determineAnalysisQuality(taskAResult, taskBResult, taskCResult, synthesis);

    const contributions = [
      { task: "strategic" as const, displayName: "Strategic Analysis", model: taskAResult.model, status: taskAResult.status },
      { task: "financial" as const, displayName: "Financial Analysis", model: taskBResult.model, status: taskBResult.status },
      { task: "market" as const, displayName: "Market Intelligence", model: taskCResult.model, status: taskCResult.status },
    ];

    const degradedNote =
      analysisQuality === "Degraded"
        ? "Some analysis modules unavailable — showing available intelligence only"
        : null;

    const allSources = [
      ...uniqueResults.map((r) => ({ title: r.title, url: r.link, category: r.category, snippet: r.snippet })),
      ...(useSecData ? [{ title: "SEC EDGAR Filings", url: secResult.url, category: "Financial Data", snippet: secResult.text.slice(0, 150) }] : []),
      ...(useChData ? [{ title: "Companies House", url: chResult.url, category: "Financial Data", snippet: chResult.text.slice(0, 150) }] : []),
    ];

    return NextResponse.json({
      companyName: query,
      sector: detectedSector,
      dealType,
      signalStrength,
      dataConfidence,
      lastUpdated: new Date().toISOString(),
      signals,
      financials,
      likelyAcquirers,
      mandateBrief: synthesis.content,
      degradedNote,
      meta: {
        modelUsed: taskCResult.model,
        generatedAt: new Date().toISOString(),
        sourceCount,
        searchCount: searchBatches.length,
        dataConfidence,
        sources: allSources,
        rawSignals: uniqueResults.map((r) => ({ headline: r.title, url: r.link, category: r.category, snippet: r.snippet })),
        contributions,
        synthesisModel: synthesis.model,
        synthesisFallback: synthesis.fallback,
        analysisQuality,
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
