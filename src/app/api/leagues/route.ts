import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await createClient(), { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Prijava je potrebna." }, { status: 401 });
  const db = adminDb();
  const { data: memberships } = await db.from("league_members").select("league_id").eq("user_id", user.id);
  const ids = (memberships ?? []).map((m) => m.league_id);
  const { data: leagues } = ids.length ? await db.from("leagues").select("id,name,code,owner_id").in("id", ids) : { data: [] as any[] };
  const result = await Promise.all((leagues ?? []).map(async (league) => {
    const { data: weekly } = await db.rpc("weekly_leaderboard", { p_league: league.id });
    const { data: members } = await db.from("league_members").select("user_id").eq("league_id", league.id);
    const memberIds = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = memberIds.length ? await db.from("profiles").select("id,nickname").in("id", memberIds) : { data: [] as {id:string;nickname:string}[] };
    const names = new Map((profiles ?? []).map((p) => [p.id, p.nickname]));
    return { ...league, weekly: weekly ?? [], members: (members ?? []).map((m) => ({ user_id: m.user_id, nickname: names.get(m.user_id) ?? "Igrač" })) };
  }));
  return NextResponse.json({ leagues: result });
}

export async function POST(req: Request) {
  const auth = await createClient(), { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Prijava je potrebna." }, { status: 401 });
  const body = await req.json().catch(() => ({})), db = adminDb();
  if (body.action === "create") {
    const name = String(body.name ?? "").trim().slice(0, 40);
    if (name.length < 3) return NextResponse.json({ error: "Naziv lige mora imati barem 3 znaka." }, { status: 400 });
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    const { data: league, error } = await db.from("leagues").insert({ name, code, owner_id: user.id }).select().single();
    if (error || !league) return NextResponse.json({ error: "Ligu nije moguće stvoriti." }, { status: 400 });
    await db.from("league_members").insert({ league_id: league.id, user_id: user.id });
    return NextResponse.json({ league }, { status: 201 });
  }
  if (body.action === "join") {
    const code = String(body.code ?? "").trim().toUpperCase();
    const { data: league } = await db.from("leagues").select("id,name,code").eq("code", code).maybeSingle();
    if (!league) return NextResponse.json({ error: "Kod lige nije pronađen." }, { status: 404 });
    const { error } = await db.from("league_members").upsert({ league_id: league.id, user_id: user.id }, { onConflict: "league_id,user_id", ignoreDuplicates: true });
    return NextResponse.json({ league, error: error?.message }, { status: error ? 400 : 200 });
  }
  return NextResponse.json({ error: "Nepoznata radnja." }, { status: 400 });
}
