import { NextRequest, NextResponse } from "next/server";
import {
  truncateSignals,
  formatSignalsForPrompt,
  buildStrategicChain,
  buildFinancialChain,
  buildMarketChain,
  buildLightChain,
  runModelChain,
  runSynthesis,
  determineAnalysisQuality,
  safeParseJSON,
} from "@/lib/triangulate";
import type { InvestorResult } from "@/types";

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
    const { companyName, description, sector, stage, amount, currency, geography, inputType } = body;

    const raiseAmount = `${currency ?? "USD"} ${amount}`;
    const companyDescription = description || companyName;
    const isDescription = inputType === "description";

    // ── Step 1: Parallel Serper searches ──────────────────────────────────
    let searchBatches: [string, string][];

    if (isDescription) {
      // Description-based searches (Enhancement 2)
      searchBatches = [
        // Batch 1 — Recent fundraises in this space
        [`${sector} ${geography} ${stage} funding 2026`, "Recent Fundraises"],
        [`${sector} startup ${geography} raises ${amount} 2026`, "Recent Fundraises"],
        [`${sector} investment ${geography} series ${stage} 2026`, "Recent Fundraises"],
        // Batch 2 — Active investors in this space
        [`top ${sector} investors ${geography} 2026`, "Active Investors"],
        [`${sector} VC ${geography} active deals 2026`, "Active Investors"],
        [`${sector} angel investors ${geography} 2026`, "Active Investors"],
        [`family office ${sector} ${geography} investment 2026`, "Active Investors"],
        // Batch 3 — Comparable raises
        [`${sector} ${stage} ${amount} raise ${geography} 2026`, "Comparable Raises"],
        [`${sector} comparable deals 2025 2026`, "Comparable Raises"],
        [`${sector} ${stage} funding round announced 2025 2026`, "Comparable Raises"],
        // Batch 4 — Investor activity signals
        [`${sector} fund new raise 2025 2026 ${geography}`, "Investor Activity"],
        [`${sector} investor deploy capital 2026`, "Investor Activity"],
        [`${sector} site:linkedin.com investment announcement`, "Investor Activity"],
        [`${sector} site:twitter.com new investment 2026`, "Investor Activity"],
        // Batch 5 — Market context
        [`${sector} M&A deal activity valuations 2026`, "Market Context"],
        [`${geography} startup ecosystem venture activity ${sector} 2026`, "Market Context"],
      ];
    } else {
      // Company-specific searches (existing)
      searchBatches = [
        [`${companyName} ${sector} company news funding 2025 2026`, "Company News"],
        [`${companyName} revenue growth traction metrics`, "Company Metrics"],
        [`${sector} venture capital new fund close 2025 OR 2026`, "Fund Activity"],
        [`${sector} private equity fund raises capital 2025 OR 2026`, "Fund Activity"],
        [`${geography} ${sector} investor first close final close 2025 2026`, "Fund Activity"],
        [`${sector} ${stage} investor AUM billion 2025 2026`, "Fund Activity"],
        [`${sector} ${stage} investor invests backs leads round 2026`, "Recent Investments"],
        [`${sector} ${stage} portfolio company announcement investment 2026`, "Recent Investments"],
        [`${geography} ${sector} series A OR series B OR growth investment 2026`, "Recent Investments"],
        [`${sector} ${stage} investor site:twitter.com announcement investment`, "Social Signals"],
        [`${sector} fund manager site:linkedin.com fund raise deploy 2026`, "Social Signals"],
        [`${sector} venture capital fund size target ${geography} 2025 2026`, "Fund Mandate"],
        [`${sector} ${stage} investment thesis stage geography focus`, "Fund Mandate"],
        [`${geography} ${sector} family office sovereign wealth fund investment 2026`, "Fund Mandate"],
        [`${sector} M&A deal activity valuations 2026`, "Market Context"],
        [`${geography} startup ecosystem venture activity ${sector} 2026`, "Market Context"],
      ];
    }

    const settled = await Promise.allSettled(
      searchBatches.map(([q, cat]) => serperSearch(q, cat))
    );
    const allResults: SearchResult[] = settled.flatMap((r) =>
      r.status === "fulfilled" ? r.value : []
    );
    const uniqueResults = allResults.filter(
      (r, i, arr) => r.link && arr.findIndex((x) => x.link === r.link) === i
    );

    const sourceCount = uniqueResults.length;
    const dataConfidence = sourceCount >= 5 ? "High" : sourceCount >= 2 ? "Medium" : "Low";

    // ── Step 2: Truncate signals before any AI call ───────────────────────
    const truncated = truncateSignals(uniqueResults);
    const signalText = formatSignalsForPrompt(truncated);

    // ── Step 3: Build prompts for each task ────────────────────────────────

    const strategicFull = `You are a Managing Director at Goldman Sachs with 20 years in capital raising across VC, PE, and institutional fundraising globally.

Based on the company profile and market signals, write a strategic investment thesis for this capital raise. Explain why investors should be interested, the market timing opportunity, and the key investment narrative. Reference specific sector dynamics and comparable companies where possible. Maximum 400 words.

COMPANY: ${companyDescription}
SECTOR: ${sector} | STAGE: ${stage} | RAISING: ${raiseAmount} | GEOGRAPHY: ${geography}

MARKET SIGNALS:
${signalText}`;

    const strategicCompact = `Write a strategic investment thesis for a ${stage} ${sector} company raising ${raiseAmount} in ${geography}. Focus on investor appeal, market timing, and investment narrative. Maximum 300 words. Be concise and direct.

SIGNALS: ${signalText.slice(0, 400)}`;

    const financialFull = `You are a senior capital markets analyst. Based on the market signals provided, write a financial context note for this capital raise. Cover: typical valuations for this sector and stage, comparable recent fundraising rounds, current fundraising market conditions. If no specific financial data is in the signals, state this clearly — never fabricate numbers. Maximum 400 words.

SECTOR: ${sector} | STAGE: ${stage} | RAISING: ${raiseAmount} | GEOGRAPHY: ${geography}

MARKET SIGNALS:
${signalText}`;

    const financialCompact = `Write a financial context note for a ${stage} ${sector} raise of ${raiseAmount}. Cover valuations, comparable rounds, and market conditions. If no financial data in signals, say so. Maximum 300 words. Be concise and direct.

SIGNALS: ${signalText.slice(0, 400)}`;

    const marketFull = `You are an expert in global institutional investors. Identify 8-10 specific, real investors most likely to invest in this company. Return ONLY a valid JSON object, no markdown.

COMPANY: ${companyDescription}
SECTOR: ${sector} | STAGE: ${stage} | RAISING: ${raiseAmount} | GEOGRAPHY: ${geography}

MARKET SIGNALS:
${signalText}

Return this exact JSON structure:
{"investors":[{"name":"string","type":"VC|PE|Angel|Family Office|SWF|Corporate","chequeSize":"string","sectorFocus":["string"],"geographicFocus":"string","whyTheyFit":"Two sentences referencing their actual known portfolio.","outreachAngle":"One specific, non-generic sentence.","fundActivity":"Recently Active|Active|Quiet|Unknown","fundStatus":"Raising|Deploying|Harvesting|Unknown","recentSignal":"string or null"}]}`;

    const marketCompact = `Identify 6-8 real investors for a ${stage} ${sector} company raising ${raiseAmount} in ${geography}. Return ONLY valid JSON: {"investors":[{"name":"string","type":"string","chequeSize":"string","sectorFocus":["string"],"geographicFocus":"string","whyTheyFit":"string","outreachAngle":"string","fundActivity":"Recently Active|Active|Quiet|Unknown","fundStatus":"string","recentSignal":"string or null"}]}. Respond in maximum 300 words total. Be concise and direct.`;

    const synthPrompt = `You are synthesising three separate AI analyses of the same capital raise opportunity. Combine them into one coherent 2-3 sentence company summary that captures the strategic opportunity, financial context, and investor appeal. Where analyses agree, present as consensus. Where they disagree, present both views. Prioritise specific data points over generic statements. Output must read as one unified analyst note, not three separate pieces. Maximum 600 words total.`;

    // ── Step 4: Run all three tasks in parallel ────────────────────────────
    const [taskAResult, taskBResult, taskCResult] = await Promise.all([
      runModelChain("Strategic", buildStrategicChain(), strategicFull, strategicCompact),
      runModelChain("Financial", buildFinancialChain(), financialFull, financialCompact),
      runModelChain("Market", buildMarketChain(), marketFull, marketCompact),
    ]);

    // ── Step 5: Synthesis ──────────────────────────────────────────────────
    const synthesis = await runSynthesis(taskAResult, taskBResult, taskCResult, synthPrompt);

    // ── Step 6: Extract structured data from Task C ────────────────────────
    const taskCParsed = safeParseJSON(taskCResult.content);
    const investors = (taskCParsed?.investors as InvestorResult[]) ?? [];

    // ── Step 7: Pitch Positioning + Comparable Raises (parallel) ──────────
    const investorTypes = Array.from(new Set(investors.map((inv) => inv.type))).slice(0, 5);

    const pitchPrompt = `You are a capital markets advisor. Generate a specific pitch positioning guide for each investor type listed below. Return ONLY valid JSON, no markdown.

COMPANY: ${companyDescription}
SECTOR: ${sector} | STAGE: ${stage} | RAISING: ${raiseAmount} | GEOGRAPHY: ${geography}
INVESTOR TYPES: ${investorTypes.join(", ") || "VC, Angel, Family Office"}

{"pitchPositioning":[{"investorType":"VC","howToFrame":"Two specific sentences on positioning for this investor type.","keyMetrics":["metric 1","metric 2","metric 3"],"whatToAvoid":"One sentence.","idealIntro":"One sentence on best introduction approach."}]}

Generate one object per investor type. Be specific to this company profile, not generic.`;

    const comparablePrompt = `Extract real fundraising events from these market intelligence signals. Look for companies that announced raising money — include company name, amount, stage, sector, investors, and date. Return ONLY valid JSON with maximum 5 entries.

SIGNALS:
${signalText}

{"comparableRaises":[{"companyName":"string","amount":"string","stage":"string","sector":"string","geography":"string","date":"string","keyInvestors":"string","sourceUrl":"string"}]}

If no specific fundraising events are found in the signals, return {"comparableRaises":[]}. Only include events explicitly mentioned in the signals.`;

    const [pitchSettled, comparableSettled] = await Promise.allSettled([
      runModelChain("Pitch", buildLightChain(), pitchPrompt, pitchPrompt),
      runModelChain("Comparables", buildLightChain(), comparablePrompt, comparablePrompt),
    ]);

    const pitchResult = pitchSettled.status === "fulfilled" ? pitchSettled.value : null;
    const comparableResult = comparableSettled.status === "fulfilled" ? comparableSettled.value : null;

    const pitchParsed = pitchResult ? safeParseJSON(pitchResult.content) : null;
    const pitchPositioning = (pitchParsed?.pitchPositioning as unknown[]) ?? [];

    const comparableParsed = comparableResult ? safeParseJSON(comparableResult.content) : null;
    const comparableRaises = (comparableParsed?.comparableRaises as unknown[]) ?? [];

    // Quality determination
    const analysisQuality = determineAnalysisQuality(taskAResult, taskBResult, taskCResult, synthesis);

    const contributions = [
      { task: "strategic" as const, displayName: "Strategic Analysis", model: taskAResult.model, status: taskAResult.status },
      { task: "financial" as const, displayName: "Financial Analysis", model: taskBResult.model, status: taskBResult.status },
      { task: "market" as const, displayName: "Market Intelligence", model: taskCResult.model, status: taskCResult.status },
    ];

    const companySummary = synthesis.fallback
      ? (taskAResult.content.slice(0, 300) || taskBResult.content.slice(0, 300) || "Analysis complete.")
      : synthesis.content.slice(0, 400);

    // Display name: for description input, derive a short label
    const displayName = isDescription
      ? (sector && stage ? `${stage} ${sector} Raise` : (companyName || "").slice(0, 60))
      : companyName;

    const degradedNote =
      analysisQuality === "Degraded"
        ? "Some analysis modules unavailable — showing available intelligence only"
        : null;

    return NextResponse.json({
      companyName: displayName,
      sector,
      stage,
      amount: raiseAmount,
      geography,
      companySummary,
      investors,
      comparableRaises,
      pitchPositioning,
      degradedNote,
      meta: {
        modelUsed: taskCResult.model,
        generatedAt: new Date().toISOString(),
        sourceCount,
        searchCount: searchBatches.length,
        dataConfidence,
        sources: uniqueResults.map((r) => ({ title: r.title, url: r.link, category: r.category, snippet: r.snippet })),
        rawSignals: uniqueResults.map((r) => ({ headline: r.title, url: r.link, category: r.category, snippet: r.snippet })),
        contributions,
        synthesisModel: synthesis.model,
        synthesisFallback: synthesis.fallback,
        analysisQuality,
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
