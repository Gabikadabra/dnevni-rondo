import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";

const themes = new Set(["stadium", "night", "retro", "croatia"]);

export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Prijava je potrebna." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const nickname = String(body.nickname ?? "").trim().slice(0, 24);
  const theme = String(body.theme ?? "");
  const soundEnabled = body.soundEnabled;
  if (nickname.length < 2) return NextResponse.json({ error: "Nadimak mora imati barem 2 znaka." }, { status: 400 });
  if (!themes.has(theme)) return NextResponse.json({ error: "Odabrana tema nije podržana." }, { status: 400 });
  if (typeof soundEnabled !== "boolean") return NextResponse.json({ error: "Postavka zvuka nije valjana." }, { status: 400 });

  const db = adminDb();
  const values = { nickname, theme, sound_enabled: soundEnabled };
  const { data: existing, error: readError } = await db.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (readError) return NextResponse.json({ error: "Postavke računa nije moguće učitati." }, { status: 500 });

  if (existing) {
    const { error } = await db.from("profiles").update(values).eq("id", user.id);
    if (error) return NextResponse.json({ error: "Postavke nije moguće spremiti." }, { status: 500 });
  } else {
    const { error } = await db.from("profiles").insert({ id: user.id, ...values });
    if (error?.code === "23505") {
      const { error: retryError } = await db.from("profiles").update(values).eq("id", user.id);
      if (retryError) return NextResponse.json({ error: "Postavke nije moguće spremiti." }, { status: 500 });
    } else if (error) {
      return NextResponse.json({ error: "Postavke nije moguće spremiti." }, { status: 500 });
    }
  }

  return NextResponse.json({ preferences: { nickname, theme, soundEnabled } });
}
