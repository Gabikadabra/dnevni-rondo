import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
import { LETTERS, startsWithLetter } from "@/lib/letters";
async function allowed() { const s = await createClient(), { data: { user } } = await s.auth.getUser(); if (!user) return false; const { data } = await adminDb().from("admins").select("user_id").eq("user_id", user.id).maybeSingle(); return !!data; }
const denied = () => new NextResponse(null, { status: 404 });
function parseCsv(input: string) { const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false; for (let i=0;i<input.length;i++) { const c=input[i]; if (quoted) { if (c==='"'&&input[i+1]==='"') { cell+='"'; i++; } else if(c==='"') quoted=false; else cell+=c; } else if(c==='"') quoted=true; else if(c===",") { row.push(cell); cell=""; } else if(c==="\n") { row.push(cell.replace(/\r$/,"")); rows.push(row); row=[]; cell=""; } else cell+=c; } if(cell||row.length) { row.push(cell); rows.push(row); } return rows; }
function quote(value: unknown) { const s=String(value??""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }

export async function GET() {
  if (!await allowed()) return denied();
  const { data, error } = await adminDb().from("questions").select("letter,prompt,answer,alternatives,category,difficulty,active").order("letter").limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const lines = [["slovo","pitanje","odgovor","alternative","kategorija","tezina","aktivno"], ...(data ?? []).map((q) => [q.letter,q.prompt,q.answer,(q.alternatives ?? []).join("|"),q.category,q.difficulty,q.active])].map((r) => r.map(quote).join(",")).join("\r\n");
  return new Response("\uFEFF" + lines, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=dnevni-rondo-pitanja.csv" } });
}

export async function POST(req: Request) {
  if (!await allowed()) return denied();
  const rows = parseCsv(await req.text());
  if (rows.length < 2 || rows.length > 10001) return NextResponse.json({ error: "CSV mora imati zaglavlje i najviše 10 000 pitanja." }, { status: 400 });
  const header = rows[0].map((x) => x.trim().toLocaleLowerCase("hr-HR"));
  const index = (name: string) => header.indexOf(name);
  const li=index("slovo"), pi=index("pitanje"), ai=index("odgovor"), alti=index("alternative"), ci=index("kategorija"), di=index("tezina"), acti=index("aktivno");
  if ([li,pi,ai,ci].some((x) => x < 0)) return NextResponse.json({ error: "Zaglavlja: slovo,pitanje,odgovor,alternative,kategorija,tezina,aktivno." }, { status: 400 });
  const questions = rows.slice(1).filter((r) => r.some((x) => x.trim())).map((r) => ({ letter:r[li]?.trim(),prompt:r[pi]?.trim(),answer:r[ai]?.trim(),alternatives:alti<0?[]:(r[alti]??"").split("|").map((x)=>x.trim()).filter(Boolean),category:r[ci]?.trim(),difficulty:di<0?1:Number(r[di]||1),active:acti<0?true:!/^(false|0|ne)$/i.test(r[acti]??"")}));
  const invalid = questions.findIndex((q) => !LETTERS.includes(q.letter as any) || !q.prompt || !q.answer || !startsWithLetter(q.answer,q.letter) || !q.category || !Number.isInteger(q.difficulty) || q.difficulty<1 || q.difficulty>5);
  if (invalid >= 0) return NextResponse.json({ error: `Neispravan redak ${invalid+2}: provjerite slovo, pitanje, odgovor, kategoriju i težinu.` }, { status: 400 });
  const { error } = await adminDb().from("questions").insert(questions);
  return NextResponse.json({ imported: error ? 0 : questions.length, error: error?.message }, { status: error ? 400 : 200 });
}
