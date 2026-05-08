"use client";

import { useEffect, useState } from "react";

const STEPS_RAISE = [
  { label: "Searching fund activity signals...", sublabel: "Batch 1 — Fund closes & AUM" },
  { label: "Searching recent investments...", sublabel: "Batch 2 — Portfolio announcements" },
  { label: "Scanning social & mandate signals...", sublabel: "Batch 3–4 — LinkedIn, Twitter, thesis" },
  { label: "Generating investor brief...", sublabel: "Goldman-level analysis via AI" },
  { label: "Building pitch positioning guide...", sublabel: "Comparable raises + investor positioning" },
];

const STEPS_DEALS = [
  { label: "Searching deal signals...", sublabel: "Batch 1 — Acquisitions, buyouts, strategic reviews" },
  { label: "Searching leadership & financial signals...", sublabel: "Batch 2–3 — CEO changes, revenue, restructuring" },
  { label: "Pulling financial data...", sublabel: "SEC EDGAR · Companies House · Strategic signals" },
  { label: "Generating mandate brief...", sublabel: "Lazard-level analysis via AI" },
];

// Timing: steps advance at 2s, 5.5s, 9s, 13s — last step is pitch positioning post-pipeline
const STEP_TIMINGS = [0, 2000, 5500, 9000, 13000];

export default function LoadingState({ tool = "raise" }: { tool?: "raise" | "deals" }) {
  const [currentStep, setCurrentStep] = useState(0);
  const steps = tool === "raise" ? STEPS_RAISE : STEPS_DEALS;

  useEffect(() => {
    const timers = STEP_TIMINGS.map((delay, i) =>
      setTimeout(() => setCurrentStep(i), delay)
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-24 px-6">
      {/* Gold animated ring */}
      <div className="relative mb-10">
        <div className="w-16 h-16 rounded-full border-2 border-border" />
        <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-gold border-t-transparent animate-spin" />
        <div className="absolute inset-3 w-10 h-10 rounded-full border border-gold/30 animate-pulse-gold" />
      </div>

      <p className="font-playfair text-2xl text-text-primary mb-1">
        Analysing...
      </p>
      <p className="text-text-secondary text-sm mb-10">Running {steps.length} search batches in parallel</p>

      {/* Steps */}
      <div className="w-full max-w-sm space-y-4 mb-8">
        {steps.map((step, i) => (
          <div key={step.label} className={`transition-all duration-500 ${i < currentStep ? "opacity-100" : i === currentStep ? "opacity-100" : "opacity-30"}`}>
            <div className={`flex items-center gap-3 ${
              i < currentStep ? "text-success" : i === currentStep ? "text-gold" : "text-text-secondary/40"
            }`}>
              <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                {i < currentStep ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i === currentStep ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className="text-sm font-medium">{step.label}</span>
            </div>
            <p className={`text-[11px] ml-7 mt-0.5 transition-colors duration-300 ${
              i === currentStep ? "text-text-secondary/60" : "text-text-secondary/30"
            }`}>
              {step.sublabel}
            </p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm h-0.5 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-gold rounded-full animate-progress" />
      </div>

      <p className="text-text-secondary/30 text-xs font-mono mt-4">
        Takes 8–15 seconds · All searches run simultaneously
      </p>
    </div>
  );
}
