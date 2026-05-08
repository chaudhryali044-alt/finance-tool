"use client";

import { useState } from "react";
import LoadingState from "@/components/LoadingState";
import DealResults from "@/components/DealResults";
import type { DealResult } from "@/types";

const DEAL_TYPES = [
  "Acquisition Target",
  "Merger Candidate",
  "Buyout Opportunity",
  "Strategic Acquirer",
  "Full Sector Scan",
];

export default function DealsPage() {
  const [form, setForm] = useState({ query: "", dealType: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DealResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
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
              Deal Signals
            </span>
          </div>
          <h1 className="font-playfair text-4xl sm:text-5xl text-text-primary mb-4">
            Deal Signal Monitor
          </h1>
          <p className="text-text-secondary text-lg max-w-xl leading-relaxed">
            Enter a company name or sector. Meridian detects acquisition signals, identifies likely acquirers, and generates a professional mandate brief.
          </p>
        </div>

        {/* Form */}
        {!result && (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-8 space-y-6">
            <div>
              <label className="block text-xs text-text-secondary tracking-widest uppercase mb-2">
                Company Name or Sector
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Deliveroo, UAE healthcare, UK fintech, Stripe"
                value={form.query}
                onChange={(e) => setForm({ ...form, query: e.target.value })}
                className="input-dark w-full px-4 py-3 rounded text-sm"
              />
              <p className="text-text-secondary/50 text-xs mt-2">
                For US and UK public companies, Meridian will attempt to pull SEC or Companies House financial data.
              </p>
            </div>

            <div>
              <label className="block text-xs text-text-secondary tracking-widest uppercase mb-2">
                Deal Type
              </label>
              <select
                required
                value={form.dealType}
                onChange={(e) => setForm({ ...form, dealType: e.target.value })}
                className="input-dark w-full px-4 py-3 rounded text-sm appearance-none"
              >
                <option value="">Select deal type</option>
                {DEAL_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn-gold px-8 py-4 rounded text-sm font-semibold tracking-wide w-full sm:w-auto">
              Analyse Deal Signals →
            </button>
          </form>
        )}

        {/* Loading */}
        {loading && <LoadingState tool="deals" />}

        {/* Error */}
        {error && !loading && (
          <div className="bg-card border border-danger/30 rounded-lg p-8 text-center mt-8">
            <p className="text-danger mb-2 font-semibold">Analysis Failed</p>
            <p className="text-text-secondary text-sm mb-4">{error}</p>
            <p className="text-text-secondary/60 text-xs mb-6">
              Try a different company name or sector. Make sure the company name is spelled correctly.
            </p>
            <button
              onClick={() => setError(null)}
              className="btn-gold px-6 py-3 rounded text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <DealResults
            result={result}
            onReset={() => setResult(null)}
          />
        )}
      </div>
    </main>
  );
}
