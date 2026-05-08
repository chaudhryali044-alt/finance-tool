"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WatchlistItem, DealResult, RaiseResult } from "@/types";
import { getSessionId } from "@/lib/session";
import { downloadDealPDF, downloadRaisePDF } from "@/lib/pdf";

const SIGNAL_COLORS: Record<string, string> = {
  HIGH: "text-danger",
  MEDIUM: "text-gold",
  LOW: "text-success",
  UNKNOWN: "text-text-secondary",
  "N/A": "text-text-secondary",
};

const SIGNAL_ICONS: Record<string, string> = {
  HIGH: "🔴",
  MEDIUM: "🟡",
  LOW: "🟢",
  UNKNOWN: "⚪",
  "N/A": "⚪",
};

function WatchlistCard({
  item,
  onDelete,
  onRefresh,
}: {
  item: WatchlistItem;
  onDelete: (id: string) => void;
  onRefresh: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showBrief, setShowBrief] = useState(false);

  const signalKey = item.signal_strength?.toUpperCase() ?? "UNKNOWN";
  const signalColor = SIGNAL_COLORS[signalKey] ?? "text-text-secondary";
  const signalIcon = SIGNAL_ICONS[signalKey] ?? "⚪";

  const handleDelete = async () => {
    setDeleting(true);
    const sessionId = getSessionId();
    await fetch(`/api/watchlist?id=${item.id}&session_id=${sessionId}`, { method: "DELETE" });
    onDelete(item.id);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh(item.id);
    setRefreshing(false);
  };

  const handleDownload = async () => {
    if (item.tool_type === "raise") {
      await downloadRaisePDF(item.brief_data as RaiseResult);
    } else {
      await downloadDealPDF(item.brief_data as DealResult);
    }
  };

  return (
    <div className={`bg-card border rounded-lg p-6 transition-colors ${item.signal_changed ? "border-gold/40" : "border-border"}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-playfair text-lg text-text-primary">{item.company_name}</h3>
            {item.signal_changed && (
              <span className="text-[10px] bg-gold/10 text-gold border border-gold/20 px-2 py-0.5 rounded tracking-widest uppercase">
                Signal Changed
              </span>
            )}
          </div>
          <p className="text-text-secondary text-xs mb-1">{item.deal_type}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-widest ${
            item.tool_type === "raise"
              ? "border-blue-500/20 text-blue-400"
              : "border-purple-500/20 text-purple-400"
          }`}>
            {item.tool_type === "raise" ? "Capital Raise" : "Deal Signals"}
          </span>
        </div>
        <div className="text-right flex-shrink-0">
          {item.tool_type === "deals" && (
            <div className={`flex items-center gap-1.5 justify-end mb-1 ${signalColor}`}>
              <span className="text-sm">{signalIcon}</span>
              <span className="font-mono text-xs">{item.signal_strength}</span>
            </div>
          )}
          <p className="text-text-secondary/40 text-xs">
            {new Date(item.created_at).toLocaleDateString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 border border-border text-text-secondary hover:border-gold/50 hover:text-text-primary rounded transition-colors"
        >
          {refreshing ? "Refreshing..." : "Refresh Signals"}
        </button>

        <button
          onClick={() => setShowBrief(!showBrief)}
          className="text-xs px-3 py-1.5 border border-border text-text-secondary hover:border-gold/50 hover:text-text-primary rounded transition-colors"
        >
          {showBrief ? "Hide Brief" : "View Brief"}
        </button>

        <button
          onClick={handleDownload}
          className="text-xs px-3 py-1.5 btn-gold rounded"
        >
          Download PDF
        </button>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs px-3 py-1.5 border border-danger/30 text-danger hover:bg-danger/5 rounded transition-colors ml-auto"
        >
          {deleting ? "..." : "Delete"}
        </button>
      </div>

      {showBrief && item.brief_data && (
        <div className="mt-4 pt-4 border-t border-border">
          {item.tool_type === "deals" && (item.brief_data as DealResult).mandateBrief ? (
            <div className="text-text-secondary text-xs leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
              {(item.brief_data as DealResult).mandateBrief?.slice(0, 800)}...
            </div>
          ) : item.tool_type === "raise" && (item.brief_data as RaiseResult).companySummary ? (
            <div>
              <p className="text-text-secondary text-xs leading-relaxed mb-3">
                {(item.brief_data as RaiseResult).companySummary}
              </p>
              <p className="text-text-secondary/60 text-xs">
                {(item.brief_data as RaiseResult).investors?.length ?? 0} investors matched
              </p>
            </div>
          ) : (
            <p className="text-text-secondary text-xs">Brief data not available.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = getSessionId();
    fetch(`/api/watchlist?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleRefresh = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const sessionId = getSessionId();
    const endpoint = item.tool_type === "raise" ? "/api/raise" : "/api/deals";
    const payload =
      item.tool_type === "raise"
        ? {
            companyName: item.company_name,
            sector: (item.brief_data as RaiseResult)?.sector ?? "",
            stage: (item.brief_data as RaiseResult)?.stage ?? "",
            amount: (item.brief_data as RaiseResult)?.amount ?? "",
            geography: (item.brief_data as RaiseResult)?.geography ?? "",
          }
        : { query: item.company_name, dealType: item.deal_type };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const newData = await res.json();

      const oldStrength = item.signal_strength;
      const newStrength = item.tool_type === "deals" ? newData.signalStrength : item.signal_strength;

      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          company_name: item.company_name,
          deal_type: item.deal_type,
          tool_type: item.tool_type,
          signal_strength: newStrength ?? item.signal_strength,
          brief_data: newData,
        }),
      });

      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                brief_data: newData,
                signal_strength: newStrength ?? i.signal_strength,
                signal_changed: newStrength !== oldStrength,
                updated_at: new Date().toISOString(),
              }
            : i
        )
      );
    } catch {
      // silently fail
    }
  };

  return (
    <main className="min-h-screen bg-background pt-16">
      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-8 bg-gold" />
            <span className="text-gold text-xs tracking-[0.3em] uppercase font-mono">
              Watchlist
            </span>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-playfair text-4xl sm:text-5xl text-text-primary mb-4">
                Mandate Watchlist
              </h1>
              <p className="text-text-secondary text-lg max-w-xl leading-relaxed">
                Your saved deals and raises. Signal data refreshes automatically every Monday morning.
              </p>
            </div>
            {items.length > 0 && (
              <span className="font-mono text-text-secondary text-sm flex-shrink-0">
                {items.length} saved
              </span>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center py-20 text-text-secondary">
            <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin mb-4" />
            <p className="text-sm">Loading watchlist...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <div className="w-12 h-12 rounded-full border border-border flex items-center justify-center mx-auto mb-6">
              <span className="text-text-secondary text-lg">◎</span>
            </div>
            <h3 className="font-playfair text-2xl text-text-primary mb-3">No saved mandates</h3>
            <p className="text-text-secondary text-sm mb-8 max-w-xs mx-auto">
              Save companies from the Capital Raise Matcher or Deal Signal Monitor to track them here.
            </p>
            <div className="flex justify-center gap-4">
              <Link href="/raise" className="btn-gold px-6 py-3 rounded text-sm font-semibold">
                Find Investors
              </Link>
              <Link
                href="/deals"
                className="px-6 py-3 rounded text-sm font-semibold border border-border text-text-secondary hover:border-gold/50 hover:text-text-primary transition-colors"
              >
                Find Deals
              </Link>
            </div>
          </div>
        )}

        {/* Items */}
        {!loading && items.length > 0 && (
          <div className="space-y-4">
            {items.map((item) => (
              <WatchlistCard
                key={item.id}
                item={item}
                onDelete={handleDelete}
                onRefresh={handleRefresh}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
