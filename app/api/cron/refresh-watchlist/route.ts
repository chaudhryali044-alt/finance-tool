import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: items, error } = await supabase
    .from("watchlist")
    .select("*");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://meridian.app";
  let updated = 0;

  for (const item of items ?? []) {
    try {
      const endpoint = item.tool_type === "raise" ? "/api/raise" : "/api/deals";
      const payload =
        item.tool_type === "raise"
          ? {
              companyName: item.company_name,
              sector: item.brief_data?.sector ?? "",
              stage: item.brief_data?.stage ?? "",
              amount: item.brief_data?.amount ?? "",
              geography: item.brief_data?.geography ?? "",
            }
          : { query: item.company_name, dealType: item.deal_type };

      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) continue;
      const newData = await res.json();

      const oldStrength = item.signal_strength;
      const newStrength =
        item.tool_type === "deals"
          ? newData.signalStrength
          : item.signal_strength;

      const signalChanged = newStrength && newStrength !== oldStrength;

      await supabase
        .from("watchlist")
        .update({
          brief_data: newData,
          signal_strength: newStrength ?? item.signal_strength,
          signal_changed: signalChanged,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      updated++;
    } catch {
      // Continue with next item
    }
  }

  return NextResponse.json({ refreshed: updated, total: (items ?? []).length });
}
