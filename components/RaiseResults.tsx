"use client";

import { useState } from "react";
import type { RaiseResult, InvestorResult } from "@/types";
import { getSessionId } from "@/lib/session";
import { downloadRaisePDF } from "@/lib/pdf";

const ACTIVITY_CONFIG = {
  "Recently Active": { icon: "🟢", color: "text-success" },
  "Active": { icon: "🟡", color: "text-gold" },
  "Quiet": { icon: "🔴", color: "text-danger" },
  "Unknown": { icon: "⚪", color: "text-text-secondary" },
};

const TYPE_COLORS: Record<string, string> = {
  VC: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  PE: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Angel: "bg-gold/10 text-gold border-gold/20",
  "Family Office": "bg-green-500/10 text-green-400 border-green-500/20",
  SWF: "bg-red-500/10 text-red-400 border-red-500/20",
  Corporate: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

function InvestorCard({ investor, index }: { investor: InvestorResult; index: number }) {
  const activity = ACTIVITY_CONFIG[investor.fundActivity as keyof typeof ACTIVITY_CONFIG] ?? ACTIVITY_CONFIG["Unknown"];
  const typeColor = TYPE_COLORS[investor.type] ?? "bg-border text-text-secondary border-border";

  return (
    <div className="bg-card border border-border rounded-lg p-6 card-hover">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-gold/40 text-xs">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3 className="font-playfair text-lg text-text-primary">{investor.name}</h3>
            <span className={`inline-block text-xs px-2 py-0.5 rounded border mt-1 ${typeColor}`}>
              {investor.type}
            </span>
          </div>
        </div>
        <div className={`text-xs flex items-center gap-1.5 ${activity.color} flex-shrink-0`}>
          <span>{activity.icon}</span>
          <span>{investor.fundActivity}</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Cheque Size</p>
          <p className="font-mono text-sm text-text-primary">{investor.chequeSize}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Geography</p>
          <p className="text-sm text-text-primary">{investor.geographicFocus}</p>
        </div>
      </div>

      {investor.sectorFocus?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {investor.sectorFocus.map((tag) => (
            <span key={tag} className="text-[10px] px-2 py-0.5 bg-border/50 text-text-secondary rounded">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-3 mb-4">
        <div>
          <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">Why They Fit</p>
          <p className="text-sm text-text-secondary leading-relaxed">{investor.whyTheyFit}</p>
        </div>
        <div>
          <p className="text-[10px] text-gold tracking-widest uppercase mb-1">Outreach Angle</p>
          <p className="text-sm text-text-primary leading-relaxed">{investor.outreachAngle}</p>
        </div>
      </div>

      {investor.sourceLinks && investor.sourceLinks.filter(Boolean).length > 0 && (
        <div className="pt-3 border-t border-border">
          <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-2">Sources</p>
          <div className="flex flex-wrap gap-2">
            {investor.sourceLinks.filter(Boolean).map((link, i) => (
              <a
                key={i}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-gold hover:text-gold-light underline truncate max-w-[200px]"
              >
                {link.replace(/^https?:\/\//, "").slice(0, 40)}...
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RaiseResults({
  result,
  onReset,
}: {
  result: RaiseResult;
  onReset: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

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
          deal_type: `${result.sector} — ${result.stage}`,
          tool_type: "raise",
          signal_strength: "N/A",
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
          tool_type: "raise",
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
      await downloadRaisePDF(result);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Back button */}
      <button
        onClick={onReset}
        className="text-text-secondary hover:text-text-primary text-sm flex items-center gap-2 transition-colors"
      >
        ← New search
      </button>

      {/* Company header */}
      <div className="bg-card border border-border rounded-lg p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-px w-6 bg-gold" />
          <span className="text-gold text-xs tracking-[0.3em] uppercase font-mono">Capital Raise Brief</span>
        </div>
        <h2 className="font-playfair text-3xl text-text-primary mb-2">{result.companyName}</h2>
        <p className="text-text-secondary text-sm leading-relaxed mb-6">{result.companySummary}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Sector", value: result.sector },
            { label: "Stage", value: result.stage },
            { label: "Raising", value: result.amount },
            { label: "Geography", value: result.geography },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] text-text-secondary tracking-widest uppercase mb-1">{label}</p>
              <p className="font-mono text-sm text-text-primary">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Investor count */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-playfair text-2xl text-text-primary">
            {result.investors?.length ?? 0} Matched Investors
          </h3>
          <p className="text-text-secondary text-sm mt-1">
            Ranked by mandate fit and recent activity signals
          </p>
        </div>
      </div>

      {/* Investor cards */}
      <div className="space-y-4">
        {(result.investors ?? []).map((investor, i) => (
          <InvestorCard key={i} investor={investor} index={i} />
        ))}
      </div>

      {/* Actions */}
      <div className="border-t border-border pt-8 flex flex-wrap gap-4">
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
