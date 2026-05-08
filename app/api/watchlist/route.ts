import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("watchlist")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { session_id, company_name, deal_type, tool_type, signal_strength, brief_data } = body;

  if (!session_id || !company_name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("watchlist")
    .insert({
      user_session: session_id,
      session_id,
      company_name,
      deal_type,
      tool_type,
      signal_strength,
      brief_data,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const sessionId = req.nextUrl.searchParams.get("session_id");

  if (!id || !sessionId) return NextResponse.json({ error: "Missing id or session_id" }, { status: 400 });

  const supabase = getSupabase();
  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("id", id)
    .eq("session_id", sessionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
