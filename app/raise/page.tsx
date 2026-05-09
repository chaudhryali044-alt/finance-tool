"use client";

import { useState } from "react";
import LoadingState from "@/components/LoadingState";
import RaiseResults from "@/components/RaiseResults";
import type { RaiseResult } from "@/types";

const SECTORS = ["SaaS", "Fintech", "Healthcare", "Logistics", "Consumer", "Real Estate", "Energy", "Other"];
const STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Growth", "Pre-IPO"];
const CURRENCIES = ["USD", "GBP", "EUR", "AED", "SGD", "CAD", "AUD"];

type FormPhase = "idle" | "detecting" | "confirming" | "loading" | "error";

interface DetectResponse {
  type: "company" | "description";
  confidence: "high" | "low";
  extracted: {
    sector?: string;
    stage?: string;
    geography?: string;
    amount?: string;
    currency?: string;
    description?: string;
    subSector?: string;
    useOfFunds?: string;
    keyStrengths?: string[];
    displayName?: string;
    companyType?: string;
  };
}

function matchStage(s: string): string {
  if (!s) return "";
  const lower = s.toLowerCase();
  for (const stage of STAGES) {
    if (lower.includes(stage.toLowerCase())) return stage;
  }
  if (lower.includes("pre-seed") || lower.includes("preseed")) return "Pre-Seed";
  if (lower.includes("seed")) return "Seed";
  if (lower.includes("series a")) return "Series A";
  if (lower.includes("series b")) return "Series B";
  if (lower.includes("series c")) return "Series C";
  if (lower.includes("growth")) return "Growth";
  if (lower.includes("ipo")) return "Pre-IPO";
  return "";
}

function matchSector(s: string): string {
  if (!s) return "";
  for (const sector of SECTORS) {
    if (s.toLowerCase().includes(sector.toLowerCase())) return sector;
  }
  return s;
}

function parseAmountValue(s: string): string {
  if (!s) return "";
  return s.replace(/[£$€₹]/g, "").replace(/[^0-9.,kmb]/gi, "").trim();
}

function parseCurrencyFromAmount(s: string): string {
  if (!s) return "";
  if (s.includes("£") || /gbp/i.test(s)) return "GBP";
  if (s.includes("€") || /eur/i.test(s)) return "EUR";
  if (/aed/i.test(s)) return "AED";
  if (/sgd/i.test(s)) return "SGD";
  if (s.includes("$") || /usd/i.test(s)) return "USD";
  return "";
}

