import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
async function allowed() { const s = await createClient(), { data: { user } } = await s.auth.getUser(); if (!user) return false; const { data } = await adminDb().from("admins").select("user_id").eq("user_id", user.id).maybeSingle(); return !!data; }
export async function GET() {
  if (!await allowed()) return new NextResponse(null, { status: 404 });
  const db = adminDb(), today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), start = new Date(`${today}T12:00:00Z`); start.setUTCDate(start.getUTCDate() - 6); const week = start.toISOString().slice(0, 10);
  const [games, players, answers, profiles, leagues, questions] = await Promise.all([
    db.from("games").select("id,user_id,date,score,remaining_seconds,finished_at,hidden_from_board", { count: "exact" }).gte("date", week).lte("date", today).order("date", { ascending: false }).limit(10000),
    db.from("games").select("user_id", { count: "exact" }).eq("date", today),
    db.from("game_answers").select("letter,question_id,outcome,submitted_answer,game_id").limit(10000),
    db.from("profiles").select("id,nickname,streak,longest_streak,last_play_date,hidden,blocked,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(500),
    db.from("leagues").select("id,name,code,owner_id,created_at").order("created_at", { ascending: false }).limit(500),
    db.from("questions").select("id,letter,prompt,category,active").limit(10000)
  ]);
  const ids = [...new Set((games.data ?? []).map((g) => g.id))];
  const relevantAnswers = (answers.data ?? []).filter((a) => ids.includes(a.game_id));
  const finished = (games.data ?? []).filter((g) => g.finished_at);
  const byDay = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${week}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); const date = d.toISOString().slice(0, 10); return { date, players: (games.data ?? []).filter((g) => g.date === date).length }; });
  const perQuestion = (questions.data ?? []).map((q) => { const qas = relevantAnswers.filter((a) => a.question_id === q.id), correct=qas.filter((a) => a.outcome === "correct").length, wrong=qas.filter((a) => a.outcome === "wrong").length, skipped=qas.filter((a) => a.outcome === "skipped").length, total=correct+wrong+skipped; return { id:q.id,letter:q.letter,prompt:q.prompt,category:q.category, correct,wrong,skipped,total,correctPct:total?Math.round(correct/total*100):0,wrongPct:total?Math.round(wrong/total*100):0,skippedPct:total?Math.round(skipped/total*100):0, wrongAnswers: qas.filter((a) => a.outcome === "wrong" && a.submitted_answer).reduce((acc: Record<string, number>, a) => { const key = String(a.submitted_answer).trim().slice(0, 40); acc[key] = (acc[key] || 0) + 1; return acc; }, {}) }; });
  return NextResponse.json({ stats: { todayPlayers: (players.data ?? []).length, totalPlayers: profiles.count ?? (profiles.data ?? []).length, active7Days: new Set((games.data ?? []).map((g) => g.user_id)).size, averageScore: finished.length ? Math.round(finished.reduce((a, g) => a + g.score, 0) / finished.length * 10) / 10 : 0, averageRemaining: finished.length ? Math.round(finished.reduce((a, g) => a + g.remaining_seconds, 0) / finished.length) : 0 }, byDay, perQuestion, games: games.data ?? [], players: profiles.data ?? [], leagues: leagues.data ?? [] });
}

export async function POST(req: Request) {
  if (!await allowed()) return new NextResponse(null, { status: 404 });
  const body = await req.json().catch(() => ({})), db = adminDb();
  if (body.action === "player") {
    const { id, hidden, blocked } = body;
    const { error } = await db.from("profiles").update({ ...(typeof hidden === "boolean" ? { hidden } : {}), ...(typeof blocked === "boolean" ? { blocked } : {}) }).eq("id", id);
    return NextResponse.json({ ok: !error, error: error?.message }, { status: error ? 400 : 200 });
  }
  if (body.action === "rename-league") {
    const { error } = await db.from("leagues").update({ name: String(body.name ?? "").trim().slice(0, 40) }).eq("id", body.id);
    return NextResponse.json({ ok: !error, error: error?.message }, { status: error ? 400 : 200 });
  }
  if (body.action === "delete-league") {
    const { error } = await db.from("leagues").delete().eq("id", body.id);
    return NextResponse.json({ ok: !error, error: error?.message }, { status: error ? 400 : 200 });
  }
  if (body.action === "hide-result") {
    const { error } = await db.from("games").update({ hidden_from_board: !!body.hidden }).eq("id", body.id);
    return NextResponse.json({ ok: !error, error: error?.message }, { status: error ? 400 : 200 });
  }
  if (body.action === "delete-result") {
    const { error } = await db.from("games").delete().eq("id", body.id);
    return NextResponse.json({ ok: !error, error: error?.message }, { status: error ? 400 : 200 });
  }
  return NextResponse.json({ error: "Nepoznata radnja." }, { status: 400 });
}
