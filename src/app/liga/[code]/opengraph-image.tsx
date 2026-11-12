import { ImageResponse } from "next/og";
import { adminDb } from "@/lib/supabase/admin";

export const runtime = "edge";
export const alt = "Pozivnica za ligu u Dnevnom Rondu";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const { data } = await adminDb().from("leagues").select("name").eq("code", code).maybeSingle();
  const name = data?.name ?? "Liga prijatelja";

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", flexDirection: "column", justifyContent: "center", padding: "72px", color: "white", background: "linear-gradient(130deg,#082b1d 0%,#0d5736 55%,#15804c 100%)", fontFamily: "Arial, sans-serif" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", opacity: 0.18, background: "repeating-linear-gradient(90deg,#80d8a0 0px,#80d8a0 150px,transparent 150px,transparent 300px)" }} />
      <div style={{ position: "absolute", right: "-145px", top: "-125px", width: "600px", height: "880px", border: "3px solid #d9f5df55", borderRadius: "50%" }} />
      <div style={{ position: "absolute", right: "85px", top: "140px", width: "330px", height: "330px", border: "3px solid #d9f5df55", borderRadius: "50%" }} />
      <div style={{ display: "flex", alignItems: "center", gap: "18px", fontSize: "26px", letterSpacing: "5px", fontWeight: 800, color: "#d9f5df", zIndex: 1 }}><span style={{ fontSize: "40px", letterSpacing: 0 }}>⚽</span>DNEVNI RONDO</div>
      <div style={{ display: "flex", marginTop: "58px", fontSize: "28px", letterSpacing: "3px", fontWeight: 700, color: "#bfe9cc", zIndex: 1 }}>POZIVNICA ZA LIGU</div>
      <div style={{ display: "flex", maxWidth: "790px", marginTop: "12px", fontSize: name.length > 22 ? "58px" : "72px", lineHeight: 1.05, fontWeight: 850, zIndex: 1 }}>{name}</div>
      <div style={{ display: "flex", marginTop: "24px", fontSize: "28px", color: "#e5f5e9", zIndex: 1 }}>Uđi u ekipu. Zaigraj za vrh ljestvice.</div>
      <div style={{ display: "flex", position: "absolute", right: "105px", bottom: "84px", gap: "10px", fontSize: "44px" }}>🏃🏻‍♂️　⚽　🏃🏽‍♂️　🏃🏼‍♂️</div>
    </div>,
    { ...size },
  );
}