export default function RaisePage() {
  const [mainInput, setMainInput] = useState("");
  const [formPhase, setFormPhase] = useState<FormPhase>("idle");
  const [detected, setDetected] = useState<DetectResponse | null>(null);
  const [form, setForm] = useState({
    sector: "",
    stage: "",
    amount: "",
    currency: "USD",
    geography: "",
  });
  const [result, setResult] = useState<RaiseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasAllFields = form.sector && form.stage && form.amount && form.geography;

  const runAnalysis = async (overrideDetected?: DetectResponse) => {
    const det = overrideDetected ?? detected;
    setFormPhase("loading");
    setError(null);

    try {
      const res = await fetch("/api/raise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: det?.type === "company" ? mainInput : mainInput,
          description: det?.extracted.description || mainInput,
          sector: form.sector,
          stage: form.stage,
          amount: form.amount,
          currency: form.currency,
          geography: form.geography,
          inputType: det?.type ?? "company",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setFormPhase("error");
    }
  };

  const handleFirstSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mainInput.trim()) return;

    // If all fields already filled, skip detection
    if (hasAllFields) {
      await runAnalysis();
      return;
    }

    // Run detection to auto-fill fields
    setFormPhase("detecting");
    try {
      const res = await fetch("/api/raise/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: mainInput }),
      });
      const data: DetectResponse = await res.json();
      setDetected(data);

      // Pre-fill form with extracted values, preserving any manually entered values
      // Prefer explicit currency field from detect over parsing from amount string
      const detectedCurrency = data.extracted.currency
        || parseCurrencyFromAmount(data.extracted.amount || "");
      setForm((prev) => ({
        sector: matchSector(data.extracted.sector || "") || prev.sector,
        stage: matchStage(data.extracted.stage || "") || prev.stage,
        geography: data.extracted.geography || prev.geography,
        amount: parseAmountValue(data.extracted.amount || "") || prev.amount,
        currency: (detectedCurrency && CURRENCIES.includes(detectedCurrency))
          ? detectedCurrency
          : prev.currency,
      }));

      setFormPhase("confirming");
    } catch {
      setDetected(null);
      setFormPhase("confirming");
    }
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAnalysis();
  };

  const handleReset = () => {
    setResult(null);
    setFormPhase("idle");
    setDetected(null);
    setMainInput("");
    setForm({ sector: "", stage: "", amount: "", currency: "USD", geography: "" });
  };

  if (result) {
    return (
      <main className="min-h-screen bg-background pt-16">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <RaiseResults result={result} onReset={handleReset} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pt-16">
      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-8 bg-gold" />
            <span className="text-gold text-xs tracking-[0.3em] uppercase font-mono">Capital Raise</span>
          </div>
          <h1 className="font-playfair text-4xl sm:text-5xl text-text-primary mb-4">
            Capital Raise Matcher
          </h1>
          <p className="text-text-secondary text-lg max-w-xl leading-relaxed">
            Describe your company and raise. Meridian scans live fund activity and generates a precision-matched investor list.
          </p>
        </div>

        {/* Loading */}
        {formPhase === "loading" && <LoadingState tool="raise" />}

        {/* Error */}
        {formPhase === "error" && (
          <div className="bg-card border border-danger/30 rounded-lg p-8 text-center">
            <p className="text-danger mb-2 font-semibold">Analysis Failed</p>
            <p className="text-text-secondary text-sm mb-6">{error}</p>
            <button
              onClick={() => setFormPhase("idle")}
              className="btn-gold px-6 py-3 rounded text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Form — idle or confirming */}
        {(formPhase === "idle" || formPhase === "detecting" || formPhase === "confirming") && (
          <form
            onSubmit={formPhase === "confirming" ? handleConfirmSubmit : handleFirstSubmit}
            className="bg-card border border-border rounded-lg p-8 space-y-6"
          >
            {/* Single intelligent input */}
            <div>
              <label className="block text-xs text-text-secondary tracking-widest uppercase mb-2">
                Company or Description
              </label>
              <textarea
                required
                rows={3}
                placeholder={"Describe your company or enter a company name...\ne.g. \"Revolut\" or \"B2B SaaS startup in London raising £3m Series A\" or \"healthcare diagnostics company UAE pre-Series A $2m\""}
                value={mainInput}
                onChange={(e) => setMainInput(e.target.value)}
                disabled={formPhase === "confirming"}
                className="input-dark w-full px-4 py-3 rounded text-sm resize-none disabled:opacity-60"
              />
              <p className="text-[11px] text-text-secondary/50 mt-1.5">
                You can type a company name, describe your startup, or describe a deal you&apos;re working on
              </p>
            </div>

            {/* Detection result banner */}
            {detected && formPhase === "confirming" && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded border text-sm ${
                detected.type === "company"
                  ? "bg-blue-500/5 border-blue-500/20 text-blue-400"
                  : "bg-success/5 border-success/20 text-success"
              }`}>
                <span className="flex-shrink-0">{detected.type === "company" ? "🏢" : "📋"}</span>
                <span>
                  Detected: <strong>{detected.type === "company" ? "Company name" : "Description"}</strong>
                  {detected.confidence === "high"
                    ? " — fields auto-filled below"
                    : " (low confidence — please review fields below)"}
                </span>
              </div>
            )}

            {/* Optional detail fields */}
            <div>
              <p className="text-xs text-text-secondary tracking-widest uppercase mb-3">
                {formPhase === "confirming" && detected
                  ? "Auto-detected details — confirm or edit"
                  : "Details — optional if described above"}
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-secondary/60 mb-1.5">Sector</label>
                  <select
                    value={form.sector}
                    onChange={(e) => setForm({ ...form, sector: e.target.value })}
                    className={`input-dark w-full px-4 py-3 rounded text-sm appearance-none ${
                      formPhase === "confirming" && detected && form.sector ? "border-success/30" : ""
                    }`}
                  >
                    <option value="">Select sector</option>
                    {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-text-secondary/60 mb-1.5">Stage</label>
                  <select
                    value={form.stage}
                    onChange={(e) => setForm({ ...form, stage: e.target.value })}
                    className={`input-dark w-full px-4 py-3 rounded text-sm appearance-none ${
                      formPhase === "confirming" && detected && form.stage ? "border-success/30" : ""
                    }`}
                  >
                    <option value="">Select stage</option>
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-text-secondary/60 mb-1.5">Amount Raising</label>
                  <div className="flex gap-2">
                    <select
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                      className="input-dark px-3 py-3 rounded text-sm appearance-none w-24"
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input
                      type="text"
                      placeholder="e.g. 5,000,000"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className={`input-dark flex-1 px-4 py-3 rounded text-sm ${
                        formPhase === "confirming" && detected && form.amount ? "border-success/30" : ""
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-text-secondary/60 mb-1.5">Geography</label>
                  <input
                    type="text"
                    placeholder="e.g. United Kingdom, US, GCC"
                    value={form.geography}
                    onChange={(e) => setForm({ ...form, geography: e.target.value })}
                    className={`input-dark w-full px-4 py-3 rounded text-sm ${
                      formPhase === "confirming" && detected && form.geography ? "border-success/30" : ""
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Submit area */}
            <div className="pt-2 flex items-center gap-4 flex-wrap">
              <button
                type="submit"
                disabled={formPhase === "detecting" || !mainInput.trim()}
                className="btn-gold px-8 py-4 rounded text-sm font-semibold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {formPhase === "detecting"
                  ? "Detecting input..."
                  : formPhase === "confirming"
                  ? "Find Investors →"
                  : "Analyse →"}
              </button>

              {formPhase === "confirming" && (
                <button
                  type="button"
                  onClick={() => { setFormPhase("idle"); setDetected(null); }}
                  className="text-text-secondary text-sm hover:text-text-primary transition-colors"
                >
                  ← Edit input
                </button>
              )}

              {formPhase === "idle" && !hasAllFields && (
                <p className="text-[11px] text-text-secondary/40 font-mono">
                  Clicking Analyse will auto-detect your input type
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
