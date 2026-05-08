"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import RaiseResults from "@/components/RaiseResults";
import DealResults from "@/components/DealResults";
import type { RaiseResult, DealResult } from "@/types";

interface SharedBrief {
  tool_type: "raise" | "deals";
  company_name: string;
  brief_data: RaiseResult | DealResult;
}

function ShareContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [brief, setBrief] = useState<SharedBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Invalid share link.");
      setLoading(false);
      return;
    }
    fetch(`/api/share?id=${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setBrief(data.brief);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-24">
        <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin mb-4" />
        <p className="text-text-secondary text-sm">Loading brief...</p>
      </div>
    );
  }

  if (error || !brief) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <p className="text-danger mb-2 font-semibold">Brief not found</p>
        <p className="text-text-secondary text-sm">{error ?? "This share link may have expired."}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 bg-card border border-gold/20 rounded-lg p-4 text-center">
        <p className="text-text-secondary text-xs">
          Shared via <span className="font-playfair text-gold">Meridian</span> — Deal Intelligence Platform
        </p>
      </div>
      {brief.tool_type === "raise" ? (
        <RaiseResults result={brief.brief_data as RaiseResult} onReset={() => {}} />
      ) : (
        <DealResults result={brief.brief_data as DealResult} onReset={() => {}} />
      )}
    </div>
  );
}

export default function SharePage() {
  return (
    <main className="min-h-screen bg-background pt-16">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <Suspense fallback={
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          </div>
        }>
          <ShareContent />
        </Suspense>
      </div>
    </main>
  );
}
