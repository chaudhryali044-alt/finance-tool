"use client";

import { useState } from "react";
import type { DealResult, SearchSource, RawSignal } from "@/types";
import { getSessionId } from "@/lib/session";
import { downloadDealPDF } from "@/lib/pdf";
import IntelligenceSources from "@/components/IntelligenceSources";

const SIGNAL_CONFIG = {
  HIGH: { icon: "🔴", label: "HIGH SIGNAL", color: "text-danger", border: "border-danger/30", bg: "bg-danger/5" },
  MEDIUM: { icon: "🟡", label: "MEDIUM SIGNAL", color: "text-gold", border: "border-gold/30", bg: "bg-gold/5" },
  LOW: { icon: "🟢", label: "LOW SIGNAL", color: "text-success", border: "border-success/30", bg: "bg-success/5" },
  UNKNOWN: { icon: "⚪", label: "UNKNOWN", color: "text-text-secondary", border: "border-border", bg: "bg-card" },
};

const CONFIDENCE_COLOR: Record<string, string> = {
  High: "text-success",
  Medium: "text-gold",
  Low: "text-danger",
};

const LIKELIHOOD_COLOR: Record<string, string> = {
  High: "text-success",
  Medium: "text-gold",
  Low: "text-danger",
};

const SIGNAL_CATEGORY_COLORS: Record<string, string> = {
  "Deal Signals": "text-danger",
  "Leadership Signals": "text-gold",
  "Financial Signals": "text-blue-400",
  "Strategic Signals": "text-purple-400",
  "Social Signals": "text-cyan-400",
};

