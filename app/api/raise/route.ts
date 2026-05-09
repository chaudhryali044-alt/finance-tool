import { NextRequest, NextResponse } from "next/server";
import {
  truncateSignals,
  formatSignalsForPrompt,
  buildStrategicChain,
  buildFinancialChain,
  buildLightChain,
  runModelChain,
  runSynthesis,
  determineAnalysisQuality,
  safeParseJSON,
  callGroq,
  callDeepSeek,
  callGemini,
  callMistral,
} from "@/lib/triangulate";
import type { InvestorResult, TaskStatus } from "@/types";
import type { TaskResult } from "@/lib/triangulate";

const SERPER_API_KEY = process.env.SERPER_API_KEY!;

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  category: string;
}

interface InvestorTaskResult {
  investors: InvestorResult[];
  model: string;
  status: TaskStatus;
}

// ─── Investor normalisation helpers ───────────────────────────────────────

function normalizeActivity(signal: string): InvestorResult["fundActivity"] {
  const s = (signal ?? "").toLowerCase();
  if (s === "green" || s.includes("recently active")) return "Recently Active";
  if (s === "yellow" || s.includes("active")) return "Active";
  if (s === "red" || s.includes("quiet")) return "Quiet";
  return "Unknown";
}

function safeParseInvestorArray(text: string, modelLabel: string): InvestorResult[] {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((inv: unknown) => inv && typeof inv === "object" && (inv as Record<string, unknown>).name)
      .map((inv: unknown) => {
        const i = inv as Record<string, unknown>;
        const geoFocus = Array.isArray(i.geographicFocus)
          ? (i.geographicFocus as string[]).join(", ")
          : String(i.geographicFocus ?? "");
        const cheque = String(i.chequeSize ?? i.typicalCheque ?? "N/A");
        const rawActivity = String(i.activitySignal ?? i.fundActivity ?? "");
        const activityReason = i.activityReason ? String(i.activityReason) : null;
        const recentNews = Array.isArray(i.recentNews) ? (i.recentNews as string[]) : [];
        const recentSignal = activityReason
          ? `${activityReason}${recentNews.length > 0 ? ` — ${recentNews[0]}` : ""}`
          : (i.recentSignal ? String(i.recentSignal) : null);
        const fundStatus = ["Raising", "Deploying", "Harvesting", "Unknown"].includes(String(i.fundStatus))
          ? (String(i.fundStatus) as InvestorResult["fundStatus"])
          : "Unknown";
        return {
          name: String(i.name ?? ""),
          type: String(i.type ?? "VC"),
          chequeSize: cheque,
          sectorFocus: Array.isArray(i.sectorFocus)
            ? (i.sectorFocus as string[])
            : [String(i.sectorFocus ?? "")].filter(Boolean),
          geographicFocus: geoFocus,
          whyTheyFit: String(i.whyTheyFit ?? ""),
          outreachAngle: String(i.outreachAngle ?? ""),
          fundActivity: normalizeActivity(rawActivity),
          fundStatus,
          recentSignal,
          identifiedBy: modelLabel,
        } satisfies InvestorResult;
      });
  } catch {
    return [];
  }
}

