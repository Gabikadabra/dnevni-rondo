import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
import { LETTERS, startsWithLetter } from "@/lib/letters";

async function admin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await adminDb().from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return !!data;
}
const denied = () => new NextResponse(null, { status: 404 });
function valid(x: any) {
  const difficulty=Number(x.difficulty ?? 1);
  return LETTERS.includes(x.letter) && typeof x.prompt === "string" && !!x.prompt.trim() && typeof x.answer === "string" && !!x.answer.trim() && startsWithLetter(x.answer, x.letter) && Array.isArray(x.alternatives ?? []) && (x.alternatives ?? []).every((a: unknown) => typeof a === "string") && typeof x.category === "string" && !!x.category.trim() && Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5;
}

export async function GET(req: Request) {
  if (!await admin()) return denied();
  const u = new URL(req.url), p = u.searchParams, page = Math.max(1, Number(p.get("page") || 1)), size = Math.min(100, Math.max(1, Number(p.get("size") || 30)));
  let query = adminDb().from("questions").select("id,letter,prompt,answer,alternatives,category,difficulty,active", { count: "exact" }).order("letter").order("created_at", { ascending: false });
  const letter = p.get("letter"), category = p.get("category"), active = p.get("active"), search = p.get("q");
  if (letter && LETTERS.includes(letter as any)) query = query.eq("letter", letter);
  if (category) query = query.eq("category", category);
  if (active === "true" || active === "false") query = query.eq("active", active === "true");
  if (p.get("difficulty")) query = query.eq("difficulty", Number(p.get("difficulty")));
  if (search) query = query.or(`prompt.ilike.%${search.replace(/[(),]/g, " ")}%,answer.ilike.%${search.replace(/[(),]/g, " ")}%`);
  const { data, count, error } = await query.range((page - 1) * size, page * size - 1);
  const { data: counts } = await adminDb().from("questions").select("letter").eq("active", true);
  const { data: categoryRows } = await adminDb().from("questions").select("category").limit(10000);
  return NextResponse.json({ rows: data ?? [], count: count ?? 0, page, size, categories:[...new Set((categoryRows??[]).map((x)=>x.category))], activeByLetter: LETTERS.map((l) => ({ letter: l, count: (counts ?? []).filter((x) => x.letter === l).length })), error: error?.message });
}

export async function POST(req: Request) {
  if (!await admin()) return denied();
  const x = await req.json().catch(() => null);
  if (!x || !valid(x)) return NextResponse.json({ error: "Provjerite slovo, pitanje, odgovor, kategoriju i težinu." }, { status: 400 });
  const { data, error } = await adminDb().from("questions").insert({ letter: x.letter, prompt: x.prompt.trim(), answer: x.answer.trim(), alternatives: x.alternatives ?? [], category: x.category.trim(), difficulty: Number(x.difficulty ?? 1), active: x.active !== false }).select().single();
  return NextResponse.json({ data, error: error?.message }, { status: error ? 400 : 201 });
}

export async function PUT(req: Request) {
  if (!await admin()) return denied();
  const x = await req.json().catch(() => null);
  if (!x?.id || !valid(x)) return NextResponse.json({ error: "Provjerite pitanje i odgovor." }, { status: 400 });
  const { data, error } = await adminDb().from("questions").update({ letter: x.letter, prompt: x.prompt.trim(), answer: x.answer.trim(), alternatives: x.alternatives ?? [], category: x.category.trim(), difficulty: Number(x.difficulty ?? 1), active: x.active !== false }).eq("id", x.id).select().single();
  return NextResponse.json({ data, error: error?.message }, { status: error ? 400 : 200 });
}

export async function DELETE(req: Request) {
  if (!await admin()) return denied();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Nedostaje ID pitanja." }, { status: 400 });
  const { error } = await adminDb().from("questions").update({ active: false }).eq("id", id);
  return NextResponse.json({ ok: !error, error: error?.message }, { status: error ? 400 : 200 });
}
