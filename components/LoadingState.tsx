"use client";

import { useEffect, useState } from "react";

export default function LoadingState({ tool = "raise" }: { tool?: "raise" | "deals" }) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps =
    tool === "raise"
      ? [
          "Searching recent fund activity...",
          "Analysing investor mandates...",
          "Matching to your raise profile...",
          "Generating investor brief...",
        ]
      : [
          "Searching news signals...",
          "Analysing company data...",
          "Identifying likely acquirers...",
          "Generating deal brief...",
        ];

  useEffect(() => {
    const intervals = [2000, 5000, 8500, 11000];
    const timers = steps.map((_, i) =>
      setTimeout(() => setCurrentStep(i), intervals[i])
    );
    return () => timers.forEach(clearTimeout);
  // steps is stable per render — intentionally omitting to avoid resetting timers
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

      <p className="font-playfair text-2xl text-text-primary mb-2">
        Analysing...
      </p>
      <p className="text-text-secondary text-sm mb-10">This takes 10–15 seconds</p>

      {/* Steps */}
      <div className="w-full max-w-sm space-y-3 mb-8">
        {steps.map((step, i) => (
          <div
            key={step}
            className={`flex items-center gap-3 text-sm transition-all duration-500 ${
              i < currentStep
                ? "text-success"
                : i === currentStep
                ? "text-gold"
                : "text-text-secondary/40"
            }`}
          >
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
            {step}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm h-0.5 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-gold rounded-full animate-progress" />
      </div>
    </div>
  );
}
