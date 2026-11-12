
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
import { LETTERS } from "@/lib/letters";

type QuestionOption = {
  id: string;
  letter: string;
};

type QuestionRow = {
  id: string;
  letter: string;
  prompt: string;
};

const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export async function POST(req: Request) {
  const s = await createClient();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Prijava je potrebna" },
      { status: 401 }
    );
  }

  const { nickname = "" } = await req.json().catch(() => ({}));
  const db = adminDb();
  const date = day();

  if (nickname) {
    await db.from("profiles").upsert(
      {
        id: user.id,
        nickname: String(nickname).slice(0, 24),
      },
      { onConflict: "id" }
    );
  }

  let { data: board } = await db
    .from("daily_boards")
    .select("question_ids")
    .eq("date", date)
    .maybeSingle();

  if (!board) {
    const { data: qs } = await db
      .from("questions")
      .select("id,letter")
      .eq("active", true);

    if (!qs || qs.length === 0) {
      return NextResponse.json(
        { error: "Nema pitanja" },
        { status: 503 }
      );
    }

    const questionOptions = qs as QuestionOption[];

    const ids = LETTERS.map((letter) => {
      const opts = questionOptions.filter(
        (q: QuestionOption) => q.letter === letter
      );

      return opts[
        Math.floor(Math.random() * opts.length)
      ]?.id;
    });

    if (ids.some((id) => !id)) {
      return NextResponse.json(
        { error: "Za svako slovo nisu unesena pitanja" },
        { status: 503 }
      );
    }

    await db.from("daily_boards").upsert(
      {
        date,
        question_ids: ids,
      },
      { onConflict: "date" }
    );

    board = { question_ids: ids };
  }

  const { data: qs } = await db
    .from("questions")
    .select("id,letter,prompt")
    .in("id", board.question_ids);

  const questionRows = (qs ?? []) as QuestionRow[];

  const foundQuestions: (QuestionRow | undefined)[] =
    board.question_ids.map((id: string) =>
      questionRows.find(
        (q: QuestionRow) => q.id === id
      )
    );

  const questions = foundQuestions
    .filter(
      (q: QuestionRow | undefined): q is QuestionRow =>
        q !== undefined
    )
    .map((q: QuestionRow) => ({
      letter: q.letter,
      question: q.prompt,
    }));

  let { data: game } = await db
    .from("games")
    .select("*")
    .eq("user_id", user.id)
    .eq("date", date)
    .maybeSingle();

  if (!game && nickname) {
    const ins = await db
      .from("games")
      .insert({
        user_id: user.id,
        date,
      })
      .select()
      .single();

    game = ins.data;
  }

  let nextIndex = 0;
  let emojis: string[] = [];

  if (game) {
    const { data: ans } = await db
      .from("game_answers")
      .select("letter,outcome")
      .eq("game_id", game.id)
      .order("created_at");

    nextIndex = ans?.length || 0;

    emojis =
      ans?.map((a) =>
        a.outcome === "correct"
          ? "🟦"
          : a.outcome === "wrong"
            ? "🟥"
            : "⬜"
      ) || [];
  }

  return NextResponse.json({
    game,
    nickname,
    questions,
    nextIndex,
    emojis,
    remaining: game
      ? Math.max(
          0,
          Math.ceil(
            (
              new Date(game.started_at).getTime() +
              240000 +
              game.bonus_seconds * 1000 -
              Date.now()
            ) / 1000
          )
        )
      : 240,
  });
}
