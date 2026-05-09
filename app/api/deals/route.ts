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
  callGroq,
  callDeepSeek,
  callGemini,
  callMistral,
} from "@/lib/triangulate";
import type { LikelyAcquirer, TaskStatus } from "@/types";
import type { TaskResult } from "@/lib/triangulate";

const SERPER_API_KEY = process.env.SERPER_API_KEY!;

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  category: string;
}

interface AcquirerTaskResult {
  acquirers: LikelyAcquirer[];
  model: string;
  status: TaskStatus;
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
    const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${company}"`)}&forms=10-K,10-Q&dateRange=custom&startdt=2023-01-01`;
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
          `https://api.company-information.service.gov.uk/company/${num}/filing-history?category=accounts&items_per_page=10`,
          { headers: { Authorization: "Basic " + Buffer.from(":").toString("base64") } }
        );
        if (histRes.ok) {
          const histData = await histRes.json();
          const filings = (histData.items ?? []) as Array<{ description?: string; date?: string; type?: string }>;
          const relevant = filings.slice(0, 8);
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
  const text = results.map((r) => `${r.title} ${r.snippet} ${r.link}`).join(" ").toLowerCase();
  const usScore = (text.match(/\b(nasdaq|nyse|sec edgar|sec\.gov|10-k|10-q|wall street|new york stock|silicon valley|united states|s&p 500|fortune 500)\b/g) ?? []).length;
  const ukScore = (text.match(/\b(london stock exchange|lse\.co\.uk|ftse|companies house|investegate|rns|aim market|uk plc|united kingdom|london|manchester|edinburgh|uk-listed|lse-listed)\b/g) ?? []).length;
  if (usScore > ukScore && usScore > 0) return "US";
  if (ukScore >= usScore && ukScore > 0) return "UK";
  return "Other";
}

// ─── Acquirer helpers ─────────────────────────────────────────────────────

function safeParseAcquirerArray(text: string, modelLabel: string): LikelyAcquirer[] {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      const obj = safeParseJSON(text);
      if (obj && Array.isArray(obj.likelyAcquirers)) {
        return (obj.likelyAcquirers as LikelyAcquirer[]).map((a) => ({ ...a, identifiedBy: modelLabel }));
      }
      return [];
    }
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a: unknown) => a && typeof a === "object" && (a as Record<string, unknown>).name)
      .map((a: unknown) => {
        const acq = a as Record<string, unknown>;
        return {
          name: String(acq.name ?? ""),
          type: String(acq.type ?? "Strategic"),
          rationale: String(acq.rationale ?? ""),
          dealStructure: String(acq.dealStructure ?? ""),
          precedentTransaction: String(acq.precedentTransaction ?? ""),
          likelihood: (["High", "Medium", "Low"].includes(String(acq.likelihood)) ? String(acq.likelihood) : "Medium") as LikelyAcquirer["likelihood"],
          identifiedBy: modelLabel,
        } satisfies LikelyAcquirer;
      });
  } catch {
    return [];
  }
}