function SourcesSection({ sources, rawSignals, meta }: {
  sources: SearchSource[];
  rawSignals: RawSignal[];
  meta: NonNullable<DealResult["meta"]>;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const grouped = rawSignals.reduce<Record<string, RawSignal[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Analysis metadata */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-px w-6 bg-gold/40" />
          <span className="text-text-secondary text-xs tracking-[0.3em] uppercase font-mono">Analysis Metadata</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Generated At</p>
            <p className="font-mono text-xs text-text-primary">
              {new Date(meta.generatedAt).toLocaleString("en-GB", {
                day: "numeric", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit", timeZoneName: "short",
              })}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Model Used</p>
            <p className="font-mono text-xs text-text-primary">{meta.modelUsed}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Sources Found</p>
            <p className="font-mono text-xs text-text-primary">
              {meta.sourceCount} sources across {meta.searchCount} searches
            </p>
          </div>
          <div>
            <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Data Confidence</p>
            <p className={`font-mono text-xs ${CONFIDENCE_COLOR[meta.dataConfidence] ?? "text-text-secondary"}`}>
              {meta.dataConfidence}{" "}
              <span className="text-text-secondary/40">
                ({meta.sourceCount >= 5 ? "5+ sources" : meta.sourceCount >= 2 ? "2–4 sources" : "0–1 sources"})
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Sources Used */}
      {sources.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-px w-6 bg-gold/40" />
              <span className="text-text-secondary text-xs tracking-[0.3em] uppercase font-mono">Sources Used</span>
            </div>
            <span className={`text-xs font-mono ${CONFIDENCE_COLOR[meta.dataConfidence] ?? "text-text-secondary"}`}>
              {meta.dataConfidence} confidence · {sources.length} sources
            </span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {sources.map((src, i) => (
              <div key={i} className="flex items-start gap-3 py-1.5 border-b border-border/40 last:border-0">
                <span className="text-[10px] text-text-secondary/40 font-mono flex-shrink-0 mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 min-w-0">
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-text-primary hover:text-gold transition-colors leading-tight block truncate"
                  >
                    {src.title}
                  </a>
                  <span className={`text-[10px] mt-0.5 block ${SIGNAL_CATEGORY_COLORS[src.category] ?? "text-gold/60"}`}>
                    {src.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Signals toggle */}
      {rawSignals.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-border/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-px w-6 bg-gold/40" />
              <span className="text-text-secondary text-xs tracking-[0.3em] uppercase font-mono">Raw Signals</span>
              <span className="text-[10px] text-text-secondary/40">({rawSignals.length} headlines)</span>
            </div>
            <span className="text-text-secondary text-xs">{showRaw ? "▲ Hide" : "▼ Show"}</span>
          </button>
          {showRaw && (
            <div className="px-5 pb-5 space-y-5 max-h-96 overflow-y-auto">
              {Object.entries(grouped).map(([category, signals]) => (
                <div key={category}>
                  <p className={`text-[10px] tracking-widest uppercase mb-2 ${SIGNAL_CATEGORY_COLORS[category] ?? "text-gold"}`}>
                    {category}
                  </p>
                  <div className="space-y-2">
                    {signals.map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-text-secondary/30 text-xs mt-0.5 flex-shrink-0">·</span>
                        <div className="flex-1 min-w-0">
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-text-secondary hover:text-text-primary transition-colors leading-relaxed"
                          >
                            {s.headline}
                          </a>
                          {s.snippet && (
                            <p className="text-[10px] text-text-secondary/50 mt-0.5 leading-relaxed">
                              {s.snippet.slice(0, 120)}...
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DealResults({
  result,
  onReset,
}: {
  result: DealResult;
  onReset: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const signalCfg = SIGNAL_CONFIG[result.signalStrength as keyof typeof SIGNAL_CONFIG] ?? SIGNAL_CONFIG.UNKNOWN;

  const handleSave = async () => {
    setSaving(true);
    try {
      const sessionId = getSessionId();
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          company_name: result.companyName,
          deal_type: result.dealType,
          tool_type: "deals",
          signal_strength: result.signalStrength,
          brief_data: result,
        }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const sessionId = getSessionId();
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool_type: "deals",
          brief_data: result,
          company_name: result.companyName,
          session_id: sessionId,
        }),
      });
      const data = await res.json();
      const url = `${window.location.origin}/share?id=${data.id}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadDealPDF(result);
    } finally {
      setDownloading(false);
    }
  };

  // Group signals by category for display
  const signalsByCategory = result.signals?.reduce<Record<string, typeof result.signals>>((acc, s) => {
    const cat = s.category ?? "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {}) ?? {};

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={onReset}
        className="text-text-secondary hover:text-text-primary text-sm flex items-center gap-2 transition-colors"
      >
        ← New search
      </button>

      {/* Degraded warning */}
      {result.degradedNote && (
        <div className="bg-gold/5 border border-gold/20 rounded-lg px-5 py-3 text-sm text-gold">
          ⚠ {result.degradedNote}
        </div>
      )}

      {/* Section 1: Deal Signal Header */}
      <div className={`bg-card border ${signalCfg.border} rounded-lg p-8 ${signalCfg.bg}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px w-6 bg-gold" />
              <span className="text-gold text-xs tracking-[0.3em] uppercase font-mono">Deal Signal Report</span>
            </div>
            <h2 className="font-playfair text-3xl text-text-primary mb-1">{result.companyName}</h2>
            <p className="text-text-secondary text-sm">{result.sector} · {result.dealType}</p>
          </div>
          <div className="text-right">
            <div className={`flex items-center gap-2 justify-end mb-2 ${signalCfg.color}`}>
              <span className="text-lg">{signalCfg.icon}</span>
              <span className="font-mono text-sm font-bold tracking-widest">{signalCfg.label}</span>
            </div>
            <p className={`text-xs ${CONFIDENCE_COLOR[result.dataConfidence] ?? "text-text-secondary"}`}>
              Confidence: {result.dataConfidence}
            </p>
            <p className="text-text-secondary/40 text-xs mt-1">
              {new Date(result.lastUpdated).toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric",
              })}
            </p>
          </div>
        </div>
        {result.meta && (
          <div className="mt-5 pt-4 border-t border-border/30 flex flex-wrap gap-4 text-xs text-text-secondary/40 font-mono">
            <span>Generated {new Date(result.meta.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            <span>·</span>
            <span>{result.meta.modelUsed}</span>
            <span>·</span>
            <span>{result.meta.sourceCount} sources / {result.meta.searchCount} searches</span>
          </div>
        )}
      </div>

      {/* Section 2: Signals Detected — grouped by category */}
      {result.signals && result.signals.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-playfair text-xl text-text-primary mb-5">Signals Detected</h3>
          {Object.keys(signalsByCategory).length > 1 ? (
            <div className="space-y-5">
              {Object.entries(signalsByCategory).map(([category, signals]) => (
                <div key={category}>
                  <p className={`text-[10px] tracking-widest uppercase mb-3 ${SIGNAL_CATEGORY_COLORS[category] ?? "text-gold"}`}>
                    {category}
                  </p>
                  <div className="space-y-2.5">
                    {signals.map((signal, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className={`text-sm flex-shrink-0 mt-0.5 ${signal.found ? "text-success" : "text-text-secondary/40"}`}>
                          {signal.found ? "✓" : "✗"}
                        </span>
                        <span className={`text-sm flex-1 ${signal.found ? "text-text-primary" : "text-text-secondary/60"}`}>
                          {signal.text}
                        </span>
                        {signal.source && (
                          <a href={signal.source} target="_blank" rel="noopener noreferrer"
                            className="text-gold text-xs hover:text-gold-light flex-shrink-0 underline">
                            [source]
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {result.signals.map((signal, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`text-sm flex-shrink-0 mt-0.5 ${signal.found ? "text-success" : "text-text-secondary/40"}`}>
                    {signal.found ? "✓" : "✗"}
                  </span>
                  <span className={`text-sm flex-1 ${signal.found ? "text-text-primary" : "text-text-secondary/60"}`}>
                    {signal.text}
                  </span>
                  {signal.source && (
                    <a href={signal.source} target="_blank" rel="noopener noreferrer"
                      className="text-gold text-xs hover:text-gold-light flex-shrink-0 underline">
                      [source]
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 3: Financials */}
      {result.financials && Object.values(result.financials).some(Boolean) ? (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-playfair text-xl text-text-primary mb-5">Financial Overview</h3>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            {result.financials.revenue && (
              <div>
                <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Revenue</p>
                <p className="font-mono text-text-primary">{result.financials.revenue}</p>
              </div>
            )}
            {result.financials.ebitdaMargin && (
              <div>
                <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">EBITDA Margin</p>
                <p className="font-mono text-text-primary">{result.financials.ebitdaMargin}</p>
              </div>
            )}
            {result.financials.revenueGrowth && (
              <div>
                <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Revenue Growth YoY</p>
                <p className="font-mono text-text-primary">{result.financials.revenueGrowth}</p>
              </div>
            )}
            {result.financials.evRange && (
              <div>
                <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Indicative EV Range</p>
                <p className="font-mono text-gold">{result.financials.evRange}</p>
              </div>
            )}
          </div>
          {result.financials.keyMetrics && (
            <p className="text-text-secondary text-sm leading-relaxed mb-3">{result.financials.keyMetrics}</p>
          )}
          {result.financials.source && (
            <div className="flex items-center gap-2 pt-3 border-t border-border">
              <span className="text-xs text-text-secondary/60">Source:</span>
              {result.financials.sourceUrl ? (
                <a href={result.financials.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-gold hover:text-gold-light underline">
                  {result.financials.source}
                </a>
              ) : (
                <span className="text-xs text-text-secondary">{result.financials.source}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-playfair text-xl text-text-primary mb-2">Financial Overview</h3>
          <p className="text-text-secondary text-sm">
            Financial data unavailable for private/non-UK/US companies. Signal analysis only.
          </p>
        </div>
      )}

      {/* Section 4: Likely Acquirers */}
      {result.likelyAcquirers && result.likelyAcquirers.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-playfair text-xl text-text-primary mb-6">Likely Acquirers</h3>
          <div className="space-y-5">
            {result.likelyAcquirers.map((acq, i) => (
              <div key={i} className="border border-border rounded-lg p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-gold/40 text-xs">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h4 className="font-playfair text-lg text-text-primary">{acq.name}</h4>
                      <span className="text-xs text-text-secondary">{acq.type}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-mono font-bold ${LIKELIHOOD_COLOR[acq.likelihood] ?? "text-text-secondary"}`}>
                    {acq.likelihood} Likelihood
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <p className="text-text-secondary leading-relaxed">{acq.rationale}</p>
                  <div className="flex flex-wrap gap-4 pt-2">
                    <div>
                      <span className="text-[10px] text-text-secondary tracking-widest uppercase">Structure: </span>
                      <span className="text-text-primary text-xs">{acq.dealStructure}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-secondary tracking-widest uppercase">Precedent: </span>
                      <span className="text-text-primary text-xs">{acq.precedentTransaction}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 5: Mandate Brief */}
      {result.mandateBrief && (
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="text-center mb-6">
            <div className="gold-line mb-4" />
            <p className="text-gold text-xs tracking-[0.4em] uppercase font-mono">Meridian — Deal Signal Report</p>
            <p className="text-text-secondary/50 text-xs tracking-[0.3em] uppercase font-mono mt-1">Confidential</p>
            <div className="gold-line mt-4" />
          </div>
          <div className="prose prose-sm max-w-none">
            {result.mandateBrief.split("\n").map((line, i) => {
              if (!line.trim()) return <div key={i} className="h-3" />;
              if (line.startsWith("━")) return <div key={i} className="gold-line my-4" />;
              if (line.match(/^[A-Z][A-Z\s]+:?$/) || line.match(/^#{1,3}\s/)) {
                const text = line.replace(/^#{1,3}\s/, "");
                return <h4 key={i} className="font-playfair text-lg text-text-primary mt-5 mb-2">{text}</h4>;
              }
              if (line.startsWith("**") && line.endsWith("**")) {
                return <p key={i} className="font-semibold text-text-primary text-sm mb-1">{line.slice(2, -2)}</p>;
              }
              return <p key={i} className="text-text-secondary text-sm leading-relaxed">{line}</p>;
            })}
          </div>
          <div className="text-center mt-6">
            <div className="gold-line mb-4" />
            <p className="text-text-secondary/40 text-xs font-mono">
              Prepared by Meridian Intelligence — meridian.app
            </p>
            {result.meta && (
              <p className="text-text-secondary/30 text-xs font-mono mt-1">
                {new Date(result.meta.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                {" · "}{result.meta.modelUsed}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-border pt-6 flex flex-wrap gap-4">
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className={`px-6 py-3 rounded text-sm font-semibold border transition-colors ${
            saved
              ? "border-success/50 text-success"
              : "border-border text-text-secondary hover:border-gold/50 hover:text-text-primary"
          }`}
        >
          {saved ? "✓ Saved to Watchlist" : saving ? "Saving..." : "Save to Watchlist"}
        </button>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="btn-gold px-6 py-3 rounded text-sm font-semibold"
        >
          {downloading ? "Generating..." : "Download PDF"}
        </button>

        <button
          onClick={handleShare}
          disabled={sharing}
          className="px-6 py-3 rounded text-sm font-semibold border border-border text-text-secondary hover:border-gold/50 hover:text-text-primary transition-colors"
        >
          {sharing ? "Generating link..." : shareUrl ? "✓ Link Copied" : "Share"}
        </button>

        {shareUrl && (
          <div className="w-full bg-card border border-border rounded p-3">
            <p className="text-xs text-text-secondary mb-1">Share link (copied to clipboard):</p>
            <p className="text-xs font-mono text-gold break-all">{shareUrl}</p>
          </div>
        )}
      </div>

      {/* Intelligence Sources panel */}
      {result.meta && result.meta.contributions && result.meta.contributions.length > 0 && (
        <IntelligenceSources meta={result.meta} />
      )}

      {/* Sources + Raw Signals */}
      {result.meta && result.meta.sources.length > 0 && (
        <SourcesSection
          sources={result.meta.sources}
          rawSignals={result.meta.rawSignals}
          meta={result.meta}
        />
      )}
    </div>
  );
}
