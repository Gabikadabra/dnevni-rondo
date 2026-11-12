import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export async function GET() {
  const date = today(), db = adminDb(), auth = await createClient(), { data: { user } } = await auth.auth.getUser();
  const { data: rows } = await db.from("daily_leaderboard").select("nickname,score,remaining_seconds").eq("date", date).order("score", { ascending: false }).order("remaining_seconds", { ascending: false }).limit(100);
  const ghostDay = new Date(`${date}T12:00:00Z`); ghostDay.setUTCDate(ghostDay.getUTCDate() - 1);
  const { data: ghostRows } = await db.rpc("daily_ghost", { p_date: ghostDay.toISOString().slice(0, 10) });
  const ghostScore = Math.round((ghostRows ?? []).reduce((sum: number, row: any) => sum + Number(row.correct_rate || 0), 0));
  let percentile: number | null = null;
  if (user) { const { data: own } = await db.from("games").select("score").eq("user_id", user.id).eq("date", date).not("finished_at","is",null).maybeSingle(); if (own) { const { data } = await db.rpc("daily_percentile", { p_score: own.score, p_date: date }); percentile = Number(data ?? 0); } }
  return NextResponse.json({ rows: rows ?? [], ghostScore, percentile });
}
