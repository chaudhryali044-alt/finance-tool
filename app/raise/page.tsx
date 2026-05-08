"use client";

import { useState } from "react";
import LoadingState from "@/components/LoadingState";
import RaiseResults from "@/components/RaiseResults";
import type { RaiseResult } from "@/types";

const SECTORS = ["SaaS", "Fintech", "Healthcare", "Logistics", "Consumer", "Real Estate", "Energy", "Other"];
const STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Growth", "Pre-IPO"];
const CURRENCIES = ["USD", "GBP", "EUR", "AED", "SGD", "CAD", "AUD"];

export default function RaisePage() {
  const [form, setForm] = useState({
    companyName: "",
    description: "",
    sector: "",
    stage: "",
    amount: "",
    currency: "USD",
    geography: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RaiseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/raise", {
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
              Capital Raise
            </span>
          </div>
          <h1 className="font-playfair text-4xl sm:text-5xl text-text-primary mb-4">
            Capital Raise Matcher
          </h1>
          <p className="text-text-secondary text-lg max-w-xl leading-relaxed">
            Describe your company and raise. Meridian scans live fund activity and generates a precision-matched investor list.
          </p>
        </div>

        {/* Form */}
        {!result && (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-8 space-y-6">
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="sm:col-span-2">
                <label className="block text-xs text-text-secondary tracking-widest uppercase mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Technologies"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className="input-dark w-full px-4 py-3 rounded text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs text-text-secondary tracking-widest uppercase mb-2">
                  Company Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe what your company does, key metrics, traction..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input-dark w-full px-4 py-3 rounded text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-text-secondary tracking-widest uppercase mb-2">
                  Sector
                </label>
                <select
                  required
                  value={form.sector}
                  onChange={(e) => setForm({ ...form, sector: e.target.value })}
                  className="input-dark w-full px-4 py-3 rounded text-sm appearance-none"
                >
                  <option value="">Select sector</option>
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-text-secondary tracking-widest uppercase mb-2">
                  Stage
                </label>
                <select
                  required
                  value={form.stage}
                  onChange={(e) => setForm({ ...form, stage: e.target.value })}
                  className="input-dark w-full px-4 py-3 rounded text-sm appearance-none"
                >
                  <option value="">Select stage</option>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-text-secondary tracking-widest uppercase mb-2">
                  Amount Raising
                </label>
                <div className="flex gap-2">
                  <select
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="input-dark px-3 py-3 rounded text-sm appearance-none w-24"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 5,000,000"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="input-dark flex-1 px-4 py-3 rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-text-secondary tracking-widest uppercase mb-2">
                  Geography
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. United Kingdom, US, GCC"
                  value={form.geography}
                  onChange={(e) => setForm({ ...form, geography: e.target.value })}
                  className="input-dark w-full px-4 py-3 rounded text-sm"
                />
              </div>
            </div>

            <div className="pt-2">
              <button type="submit" className="btn-gold px-8 py-4 rounded text-sm font-semibold tracking-wide w-full sm:w-auto">
                Find Investors →
              </button>
            </div>
          </form>
        )}

        {/* Loading */}
        {loading && <LoadingState tool="raise" />}

        {/* Error */}
        {error && !loading && (
          <div className="bg-card border border-danger/30 rounded-lg p-8 text-center mt-8">
            <p className="text-danger mb-2 font-semibold">Analysis Failed</p>
            <p className="text-text-secondary text-sm mb-6">{error}</p>
            <button
              onClick={() => { setError(null); }}
              className="btn-gold px-6 py-3 rounded text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <RaiseResults
            result={result}
            onReset={() => setResult(null)}
          />
        )}
      </div>
    </main>
  );
}
