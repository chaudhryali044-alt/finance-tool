"use client";

import type { AnalysisMeta, TaskStatus } from "@/types";

const QUALITY_CONFIG = {
  Full: { color: "text-success", border: "border-success/20", bg: "bg-success/5", label: "Full" },
  Partial: { color: "text-gold", border: "border-gold/20", bg: "bg-gold/5", label: "Partial" },
  Degraded: { color: "text-danger", border: "border-danger/20", bg: "bg-danger/5", label: "Degraded" },
};

const STATUS_ICON: Record<TaskStatus, { icon: string; color: string; label: string }> = {
  success: { icon: "✓", color: "text-success", label: "" },
  rate_limited: { icon: "✗", color: "text-danger", label: "rate limited" },
  token_limit: { icon: "✗", color: "text-danger", label: "prompt too large" },
  unavailable: { icon: "✗", color: "text-danger", label: "unavailable" },
};

const MODEL_DISPLAY: Record<string, string> = {
  "Groq Llama 70b": "Groq Llama 70b",
  "Groq Mixtral 8x7b": "Groq Mixtral 8x7b",
  "Groq Llama 8b": "Groq Llama 8b",
  "DeepSeek": "DeepSeek Chat",
  "Gemini Flash": "Gemini 1.5 Flash",
  "Mistral Small": "Mistral Small",
  "concatenated": "Concatenated",
  "none": "Unavailable",
};

// Convert stored timestamp to PKT (UTC+5)
function toPKT(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString("en-GB", {
      timeZone: "Asia/Karachi",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return isoString;
  }
}

export default function IntelligenceSources({ meta }: { meta: AnalysisMeta }) {
  const quality = meta.analysisQuality ?? "Full";
  const qualityCfg = QUALITY_CONFIG[quality];

  const contributions = meta.contributions ?? [];
  const synthesisModel = meta.synthesisModel ?? "unknown";
  const synthesisFallback = meta.synthesisFallback ?? false;

  return (
    <div className={`bg-card border ${qualityCfg.border} rounded-lg overflow-hidden`}>
      {/* Header */}
      <div className={`px-6 py-4 ${qualityCfg.bg} border-b ${qualityCfg.border}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-px w-6 bg-gold/40" />
            <span className="text-text-secondary text-xs tracking-[0.3em] uppercase font-mono">
              Intelligence Sources
            </span>
          </div>
          <span className={`text-xs font-mono font-bold tracking-wider ${qualityCfg.color}`}>
            {quality} Analysis
          </span>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Model contributions */}
        <div className="space-y-3">
          {contributions.map((c) => {
            const s = STATUS_ICON[c.status];
            const modelLabel = MODEL_DISPLAY[c.model] ?? c.model;
            return (
              <div key={c.task} className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className={`text-sm flex-shrink-0 mt-0.5 font-bold ${s.color}`}>
                    {s.icon}
                  </span>
                  <div>
                    <p className="text-sm text-text-primary">{c.displayName}</p>
                    <p className={`text-xs font-mono mt-0.5 ${c.status === "success" ? "text-text-secondary/60" : "text-danger/60"}`}>
                      {c.status === "success" ? modelLabel : `Unavailable (${s.label})`}
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border flex-shrink-0 ${
                  c.status === "success"
                    ? "border-success/20 text-success bg-success/5"
                    : "border-danger/20 text-danger bg-danger/5"
                }`}>
                  {c.status === "success" ? "OK" : c.status.replace("_", " ")}
                </span>
              </div>
            );
          })}

          {/* Synthesis row */}
          <div className="flex items-start justify-between gap-4 pt-2 border-t border-border">
            <div className="flex items-start gap-3">
              <span className={`text-sm flex-shrink-0 mt-0.5 font-bold ${synthesisFallback ? "text-gold" : "text-success"}`}>
                {synthesisFallback ? "◈" : "✓"}
              </span>
              <div>
                <p className="text-sm text-text-primary">Synthesis</p>
                <p className={`text-xs font-mono mt-0.5 ${synthesisFallback ? "text-gold/60" : "text-text-secondary/60"}`}>
                  {synthesisFallback
                    ? "Concatenated (synthesis model unavailable)"
                    : MODEL_DISPLAY[synthesisModel] ?? synthesisModel}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border flex-shrink-0 ${
              synthesisFallback
                ? "border-gold/20 text-gold bg-gold/5"
                : "border-success/20 text-success bg-success/5"
            }`}>
              {synthesisFallback ? "fallback" : "OK"}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Data Sources</p>
            <p className="font-mono text-xs text-text-primary">
              {meta.sourceCount} web sources · {meta.searchCount} searches
            </p>
          </div>
          <div>
            <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Generated (PKT)</p>
            <p className="font-mono text-xs text-text-primary">{toPKT(meta.generatedAt)}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Data Confidence</p>
            <p className={`font-mono text-xs ${
              meta.dataConfidence === "High" ? "text-success" :
              meta.dataConfidence === "Medium" ? "text-gold" : "text-danger"
            }`}>
              {meta.dataConfidence}{" "}
              <span className="text-text-secondary/40">
                ({meta.sourceCount >= 5 ? "5+ sources" : meta.sourceCount >= 2 ? "2–4 sources" : "0–1 sources"})
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
