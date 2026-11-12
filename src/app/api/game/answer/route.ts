import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
import { LETTERS, closeEnough } from "@/lib/letters";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function POST(req: Request) {
  const auth = await createClient(), { data: { user } } = await auth.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Prijava Google računom ili e-poštom je potrebna." }, { status: 401 });
  const body = await req.json().catch(() => ({})), db = adminDb(), date = today();
  const { data: profile } = await db.from("profiles").select("blocked").eq("id", user.id).maybeSingle();
  if (profile?.blocked) return NextResponse.json({ error: "Ovaj račun ne može nastaviti igru." }, { status: 403 });
  const { data: game } = await db.from("games").select("id,finished_at,current_streak").eq("user_id", user.id).eq("date", date).maybeSingle();
  if (!game || game.finished_at) return NextResponse.json({ error: "Partija nije aktivna." }, { status: 409 });
  const { data: board } = await db.from("daily_boards").select("question_ids").eq("date", date).single();
  const { data: existing } = await db.from("game_answers").select("letter,outcome,round").eq("game_id", game.id);
  const rows = existing ?? [], initialDone = new Set(rows.filter((x) => x.round === 1).map((x) => x.letter)), secondDone = new Set(rows.filter((x) => x.round === 2).map((x) => x.letter)), skipped = new Set(rows.filter((x) => x.round === 1 && x.outcome === "skipped").map((x) => x.letter));
  const letter = LETTERS.find((l) => !initialDone.has(l)) ?? LETTERS.find((l) => skipped.has(l) && !secondDone.has(l));
  if (!letter || body.letter !== letter) return NextResponse.json({ error: "Odgovori na aktualno slovo." }, { status: 409 });
  const round = initialDone.size < 30 ? 1 : 2;
  if (body.pass && round !== 1) return NextResponse.json({ error: "U drugom krugu nije moguće preskočiti." }, { status: 400 });
  const qid = board?.question_ids?.[LETTERS.indexOf(letter)];
  const { data: question } = await db.from("questions").select("answer,alternatives").eq("id", qid).single();
  if (!question) return NextResponse.json({ error: "Pitanje nije pronađeno." }, { status: 500 });
  const outcome = body.pass ? "skipped" : ([question.answer, ...(question.alternatives ?? [])] as string[]).some((correct) => closeEnough(String(body.answer ?? ""), correct)) ? "correct" : "wrong";
  const { data: result, error } = await db.rpc("record_game_answer", { p_user_id: user.id, p_date: date, p_letter: letter, p_outcome: outcome, p_round: round, p_question_id: qid, p_submitted_answer: body.pass ? null : String(body.answer ?? "").slice(0, 120) });
  if (error) return NextResponse.json({ error: "Odgovora nije moguće spremiti." }, { status: 500 });
  if (result?.error) return NextResponse.json({ error: result.error }, { status: 409 });
  const { data: updatedGame } = await db.from("games").select("*").eq("id", game.id).single();
  return NextResponse.json({ ...result, nextIndex: result.nextLetter ? LETTERS.indexOf(result.nextLetter) : 30, game: updatedGame });
}
