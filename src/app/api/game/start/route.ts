import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
import { LETTERS } from "@/lib/letters";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function POST(req: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Prijava Google računom ili e-poštom je potrebna." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const nickname = String(body.nickname ?? "").trim().slice(0, 24);
  const db = adminDb();
  const date = today();
  const { data: priorProfile } = await db.from("profiles").select("blocked").eq("id", user.id).maybeSingle();
  if (priorProfile?.blocked) return NextResponse.json({ error: "Ovaj račun ne može pristupiti igri." }, { status: 403 });
  if (nickname) {
    if (nickname.length < 2) return NextResponse.json({ error: "Nadimak mora imati barem 2 znaka." }, { status: 400 });
    await db.from("profiles").upsert({ id: user.id, nickname }, { onConflict: "id" });
  }

  let { data: board } = await db.from("daily_boards").select("question_ids,locked").eq("date", date).maybeSingle();
  if (!board) {
    const { data: qs, error } = await db.from("questions").select("id,letter").eq("active", true);
    if (error || !qs) return NextResponse.json({ error: "Pitanja trenutno nisu dostupna." }, { status: 503 });
    const ids = LETTERS.map((letter) => {
      const options = qs.filter((q) => q.letter === letter);
      return options.length ? options[Math.floor(Math.random() * options.length)].id : null;
    });
    if (ids.some((id) => !id)) return NextResponse.json({ error: "Za svako slovo mora postojati aktivno pitanje." }, { status: 503 });
    const created = await db.from("daily_boards").insert({ date, question_ids: ids, locked: true }).select("question_ids,locked").single();
    if (created.error && created.error.code !== "23505") return NextResponse.json({ error: "Današnju ploču nije moguće pripremiti." }, { status: 503 });
    if (created.data) board = created.data;
    else ({ data: board } = await db.from("daily_boards").select("question_ids,locked").eq("date", date).single());
  }
  if (!board) return NextResponse.json({ error: "Današnja ploča nije dostupna." }, { status: 503 });

  const { data: questions } = await db.from("questions").select("id,letter,prompt").in("id", board.question_ids);
  const byId = new Map((questions ?? []).map((q) => [q.id, q]));
  const ordered = board.question_ids.map((id: string) => byId.get(id)).filter(Boolean);
  if (ordered.length !== 30) return NextResponse.json({ error: "Današnja ploča nije potpuna." }, { status: 503 });

  let { data: game } = await db.from("games").select("*").eq("user_id", user.id).eq("date", date).maybeSingle();
  if (!game && nickname) {
    const created = await db.from("games").insert({ user_id: user.id, date, started_at: new Date().toISOString() }).select("*").single();
    if (created.error?.code === "23505") ({ data: game } = await db.from("games").select("*").eq("user_id", user.id).eq("date", date).single());
    else game = created.data;
  }
  const { data: answers } = game ? await db.from("game_answers").select("letter,outcome,round").eq("game_id", game.id).order("created_at") : { data: [] as {letter:string;outcome:string;round:number}[] };
  const doneLetters = new Set((answers ?? []).filter((a) => a.round === 1).map((a) => a.letter));
  const skipped = new Set((answers ?? []).filter((a) => a.outcome === "skipped").map((a) => a.letter));
  const roundTwoDone = new Set((answers ?? []).filter((a) => a.round === 2).map((a) => a.letter));
  const nextLetter = LETTERS.find((l) => !doneLetters.has(l)) ?? LETTERS.find((l) => skipped.has(l) && !roundTwoDone.has(l));
  const remaining = game ? Math.max(0, Math.ceil((new Date(game.started_at).getTime() + 240000 + (game.bonus_seconds ?? 0) * 1000 + (game.paused_milliseconds ?? 0) - Date.now()) / 1000)) : 240;
  const { data: profile } = await db.from("profiles").select("nickname,streak,longest_streak").eq("id", user.id).maybeSingle();
  return NextResponse.json({ game, nickname: nickname || profile?.nickname || "", streak: profile?.streak ?? 0, longestStreak: profile?.longest_streak ?? 0, questions: ordered.map((q: any) => ({ letter: q.letter, question: q.prompt })), nextIndex: nextLetter ? LETTERS.indexOf(nextLetter) : 30, nextLetter, round: doneLetters.size < 30 ? 1 : 2, emojis: LETTERS.map((l) => { const a = (answers ?? []).filter((x) => x.letter === l).at(-1); return a ? a.outcome === "correct" ? "🟦" : a.outcome === "wrong" ? "🟥" : "⬜" : ""; }), remaining, locked: !!board.locked });
}