function deduplicateAcquirers(acquirers: LikelyAcquirer[]): LikelyAcquirer[] {
  const seen = new Set<string>();
  return acquirers.filter((a) => {
    const key = a.name.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const LIKELIHOOD_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function sortAcquirers(acquirers: LikelyAcquirer[]): LikelyAcquirer[] {
  return [...acquirers].sort(
    (a, b) => (LIKELIHOOD_ORDER[a.likelihood] ?? 2) - (LIKELIHOOD_ORDER[b.likelihood] ?? 2)
  );
}

async function runAcquirerTask(
  fullPrompt: string,
  compactPrompt: string,
  modelLabel: string,
  primaryCall: (prompt: string, maxTokens: number) => Promise<string>,
  fallbackCall?: (prompt: string, maxTokens: number) => Promise<string>
): Promise<AcquirerTaskResult> {
  const tryCall = async (
    call: typeof primaryCall,
    prompt: string,
    maxT: number
  ): Promise<{ acquirers: LikelyAcquirer[] } | { httpStatus: number } | { failed: true }> => {
    try {
      const content = await call(prompt, maxT);
      return { acquirers: safeParseAcquirerArray(content, modelLabel) };
    } catch (e) {
      const s = (e as { httpStatus?: number })?.httpStatus;
      if (s) return { httpStatus: s };
      return { failed: true };
    }
  };

  const r1 = await tryCall(primaryCall, fullPrompt, 1500);
  if ("acquirers" in r1 && r1.acquirers.length > 0) {
    return { acquirers: r1.acquirers, model: modelLabel, status: "success" };
  }

  const httpStatus1 = "httpStatus" in r1 ? r1.httpStatus : 0;
  if (httpStatus1 !== 429) {
    const r2 = await tryCall(primaryCall, compactPrompt, 800);
    if ("acquirers" in r2 && r2.acquirers.length > 0) {
      return { acquirers: r2.acquirers, model: modelLabel, status: "success" };
    }
  }

  if (fallbackCall) {
    const r3 = await tryCall(fallbackCall, compactPrompt, 600);
    if ("acquirers" in r3 && r3.acquirers.length > 0) {
      return { acquirers: r3.acquirers, model: `${modelLabel} (fallback)`, status: "success" };
    }
    if ("httpStatus" in r3 && r3.httpStatus === 429) {
      return { acquirers: [], model: modelLabel, status: "rate_limited" };
    }
  }

  const finalStatus: TaskStatus = httpStatus1 === 429 ? "rate_limited"
    : httpStatus1 === 413 ? "token_limit"
    : "unavailable";
  return { acquirers: [], model: modelLabel, status: finalStatus };
}

// ─── Anti-hallucination validation ───────────────────────────────────────

function validateFinancialContent(content: string, hasSourceData: boolean): string {
  if (hasSourceData) return content;
  // Strip fabricated percentage figures when no source data was provided
  return content.replace(
    /\b(revenue|ebitda|margin|growth|profit|loss)\s+(of|at|around|approximately)\s+[\$£€]?[\d,.]+[mMbBkK%]/gi,
    "[figure not confirmed from filings]"
  );
}

export async function POST(req: NextRequest) {
  try {
    const { query, dealType } = await req.json();

    const isSector = /\b(sector|industry|market|saas|fintech|healthcare|logistics|consumer|real estate|energy|tech|software|pharma|biotech)\b/i.test(query)
      && !query.match(/^[A-Z][a-z]+ [A-Z][a-z]+/)
      && query.split(" ").length <= 4;

    // ── Step 1: Detection searches + parallel Serper + financial data ─────
    const detectionBatches: [string, string][] = isSector ? [] : [
      [`"${query}" site:sec.gov OR site:nasdaq.com OR site:nyse.com OR site:sec.edgar.gov`, "US Financial Data"],
      [`"${query}" site:londonstockexchange.com OR site:investegate.co.uk OR site:find-and-update.company-information.service.gov.uk`, "UK Financial Data"],
      [`"${query}" annual results revenue 2024 2025`, "Financial Results"],
    ];

    const signalBatches: [string, string][] = isSector
      ? [
          [`${query} M&A activity deals 2026`, "DEAL"],
          [`${query} acquisition targets UK OR US OR GCC 2026`, "DEAL"],
          [`${query} private equity deals buyout 2026`, "DEAL"],
          [`${query} merger deal announcement 2025 2026`, "DEAL"],
          [`${query} strategic acquirer consolidation 2026`, "STRATEGIC"],
          [`${query} investment banker advisor hired 2026`, "STRATEGIC"],
          [`${query} revenue growth decline results 2026`, "FINANCIAL"],
          [`${query} IPO listing plans funding round 2026`, "FINANCIAL"],
        ]
      : [
          [`"${query}" acquisition OR acquired OR merger announcement 2025 2026`, "DEAL"],
          [`"${query}" strategic review OR sale process OR bankers hired 2026`, "DEAL"],
          [`"${query}" buyout OR private equity investment 2026`, "DEAL"],
          [`"${query}" takeover bid OR offer OR approach received`, "DEAL"],
          [`"${query}" CEO departure OR resignation OR steps down 2025 2026`, "LEADERSHIP"],
          [`"${query}" founder exit OR succession planning OR new CEO 2026`, "LEADERSHIP"],
          [`"${query}" CFO departure OR new CFO OR board changes 2026`, "LEADERSHIP"],
          [`"${query}" management buyout OR MBO OR employee ownership`, "LEADERSHIP"],
          [`"${query}" revenue results annual report 2024 2025`, "FINANCIAL"],
          [`"${query}" profit loss debt refinancing restructuring 2025 2026`, "FINANCIAL"],
          [`"${query}" layoffs OR cost cutting OR headcount reduction 2025 2026`, "DISTRESS"],
          [`"${query}" strategic partnership OR joint venture OR licensing 2026`, "STRATEGIC"],
          [`"${query}" market expansion OR new market OR enters 2026`, "STRATEGIC"],
          [`"${query}" divestiture OR sells division OR carve out 2026`, "STRATEGIC"],
          [`"${query}" site:investegate.co.uk OR site:rns-news.co.uk`, "UK Regulatory"],
          [`"${query}" site:sec.gov 8-K OR press release 2025 2026`, "US Regulatory"],
        ];

    const allBatches = [...detectionBatches, ...signalBatches];

    const [searchSettled, secResult, chResult] = await Promise.all([
      Promise.allSettled(allBatches.map(([q, cat]) => serperSearch(q, cat))),
      isSector ? Promise.resolve({ text: "", url: "" }) : fetchSecEdgar(query),
      isSector ? Promise.resolve({ text: "", url: "", filingHistoryText: "" }) : fetchCompaniesHouse(query),
    ]);

    const detectionResults: SearchResult[] = searchSettled
      .slice(0, detectionBatches.length)
      .flatMap((r) => r.status === "fulfilled" ? r.value : []);

    const signalResults: SearchResult[] = searchSettled
      .slice(detectionBatches.length)
      .flatMap((r) => r.status === "fulfilled" ? r.value : []);

    const allResults = [...detectionResults, ...signalResults];
    const uniqueResults = allResults.filter(
      (r, i, arr) => r.link && arr.findIndex((x) => x.link === r.link) === i
    );

    const geo = isSector ? "Other" : detectGeography([...detectionResults, ...signalResults.slice(0, 5)]);
    const useSecData = geo === "US" && secResult.text;
    const useChData = geo === "UK" && chResult.text;
    const hasSourceData = !!(useSecData || useChData);

    const sourceCount = uniqueResults.length + (useSecData ? 1 : 0) + (useChData ? 1 : 0);
    const dataConfidence = sourceCount >= 5 ? "High" : sourceCount >= 2 ? "Medium" : "Low";

    // ── Step 2: Truncate signals ─────────────────────────────────────────
    const signalUnique = signalResults.filter(
      (r, i, arr) => r.link && arr.findIndex((x) => x.link === r.link) === i
    );
    const truncated = truncateSignals(signalUnique);
    const signalText = formatSignalsForPrompt(truncated);

    const financialDataText = [
      useSecData ? `SEC EDGAR:\n${secResult.text}` : "",
      useChData ? `COMPANIES HOUSE:\n${chResult.text}\n${chResult.filingHistoryText}` : "",
    ].filter(Boolean).join("\n\n");

    // ── Step 3: Build prompts for Task A (Strategic) + Task B (Financial) + Task C (Signals JSON) ──

    const strategicFull = `You are a senior M&A banker at Lazard with deep expertise in identifying acquisition targets globally.

IMPORTANT: Do not fabricate financial figures. Only state financial data that is present in the signals below.

Write the strategic deal thesis for this company/sector. Explain why this would be an acquisition target, the strategic rationale for potential acquirers, and what market and sector dynamics support a deal. Connect multiple signals — e.g. CEO departure + PE investor + revenue slowdown suggests strategic review underway. Maximum 400 words.

SUBJECT: ${query}
DEAL TYPE: ${dealType}
ANALYSIS TYPE: ${isSector ? "Sector scan" : "Company-specific"}

SIGNALS:
${signalText}`;

    const strategicCompact = `Write the strategic deal thesis for "${query}" as a potential ${dealType}. Connect signals together and explain market dynamics. Do not fabricate financial figures. Maximum 300 words.

SIGNALS: ${signalText.slice(0, 400)}`;

    // Sector scans: never produce financials
    const financialFull = isSector
      ? `You are a financial analyst. This is a sector scan for "${query}". Do not provide financials for individual companies. Describe typical sector valuation ranges using known public benchmarks for ${query} sector M&A deals. State explicitly this is sector-level context, not company-specific data. Maximum 300 words.`
      : `You are a financial analyst specialising in M&A valuation. Based on the signals and any financial data provided, write a financial analysis.

IMPORTANT ANTI-HALLUCINATION RULE: If you do not have financial data from SEC EDGAR or Companies House, you MUST state "No verified financial data available" and explain why. Do NOT invent revenue figures, margins, or growth rates.

If financial data from SEC or Companies House is available, calculate an indicative EV range using sector multiples:
- SaaS: 3-10x Revenue | Fintech: 2-8x Revenue | Food/Consumer: 0.3-1x Revenue | Healthcare: 2-5x Revenue | Energy: 4-8x EBITDA | Logistics: 6-10x EBITDA | Real Estate: based on NAV

SUBJECT: ${query}
${financialDataText ? `FINANCIAL DATA:\n${financialDataText}` : "FINANCIAL DATA: Not available (private or non-UK/US company). State this explicitly — do not estimate revenue or margins."}

SIGNALS:
${signalText}`;

    const financialCompact = isSector
      ? `Describe typical ${query} sector valuation multiples for M&A. No individual company financials. 200 words max.`
      : `Write a financial analysis for "${query}" M&A opportunity. ${financialDataText ? "Use financial data to estimate EV range with sector multiples." : "No financial data available — state this clearly. Never fabricate numbers."} Maximum 300 words.

${financialDataText ? `FINANCIAL DATA: ${financialDataText.slice(0, 300)}` : ""}`;

    // Task C — Signals JSON only (acquirers moved to separate tasks)
    const marketFull = `You are an M&A market intelligence expert. Based on the signals, detect 5-8 specific deal signals. Return ONLY valid JSON, no markdown.

SUBJECT: ${query} | DEAL TYPE: ${dealType}

SIGNALS:
${signalText}

Return this exact JSON:
{"signalStrength":"HIGH|MEDIUM|LOW|UNKNOWN","sector":"detected sector","signals":[{"text":"specific signal observation","found":true,"source":"url if available or empty string","category":"DEAL|LEADERSHIP|FINANCIAL|STRATEGIC|DISTRESS"}]}

Rules: Only include signals with real evidence from the data above. Do not fabricate signals.`;

    const marketCompact = `Detect deal signals for "${query}". Return ONLY valid JSON: {"signalStrength":"HIGH|MEDIUM|LOW|UNKNOWN","sector":"string","signals":[{"text":"string","found":true,"source":"","category":"DEAL|LEADERSHIP|FINANCIAL|STRATEGIC|DISTRESS"}]}. Maximum 200 words.`;

    // Synthesis prompt
    const synthPrompt = `You are synthesising three separate AI analyses of the same M&A deal opportunity into a professional mandate brief. Combine them into one coherent report structured as:

DEAL SIGNAL ASSESSMENT
FINANCIAL ANALYSIS
KEY SIGNALS ANALYSIS
RISKS AND CONSIDERATIONS
RECOMMENDED NEXT STEPS

Where analyses agree, present as consensus. Where they disagree, present both views. Prioritise specific data points over generic statements. Write like a senior Lazard analyst. Output must read as one unified professional note. Maximum 600 words total.`;

    // ── Step 4: Build acquirer prompts for 4 parallel tasks ──────────────

    const acquirerBase = `
SUBJECT: ${query}
DEAL TYPE: ${dealType}
SECTOR: detected from signals
SIGNALS SUMMARY: ${signalText.slice(0, 400)}`;

    const acquirerArraySchema = `[{"name":"Acquirer Name","type":"Strategic|Financial","rationale":"Three specific sentences: why they need this asset, what strategic gap it fills, and reference a real precedent deal they did.","dealStructure":"e.g. Full acquisition, carve-out, strategic stake","precedentTransaction":"Real named deal e.g. Microsoft acquired LinkedIn for $26bn in 2016","likelihood":"High|Medium|Low"}]`;

    const strategicAcqFull = `You are a senior M&A banker. Identify 3-4 strategic acquirers (corporates, industry players) for this target.
${acquirerBase}

You MUST return exactly 3-4 real, named strategic acquirers. Each rationale must be 3 specific sentences referencing real precedent transactions they have completed. Never use generic phrases.
Return ONLY a valid JSON array — no markdown, no explanation:
${acquirerArraySchema}`;

    const strategicAcqCompact = `Senior M&A banker: identify 3 real strategic corporate acquirers for "${query}" (${dealType}). Each must have a real precedent deal. JSON array only: ${acquirerArraySchema.slice(0, 200)}`;

    const financialAcqFull = `You are a private equity specialist. Identify 2-3 financial acquirers (PE firms, infrastructure funds) for this target.
${acquirerBase}

You MUST return exactly 2-3 real, named PE firms or financial sponsors. Each rationale must reference specific past deals they have completed in this sector. Never fabricate deals.
Return ONLY a valid JSON array — no markdown, no explanation:
${acquirerArraySchema}`;

    const financialAcqCompact = `PE specialist: identify 2 real PE firms or financial sponsors for "${query}" (${dealType}). Real precedent deals required. JSON array only: ${acquirerArraySchema.slice(0, 200)}`;

    const intlAcqFull = `You are an international M&A specialist. Identify 2-3 international or cross-border acquirers for this target (foreign corporates, sovereign funds, international PE).
${acquirerBase}

You MUST return exactly 2-3 real, named international acquirers. Each rationale must reference their specific expansion strategy and a real cross-border deal they completed. Be specific — no generic statements.
Return ONLY a valid JSON array — no markdown, no explanation:
${acquirerArraySchema}`;

    const intlAcqCompact = `International M&A specialist: identify 2 real international or cross-border acquirers for "${query}" (${dealType}). Real cross-border precedent deals required. JSON array only: ${acquirerArraySchema.slice(0, 200)}`;

    const contrarianAcqFull = `You are a contrarian M&A analyst. Identify 1-2 non-obvious or unexpected acquirers for this target — adjacent-sector players, new entrants, or unusual strategic combinations.
${acquirerBase}

Return 1-2 real named acquirers with a specific rationale for why this would be a non-obvious but strategic acquisition. Reference a real deal showing they have appetite for adjacency moves.
Return ONLY a valid JSON array — no markdown, no explanation:
${acquirerArraySchema}`;

    const contrarianAcqCompact = `Contrarian M&A analyst: identify 1 non-obvious acquirer for "${query}" (${dealType}). Specific precedent required. JSON array only: ${acquirerArraySchema.slice(0, 200)}`;

    // ── Step 5: Run all tasks in parallel ────────────────────────────────
    const [
      taskASettled,
      taskBSettled,
      taskCSettled,
      strategicAcqSettled,
      financialAcqSettled,
      intlAcqSettled,
      contrarianAcqSettled,
    ] = await Promise.allSettled([
      runModelChain("Strategic", buildStrategicChain(), strategicFull, strategicCompact),
      runModelChain("Financial", buildFinancialChain(), financialFull, financialCompact),
      runModelChain("Market", buildMarketChain(), marketFull, marketCompact),
      runAcquirerTask(
        strategicAcqFull, strategicAcqCompact, "Groq Llama 70b",
        (p, t) => callGroq("llama-3.3-70b-versatile", p, t),
        (p, t) => callGroq("mixtral-8x7b-32768", p, t)
      ),
      runAcquirerTask(
        financialAcqFull, financialAcqCompact, "DeepSeek",
        (p, t) => callDeepSeek("You are a private equity and financial sponsor deal specialist with deep knowledge of buyout precedents.", p, t)
      ),
      runAcquirerTask(
        intlAcqFull, intlAcqCompact, "Gemini Flash",
        (p, t) => callGemini(p, t)
      ),
      runAcquirerTask(
        contrarianAcqFull, contrarianAcqCompact, "Mistral Small",
        (p, t) => callMistral(p, t)
      ),
    ]);

    const fallbackTask: TaskResult = { content: "", model: "none", status: "unavailable" };
    const fallbackAcqResult: AcquirerTaskResult = { acquirers: [], model: "none", status: "unavailable" };

    const taskAResult = taskASettled.status === "fulfilled" ? taskASettled.value : fallbackTask;
    const taskBResult = taskBSettled.status === "fulfilled" ? taskBSettled.value : fallbackTask;
    const taskCResult = taskCSettled.status === "fulfilled" ? taskCSettled.value : fallbackTask;

    // ── Step 6: Synthesis ──────────────────────────────────────────────────
    const synthesis = await runSynthesis(taskAResult, taskBResult, taskCResult, synthPrompt);

    // ── Step 7: Assemble acquirers ────────────────────────────────────────
    const strategicAcqResult = strategicAcqSettled.status === "fulfilled" ? strategicAcqSettled.value : fallbackAcqResult;
    const financialAcqResult = financialAcqSettled.status === "fulfilled" ? financialAcqSettled.value : fallbackAcqResult;
    const intlAcqResult = intlAcqSettled.status === "fulfilled" ? intlAcqSettled.value : fallbackAcqResult;
    const contrarianAcqResult = contrarianAcqSettled.status === "fulfilled" ? contrarianAcqSettled.value : fallbackAcqResult;

    const allAcquirers = deduplicateAcquirers(
      sortAcquirers([
        ...strategicAcqResult.acquirers,
        ...financialAcqResult.acquirers,
        ...intlAcqResult.acquirers,
        ...contrarianAcqResult.acquirers,
      ])
    );

    // ── Step 8: Parse signals from Task C ─────────────────────────────────
    const taskCParsed = safeParseJSON(taskCResult.content);

    const signals = (taskCParsed?.signals as unknown[]) ?? [];
    const signalStrength = (taskCParsed?.signalStrength as string) ?? "UNKNOWN";
    const detectedSector = (taskCParsed?.sector as string) ?? "Unknown";

    // Only show signals with real source URLs from Serper
    const validSignalUrls = new Set(signalUnique.map((r) => r.link));
    const filteredSignals = (signals as Array<{ text: string; found: boolean; source?: string; category?: string }>)
      .map((s) => ({
        ...s,
        source: s.source && validSignalUrls.has(s.source) ? s.source : "",
      }));

    // ── Step 9: Financials from Task B ────────────────────────────────────
    let financials = null;
    if (!isSector && hasSourceData && taskBResult.status === "success") {
      const validatedContent = validateFinancialContent(taskBResult.content, hasSourceData);
      financials = {
        keyMetrics: validatedContent.slice(0, 600),
        source: useSecData ? "SEC EDGAR" : useChData ? "Companies House" : null,
        sourceUrl: useSecData ? secResult.url : useChData ? chResult.url : null,
      };
    }

    const analysisQuality = determineAnalysisQuality(taskAResult, taskBResult, taskCResult, synthesis);

    const contributions = [
      { task: "strategic" as const, displayName: "Strategic Analysis", model: taskAResult.model, status: taskAResult.status },
      { task: "financial" as const, displayName: "Financial Analysis", model: taskBResult.model, status: taskBResult.status },
      { task: "market" as const, displayName: "Signal Intelligence", model: taskCResult.model, status: taskCResult.status },
      { task: "institutional" as const, displayName: "Strategic Acquirers", model: strategicAcqResult.model, status: strategicAcqResult.status },
      { task: "family_office" as const, displayName: "Financial Acquirers", model: financialAcqResult.model, status: financialAcqResult.status },
      { task: "angels" as const, displayName: "International Acquirers", model: intlAcqResult.model, status: intlAcqResult.status },
      { task: "strategic_inv" as const, displayName: "Contrarian Acquirers", model: contrarianAcqResult.model, status: contrarianAcqResult.status },
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
      signals: filteredSignals,
      financials,
      likelyAcquirers: allAcquirers,
      mandateBrief: synthesis.content,
      degradedNote,
      meta: {
        modelUsed: taskCResult.model,
        generatedAt: new Date().toISOString(),
        sourceCount,
        searchCount: allBatches.length,
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
