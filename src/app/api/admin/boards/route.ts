import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
import { LETTERS } from "@/lib/letters";

async function isAdmin() { const s = await createClient(); const { data: { user } } = await s.auth.getUser(); if (!user) return false; const { data } = await adminDb().from("admins").select("user_id").eq("user_id", user.id).maybeSingle(); return !!data; }
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const denied = () => new NextResponse(null, { status: 404 });

export async function GET() {
  if (!await isAdmin()) return denied();
  const start = today(), endDate = new Date(`${start}T12:00:00Z`); endDate.setUTCDate(endDate.getUTCDate() + 29);
  const end = endDate.toISOString().slice(0, 10);
  const { data: boards } = await adminDb().from("daily_boards").select("date,question_ids,locked").gte("date", start).lte("date", end).order("date");
  const ids = [...new Set((boards ?? []).flatMap((b) => b.question_ids))];
  const { data: questions } = ids.length ? await adminDb().from("questions").select("id,letter,prompt,answer,active").in("id", ids) : { data: [] as any[] };
  const { data: bank } = await adminDb().from("questions").select("id,letter,prompt,answer,alternatives,category,difficulty,active").eq("active", true).order("letter").limit(1500);
  const map = new Map((questions ?? []).map((q) => [q.id, q]));
  return NextResponse.json({ bank: bank ?? [], days: Array.from({ length: 30 }, (_, i) => { const d = new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); const date = d.toISOString().slice(0, 10), board = (boards ?? []).find((b) => b.date === date); return { date, locked: !!board?.locked || date <= start, questions: (board?.question_ids ?? []).map((id: string) => map.get(id)).filter(Boolean) }; }) });
}

export async function POST(req: Request) {
  if (!await isAdmin()) return denied();
  const s = await createClient();
  const body = await req.json().catch(() => ({}));
  const date = String(body.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= today()) return NextResponse.json({ error: "Dopušteno je uređivati samo buduće datume." }, { status: 400 });
  const db = adminDb();
  const { data: old } = await db.from("daily_boards").select("date,locked").eq("date", date).maybeSingle();
  if (old?.locked) return NextResponse.json({ error: "Ploča je zaključana." }, { status: 409 });
  let ids: string[];
  if (Array.isArray(body.question_ids)) {
    ids = body.question_ids;
    if (ids.length !== 30 || new Set(ids).size !== 30) return NextResponse.json({ error: "Ploča mora imati 30 različitih pitanja." }, { status: 400 });
    const { data: rows } = await db.from("questions").select("id,letter,active").in("id", ids);
    if (!rows || rows.length !== 30 || LETTERS.some((l, i) => rows.find((q) => q.id === ids[i])?.letter !== l || !rows.find((q) => q.id === ids[i])?.active)) return NextResponse.json({ error: "Odaberite jedno aktivno pitanje za svako slovo redom." }, { status: 400 });
  } else {
    const { data: qs } = await db.from("questions").select("id,letter").eq("active", true);
    const { data: recent } = await db.from("daily_boards").select("question_ids").gte("date", new Date(new Date(`${date}T12:00:00Z`).getTime() - 14 * 86400000).toISOString().slice(0, 10)).lt("date", date);
    const used = new Set((recent ?? []).flatMap((b) => b.question_ids));
    ids = LETTERS.map((l) => { const options = (qs ?? []).filter((q) => q.letter === l && !used.has(q.id)); const all = options.length ? options : (qs ?? []).filter((q) => q.letter === l); return all.length ? all[Math.floor(Math.random() * all.length)].id : ""; });
    if (ids.some((x) => !x)) return NextResponse.json({ error: "Nedostaje aktivno pitanje za barem jedno slovo." }, { status: 400 });
  }
  const result = await db.from("daily_boards").upsert({ date, question_ids: ids, locked: false }, { onConflict: "date" });
  return NextResponse.json({ ok: !result.error, error: result.error?.message }, { status: result.error ? 400 : 200 });
}