function deduplicateInvestors(investors: InvestorResult[]): InvestorResult[] {
  const seen = new Set<string>();
  return investors.filter((inv) => {
    const key = inv.name.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ACTIVITY_ORDER: Record<string, number> = {
  "Recently Active": 0, "Active": 1, "Quiet": 2, "Unknown": 3,
};

function sortInvestors(investors: InvestorResult[]): InvestorResult[] {
  return [...investors].sort(
    (a, b) => (ACTIVITY_ORDER[a.fundActivity] ?? 3) - (ACTIVITY_ORDER[b.fundActivity] ?? 3)
  );
}

// ─── Investor task runner (handles 429/413, empty-parse retry) ────────────

async function runInvestorTask(
  fullPrompt: string,
  compactPrompt: string,
  modelLabel: string,
  primaryCall: (prompt: string, maxTokens: number) => Promise<string>,
  fallbackCall?: (prompt: string, maxTokens: number) => Promise<string>
): Promise<InvestorTaskResult> {
  const tryCall = async (
    call: typeof primaryCall,
    prompt: string,
    maxT: number
  ): Promise<{ investors: InvestorResult[] } | { httpStatus: number } | { failed: true }> => {
    try {
      const content = await call(prompt, maxT);
      return { investors: safeParseInvestorArray(content, modelLabel) };
    } catch (e) {
      const s = (e as { httpStatus?: number })?.httpStatus;
      if (s) return { httpStatus: s };
      return { failed: true };
    }
  };

  // 1. Primary model, full prompt
  const r1 = await tryCall(primaryCall, fullPrompt, 1500);
  if ("investors" in r1 && r1.investors.length > 0) {
    return { investors: r1.investors, model: modelLabel, status: "success" };
  }

  // 2. Primary model, compact prompt (handles 413 and empty JSON parse)
  const httpStatus1 = "httpStatus" in r1 ? r1.httpStatus : 0;
  if (httpStatus1 !== 429) {
    const r2 = await tryCall(primaryCall, compactPrompt, 800);
    if ("investors" in r2 && r2.investors.length > 0) {
      return { investors: r2.investors, model: modelLabel, status: "success" };
    }
  }

  // 3. Fallback model, compact prompt (handles 429 and persistent failures)
  if (fallbackCall) {
    const r3 = await tryCall(fallbackCall, compactPrompt, 600);
    if ("investors" in r3 && r3.investors.length > 0) {
      return { investors: r3.investors, model: `${modelLabel} (fallback)`, status: "success" };
    }
    if ("httpStatus" in r3 && r3.httpStatus === 429) {
      return { investors: [], model: modelLabel, status: "rate_limited" };
    }
  }

  const finalStatus: TaskStatus = httpStatus1 === 429 ? "rate_limited"
    : httpStatus1 === 413 ? "token_limit"
    : "unavailable";
  return { investors: [], model: modelLabel, status: finalStatus };
}

// ─── Serper helper ─────────────────────────────────────────────────────────

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

// ─── POST handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyName, description, sector, stage, amount, currency, geography, inputType } = body;

    const raiseAmount = `${currency ?? "USD"} ${amount}`;
    const companyDescription = description || companyName;
    const isDescription = inputType === "description";

    // FIX 1 — clean display name, never template placeholders
    const geoShort = geography ? geography.split(",")[0].trim() : "";
    const displayName = isDescription
      ? `Undisclosed${geoShort ? ` ${geoShort}` : ""}${sector ? ` ${sector}` : ""} Company`
      : companyName;

    // ── Step 1: Parallel Serper searches ────────────────────────────────────
    let searchBatches: [string, string][];

    if (isDescription) {
      searchBatches = [
        // Batch 1 — Recent fundraises
        [`${geography} ${sector} ${stage} funding 2025 2026`, "Recent Fundraises"],
        [`${sector} startup ${geography} raises ${stage} round 2026`, "Recent Fundraises"],
        [`${sector} investment ${geography} series ${stage} 2026`, "Recent Fundraises"],
        // Batch 2 — Active investors
        [`top ${sector} investors ${geography} 2026`, "Active Investors"],
        [`${sector} VC ${geography} active deals 2026`, "Active Investors"],
        [`${sector} angel investors ${geography} 2026`, "Active Investors"],
        [`family office ${sector} ${geography} investment 2026`, "Active Investors"],
        // Batch 3 — Comparable raises (FIX 3 — more targeted)
        [`${geography} ${sector} angel investment 2025 2026`, "Comparable Raises"],
        [`early stage ${sector} ${geography} investment 2026`, "Comparable Raises"],
        [`${sector} ${stage} ${geography} 2026 funding announced`, "Comparable Raises"],
        [`${sector} ${stage} raise ${geography} startup 2025`, "Comparable Raises"],
        [`${stage} ${sector} ${geography} investor round close 2026`, "Comparable Raises"],
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
        // FIX 3 — comparable raise searches added for company mode too
        [`${geography} ${sector} ${stage} funding 2025 2026`, "Comparable Raises"],
        [`${sector} comparable deals fundraise announced 2025 2026`, "Comparable Raises"],
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

    // ── Step 2: Truncate signals ─────────────────────────────────────────────
    const truncated = truncateSignals(uniqueResults);
    const signalText = formatSignalsForPrompt(truncated);

    // ── Step 3: Build narrative prompts (Tasks A + B) ──────────────────────
    const strategicFull = `You are a Managing Director at Goldman Sachs with 20 years in capital raising across VC, PE, and institutional fundraising globally.

Write a strategic investment thesis for this capital raise. Explain why investors should be interested, the market timing opportunity, and the key investment narrative. Reference specific sector dynamics and comparable companies where possible. Maximum 400 words.

COMPANY: ${companyDescription}
SECTOR: ${sector} | STAGE: ${stage} | RAISING: ${raiseAmount} | GEOGRAPHY: ${geography}

MARKET SIGNALS:
${signalText}`;

    const strategicCompact = `Write a strategic investment thesis for a ${stage} ${sector} company raising ${raiseAmount} in ${geography}. Focus on investor appeal and market timing. Maximum 300 words.

SIGNALS: ${signalText.slice(0, 400)}`;

    const financialFull = `You are a senior capital markets analyst. Write a financial context note for this capital raise. Cover: typical valuations, comparable recent fundraising rounds, current market conditions. Never fabricate numbers — if not in signals, state that clearly. Maximum 400 words.

SECTOR: ${sector} | STAGE: ${stage} | RAISING: ${raiseAmount} | GEOGRAPHY: ${geography}

MARKET SIGNALS:
${signalText}`;

    const financialCompact = `Write a financial context note for a ${stage} ${sector} raise of ${raiseAmount} in ${geography}. Cover valuations and market conditions. 300 words max.

SIGNALS: ${signalText.slice(0, 400)}`;

    // ── Step 4: Build investor prompts (FIX 5 — 4 specialist tasks) ──────────
    const investorBase = `
DEAL PROFILE:
${companyDescription}
SECTOR: ${sector} | STAGE: ${stage} | RAISING: ${raiseAmount} | GEOGRAPHY: ${geography}

MARKET INTELLIGENCE:
${signalText.slice(0, 600)}`;

    const investorArraySchema = `[{"name":"string","type":"VC|PE|Angel|Family Office|SWF|Corporate","chequeSize":"e.g. $500k–$2m","sectorFocus":["string"],"geographicFocus":"string","whyTheyFit":"Two sentences referencing actual known portfolio and deal fit.","outreachAngle":"One specific non-generic outreach sentence.","fundActivity":"Recently Active|Active|Quiet|Unknown","fundStatus":"Raising|Deploying|Harvesting|Unknown","recentSignal":"string or null"}]`;

    const institutionalFull = `You are a senior Goldman Sachs banker. Identify top-tier institutional investors (VCs and PE firms) for this deal.
${investorBase}

You MUST return exactly 3-4 specific, real, named investors. This is non-negotiable. Use your knowledge of active investors in this sector and geography even if market signals are limited.
Return ONLY a valid JSON array — no markdown, no explanation:
${investorArraySchema}`;

    const institutionalCompact = `Goldman Sachs banker: identify 3 real VC or PE investors for a ${stage} ${sector} raise of ${raiseAmount} in ${geography}. JSON array only: ${investorArraySchema.slice(0, 200)}`;

    const familyOfficeFull = `You are a private wealth specialist. Identify family offices and UHNWI investors for this deal.
${investorBase}

You MUST return exactly 3-4 specific, real, named family offices or UHNWI investors. Even if signals are limited, draw on your knowledge of family offices active in this sector and geography.
Return ONLY a valid JSON array — no markdown, no explanation:
${investorArraySchema}`;

    const familyOfficeCompact = `Private wealth specialist: identify 3 real family offices for a ${stage} ${sector} raise in ${geography}. JSON array only: ${investorArraySchema.slice(0, 200)}`;

    const angelsFull = `You are a startup ecosystem specialist. Identify angel investors and micro VCs for this deal.
${investorBase}

You MUST return exactly 3-4 specific, real, named angel investors or micro VCs. Draw on your knowledge of active angels and micro VCs in this sector and geography.
Return ONLY a valid JSON array — no markdown, no explanation:
${investorArraySchema}`;

    const angelsCompact = `Startup specialist: identify 3 real angels or micro VCs for a ${stage} ${sector} raise in ${geography}. JSON array only: ${investorArraySchema.slice(0, 200)}`;

    const strategicInvFull = `You are a corporate development specialist. Identify strategic investors, corporate VCs, accelerators, and government funds relevant to this deal.
${investorBase}

You MUST return exactly 2-3 specific, real, named strategic investors or corporate VCs. Draw on your knowledge of corporate investors active in this sector and geography.
Return ONLY a valid JSON array — no markdown, no explanation:
${investorArraySchema}`;

    const strategicInvCompact = `Corp dev specialist: identify 2 real strategic investors or corporate VCs for a ${stage} ${sector} raise in ${geography}. JSON array only: ${investorArraySchema.slice(0, 200)}`;

    const synthPrompt = `You are synthesising three separate AI analyses of the same capital raise opportunity. Combine them into one coherent 2-3 sentence company summary capturing the strategic opportunity, financial context, and investor appeal. Prioritise specific data points. Output must read as one unified analyst note. Maximum 600 words total.`;

    // ── Step 5: Run all tasks in parallel ────────────────────────────────────
    const [
      taskASettled,
      taskBSettled,
      instSettled,
      foSettled,
      angelsSettled,
      stratInvSettled,
    ] = await Promise.allSettled([
      runModelChain("Strategic", buildStrategicChain(), strategicFull, strategicCompact),
      runModelChain("Financial", buildFinancialChain(), financialFull, financialCompact),
      runInvestorTask(
        institutionalFull, institutionalCompact, "Groq Llama 70b",
        (p, t) => callGroq("llama-3.3-70b-versatile", p, t),
        (p, t) => callGroq("mixtral-8x7b-32768", p, t)
      ),
      runInvestorTask(
        familyOfficeFull, familyOfficeCompact, "DeepSeek",
        (p, t) => callDeepSeek(p, t)
      ),
      runInvestorTask(
        angelsFull, angelsCompact, "Gemini Flash",
        (p, t) => callGemini(p, t)
      ),
      runInvestorTask(
        strategicInvFull, strategicInvCompact, "Mistral Small",
        (p, t) => callMistral(p, t)
      ),
    ]);

    const fallbackTaskResult: TaskResult = { content: "", model: "none", status: "unavailable" };
    const taskAResult = taskASettled.status === "fulfilled" ? taskASettled.value : fallbackTaskResult;
    const taskBResult = taskBSettled.status === "fulfilled" ? taskBSettled.value : fallbackTaskResult;
    const instResult: InvestorTaskResult = instSettled.status === "fulfilled" ? instSettled.value : { investors: [], model: "Groq Llama 70b", status: "unavailable" };
    const foResult: InvestorTaskResult = foSettled.status === "fulfilled" ? foSettled.value : { investors: [], model: "DeepSeek", status: "unavailable" };
    const angelsResult: InvestorTaskResult = angelsSettled.status === "fulfilled" ? angelsSettled.value : { investors: [], model: "Gemini Flash", status: "unavailable" };
    const stratInvResult: InvestorTaskResult = stratInvSettled.status === "fulfilled" ? stratInvSettled.value : { investors: [], model: "Mistral Small", status: "unavailable" };

    // ── Step 6: Merge, deduplicate, sort investors ──────────────────────────
    const merged = deduplicateInvestors(
      sortInvestors([
        ...instResult.investors,
        ...foResult.investors,
        ...angelsResult.investors,
        ...stratInvResult.investors,
      ])
    );

    // Fallback: if fewer than 5 investors total, ask Groq 8b to fill the gap
    let investors = merged;
    if (investors.length < 5) {
      const fillPrompt = `You are a capital markets expert. Identify ${8 - investors.length} additional real investors for this deal profile.
SECTOR: ${sector} | STAGE: ${stage} | RAISING: ${raiseAmount} | GEOGRAPHY: ${geography}
${investors.length > 0 ? `Already identified: ${investors.map((i) => i.name).join(", ")}. Do NOT repeat these.` : ""}
You MUST return real, named investors. JSON array only:
${investorArraySchema}`;
      try {
        const fillContent = await callGroq("llama-3.1-8b-instant", fillPrompt, 1200);
        const fillInvestors = safeParseInvestorArray(fillContent, "Groq");
        investors = deduplicateInvestors(sortInvestors([...investors, ...fillInvestors]));
      } catch {
        // fallback failed — continue with what we have
      }
    }

    // Cap at 15
    investors = investors.slice(0, 15);

    // ── Step 7: Synthesis ────────────────────────────────────────────────────
    const synthTaskC: TaskResult = {
      content: investors.length > 0 ? investors.map((i) => i.name).join(", ") : "",
      model: "investor-tasks",
      status: investors.length > 0 ? "success" : "unavailable",
    };
    const synthesis = await runSynthesis(taskAResult, taskBResult, synthTaskC, synthPrompt);

    // ── Step 8: Pitch Positioning + Comparable Raises (parallel) ─────────────
    const investorTypes = Array.from(new Set(investors.map((inv) => inv.type))).slice(0, 5);

    const pitchPrompt = `You are a capital markets advisor. Generate a specific pitch positioning guide for each investor type below. Return ONLY valid JSON, no markdown.

COMPANY: ${companyDescription}
SECTOR: ${sector} | STAGE: ${stage} | RAISING: ${raiseAmount} | GEOGRAPHY: ${geography}
INVESTOR TYPES: ${investorTypes.join(", ") || "VC, Angel, Family Office"}

{"pitchPositioning":[{"investorType":"VC","howToFrame":"Two specific positioning sentences for this investor type.","keyMetrics":["metric 1","metric 2","metric 3"],"whatToAvoid":"One sentence.","idealIntro":"One sentence on best introduction approach."}]}

One object per investor type. Be specific to this profile, not generic.`;

    const comparablePrompt = `Extract real fundraising events from these market signals. Also provide market context for this raise type.

SECTOR: ${sector} | STAGE: ${stage} | RAISING: ${raiseAmount} | GEOGRAPHY: ${geography}

SIGNALS:
${signalText}

Return ONLY valid JSON:
{"comparableRaises":[{"companyName":"string","amount":"string","stage":"string","sector":"string","geography":"string","date":"string","keyInvestors":"string","sourceUrl":"string"}],"marketContext":"2-3 sentences on typical ${stage} ${sector} raises in ${geography}: range, active investors, typical time to close. Base on your knowledge if not in signals."}

Maximum 5 comparableRaises. Only include fundraising events explicitly mentioned in the signals. Always populate marketContext.`;

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
    const comparableRaisesContext = typeof comparableParsed?.marketContext === "string"
      ? comparableParsed.marketContext
      : undefined;

    // ── Step 9: Build response metadata ──────────────────────────────────────
    const analysisQuality = determineAnalysisQuality(taskAResult, taskBResult, synthTaskC, synthesis);

    const contributions = [
      { task: "strategic" as const, displayName: "Strategic Analysis", model: taskAResult.model, status: taskAResult.status },
      { task: "financial" as const, displayName: "Financial Analysis", model: taskBResult.model, status: taskBResult.status },
      { task: "institutional" as const, displayName: "Institutional Investors", model: instResult.model, status: instResult.status },
      { task: "family_office" as const, displayName: "Family Offices & UHNWI", model: foResult.model, status: foResult.status },
      { task: "angels" as const, displayName: "Angels & Micro VCs", model: angelsResult.model, status: angelsResult.status },
      { task: "strategic_inv" as const, displayName: "Strategic Investors", model: stratInvResult.model, status: stratInvResult.status },
    ];

    const companySummary = synthesis.fallback
      ? (taskAResult.content.slice(0, 300) || taskBResult.content.slice(0, 300) || "Analysis complete.")
      : synthesis.content.slice(0, 400);

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
      comparableRaisesContext,
      pitchPositioning,
      degradedNote,
      meta: {
        modelUsed: [instResult.model, foResult.model, angelsResult.model, stratInvResult.model]
          .filter((m) => m !== "none")
          .join(", ") || "none",
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
