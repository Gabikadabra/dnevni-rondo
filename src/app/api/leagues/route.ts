import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await createClient(), { data: { user } } = await auth.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Prijava Google računom ili e-poštom je potrebna." }, { status: 401 });
  const db = adminDb();
  const { data: memberships } = await db.from("league_members").select("league_id").eq("user_id", user.id);
  const ids = (memberships ?? []).map((m) => m.league_id);
  const { data: leagues } = ids.length ? await db.from("leagues").select("id,name,code,owner_id").in("id", ids) : { data: [] as any[] };
  const result = await Promise.all((leagues ?? []).map(async (league) => {
    const { data: members } = await db.from("league_members").select("user_id").eq("league_id", league.id);
    const memberIds = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = memberIds.length ? await db.from("profiles").select("id,nickname,hidden,blocked").in("id", memberIds) : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const gameRows: any[] = [];
    if (memberIds.length) {
      for (let from = 0; ; from += 1000) {
        const { data: page } = await db.from("games").select("user_id,date,score,remaining_seconds,hidden_from_board")
          .in("user_id", memberIds).not("finished_at", "is", null).order("date", { ascending: false }).order("user_id").range(from, from + 999);
        gameRows.push(...(page ?? []));
        if (!page || page.length < 1000) break;
      }
    }
    const visibleGames = gameRows.filter((g) => !g.hidden_from_board && !profileMap.get(g.user_id)?.hidden && !profileMap.get(g.user_id)?.blocked);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const todayDate = new Date(`${today}T12:00:00Z`);
    const weekDate = new Date(todayDate); weekDate.setUTCDate(weekDate.getUTCDate() - ((weekDate.getUTCDay() + 6) % 7));
    const weekStart = weekDate.toISOString().slice(0, 10);
    const weeklyGames = visibleGames.filter((g) => g.date >= weekStart && g.date <= today);
    const dailyGames = weeklyGames.filter((g) => g.date === today);
    const byPlayer = new Map<string, any>();
    for (const g of weeklyGames) {
      const p = byPlayer.get(g.user_id) ?? { user_id: g.user_id, nickname: profileMap.get(g.user_id)?.nickname ?? "Igrač", score: 0, games: 0, best: 0 };
      p.score += g.score; p.games += 1; p.best = Math.max(p.best, g.score); byPlayer.set(g.user_id, p);
    }
    const weekly = [...byPlayer.values()].sort((a, b) => b.score - a.score || b.best - a.best || a.nickname.localeCompare(b.nickname, "hr"))
      .map((p, i) => ({ ...p, rank: i + 1, isYou: p.user_id === user.id }));
    const bestGame = visibleGames.reduce((best, g) => !best || g.score > best.score ? g : best, null as any);
    const myGames = visibleGames.filter((g) => g.user_id === user.id);
    return { ...league, me: user.id, weekly, members: (members ?? []).map((m) => ({ user_id: m.user_id, nickname: profileMap.get(m.user_id)?.hidden ? "Skriveni igrač" : profileMap.get(m.user_id)?.nickname ?? "Igrač" })), stats: {
      memberCount: memberIds.length, activeThisWeek: new Set(weeklyGames.map((g) => g.user_id)).size,
      weeklyGames: weeklyGames.length, todayGames: dailyGames.length,
      averageScore: weeklyGames.length ? Math.round(weeklyGames.reduce((sum, g) => sum + g.score, 0) / weeklyGames.length * 10) / 10 : 0,
      bestScore: bestGame?.score ?? 0, bestPlayer: bestGame ? profileMap.get(bestGame.user_id)?.nickname ?? "Igrač" : "—",
      myRank: weekly.findIndex((p) => p.user_id === user.id) + 1 || null,
      myWeeklyScore: weekly.find((p) => p.user_id === user.id)?.score ?? 0,
      lifetimeGames: visibleGames.length,
      lifetimeAverage: visibleGames.length ? Math.round(visibleGames.reduce((sum, g) => sum + g.score, 0) / visibleGames.length * 10) / 10 : 0,
      myGames: myGames.length, myBest: myGames.reduce((best, g) => Math.max(best, g.score), 0),
      myAverage: myGames.length ? Math.round(myGames.reduce((sum, g) => sum + g.score, 0) / myGames.length * 10) / 10 : 0,
    } };
  }));
  return NextResponse.json({ leagues: result });
}

export async function POST(req: Request) {
  const auth = await createClient(), { data: { user } } = await auth.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Prijava Google računom ili e-poštom je potrebna." }, { status: 401 });
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
