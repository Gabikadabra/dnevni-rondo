import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
import { LETTERS } from "@/lib/letters";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function POST() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Prijava Google računom ili e-poštom je potrebna." }, { status: 401 });
  const db = adminDb();
  const date = today();
  const { data: game } = await db.from("games").select("*").eq("user_id", user.id).eq("date", date).maybeSingle();
  if (!game) return NextResponse.json({ error: "Partija nije pronađena." }, { status: 404 });
  if (!game.finished_at) {
    const elapsed = (Date.now() - new Date(game.started_at).getTime()) / 1000;
    const { data: board } = await db.from("daily_boards").select("question_ids").eq("date", date).single();
    const { data: existing } = await db.from("game_answers").select("letter,outcome,round").eq("game_id", game.id);
    const seen = new Set((existing ?? []).map((x) => `${x.letter}:${x.round}`));
    const timedOut = elapsed > 240 + (game.bonus_seconds ?? 0) + 1.5;
    const complete = LETTERS.every((letter) => {
      const first = (existing ?? []).find((x) => x.letter === letter && x.round === 1);
      return !!first && (first.outcome !== "skipped" || seen.has(`${letter}:2`));
    });
    if (!timedOut && !complete) return NextResponse.json({ error: "Partija je još u tijeku." }, { status: 409 });
    if (timedOut && board) {
      const pending = LETTERS.flatMap((letter) => {
        const hasInitial = seen.has(`${letter}:1`);
        const wasSkipped = (existing ?? []).some((x) => x.letter === letter && x.round === 1 && x.outcome === "skipped");
        const needsInitial = !hasInitial;
        const needsSecond = hasInitial && wasSkipped && !seen.has(`${letter}:2`);
        const question_id = board.question_ids[LETTERS.indexOf(letter)];
        return needsInitial ? [{ game_id: game.id, question_id, letter, outcome: "wrong", round: 1 }] : needsSecond ? [{ game_id: game.id, question_id, letter, outcome: "wrong", round: 2 }] : [];
      });
      if (pending.length) await db.from("game_answers").upsert(pending, { onConflict: "game_id,letter,round", ignoreDuplicates: true });
    }
    const { data: after } = await db.from("game_answers").select("letter,outcome,round").eq("game_id", game.id);
    const emoji = LETTERS.map((letter) => { const answer = (after ?? []).filter((x) => x.letter === letter).sort((a,b) => b.round-a.round)[0]; return answer?.outcome === "correct" ? "🟦" : answer?.outcome === "wrong" ? "🟥" : answer?.outcome === "skipped" ? "⬜" : "🟥"; });
    const final = await db.from("games").update({ finished_at: new Date().toISOString(), remaining_seconds: timedOut ? 0 : game.remaining_seconds, emoji }).eq("id", game.id).is("finished_at", null).select("*").maybeSingle();
    if (final.data) {
      await db.rpc("update_streak", { p_user_id: user.id, p_date: date });
    }
  }
  const { data: finalGame } = await db.from("games").select("*").eq("id", game.id).single();
  const { data: board } = await db.from("daily_boards").select("question_ids").eq("date", date).single();
  const { data: questions } = await db.from("questions").select("id,letter,prompt,answer,alternatives").in("id", board?.question_ids ?? []);
  const byId = new Map((questions ?? []).map((q) => [q.id, q]));
  const revealed = (board?.question_ids ?? []).map((id: string) => byId.get(id)).filter(Boolean).map((q: any) => ({ letter: q.letter, question: q.prompt, answer: q.answer, alternatives: q.alternatives ?? [] }));
  const { data: answerRows } = await db.from("game_answers").select("letter,outcome,round").eq("game_id", game.id);
  return NextResponse.json({ game: finalGame, answers: revealed, outcomes: answerRows ?? [] });
}
