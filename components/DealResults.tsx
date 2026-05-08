"use client";

import { useState } from "react";
import type { DealResult } from "@/types";
import { getSessionId } from "@/lib/session";
import { downloadDealPDF } from "@/lib/pdf";

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

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={onReset}
        className="text-text-secondary hover:text-text-primary text-sm flex items-center gap-2 transition-colors"
      >
        ← New search
      </button>

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
                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: Signals Detected */}
      {result.signals && result.signals.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-playfair text-xl text-text-primary mb-5">Signals Detected</h3>
          <div className="space-y-3">
            {result.signals.map((signal, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={`text-sm flex-shrink-0 mt-0.5 ${signal.found ? "text-success" : "text-text-secondary/40"}`}>
                  {signal.found ? "✓" : "✗"}
                </span>
                <span className={`text-sm ${signal.found ? "text-text-primary" : "text-text-secondary/60"}`}>
                  {signal.text}
                </span>
                {signal.source && (
                  <a
                    href={signal.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold text-xs hover:text-gold-light ml-auto flex-shrink-0 underline"
                  >
                    [source]
                  </a>
                )}
              </div>
            ))}
          </div>
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
                <a href={result.financials.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gold hover:text-gold-light underline">
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
              if (line.match(/^[A-Z][A-Z\s]+:?$/)) {
                return <h4 key={i} className="font-playfair text-lg text-text-primary mt-5 mb-2">{line}</h4>;
              }
              return <p key={i} className="text-text-secondary text-sm leading-relaxed">{line}</p>;
            })}
          </div>
          <div className="text-center mt-6">
            <div className="gold-line mb-4" />
            <p className="text-text-secondary/40 text-xs font-mono">
              Prepared by Meridian Intelligence — meridian.app
            </p>
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
    </div>
  );
}
