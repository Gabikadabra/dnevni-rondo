import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminDb } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string }> };
const validCode = (code: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(code);

async function getLeague(code: string) {
  if (!validCode(code)) return null;
  const { data } = await adminDb().from("leagues").select("name,code").eq("code", code).maybeSingle();
  return data;
}

async function getOrigin() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000").split(",")[0].trim();
  const protocol = (requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")).split(",")[0].trim();
  return new URL(`${protocol}://${host}`);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const league = await getLeague(code);
  if (!league) return { title: "Pozivnica za ligu · Dnevni Rondo", description: "Pridruži se nogometnom kvizu Dnevni Rondo." };

  const origin = await getOrigin();
  const title = `Liga „${league.name}” · Dnevni Rondo`;
  const description = `Pozvan/a si u ligu „${league.name}” u igri Dnevni Rondo. Otvori poziv, prijavi se i zaigraj za svoju ekipu!`;
  const url = new URL(`/liga/${league.code}`, origin);
  return {
    metadataBase: origin,
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "hr_HR",
      siteName: "Dnevni Rondo",
      title,
      description,
      url,
      images: [{ url: `/liga/${league.code}/opengraph-image`, width: 1200, height: 630, alt: `Liga ${league.name} — Dnevni Rondo` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`/liga/${league.code}/opengraph-image`] },
  };
}

export default async function LeagueInvitePage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const league = await getLeague(code);
  if (!league) notFound();

  return <main className="page football-page invite-page">
    <header className="topbar"><Link href="/" className="brand invite-brand"><span className="brand-ball">⚽</span><div><div className="eyebrow">NOGOMETNI KVIZ</div><h1>Dnevni Rondo</h1></div></Link><span className="invite-pill">🏆 POZIVNICA ZA LIGU</span></header>
    <section className="invite-hero card">
      <div className="invite-art" aria-hidden="true"><span>🏃🏻‍♂️</span><span>⚽</span><span>🏃🏽‍♂️</span><span>🏃🏼‍♂️</span></div>
      <div className="eyebrow">EKIPA TE ZOVE U IGRU</div>
      <h2>Pridruži se ligi<br/><span>„{league.name}”</span></h2>
      <p>Zaigraj dnevni nogometni kviz, skupljaj bodove i bori se za vrh ljestvice s ekipom.</p>
      <div className="invite-details"><span>⚽ Svakodnevni rondo</span><span>👥 {"Liga prijatelja"}</span><span>🏅 Tjedni poredak</span></div>
      <Link className="button primary invite-join" href={`/?join=${league.code}`}>Uđi u ligu i zaigraj <span>→</span></Link>
      <small>Već imaš račun? Ostat ćeš prijavljen/a i nakon ulaska u ligu.</small>
    </section>
    <footer className="footer invite-footer"><span>Dnevni Rondo · Znanje u krugu. Lopta u pokretu.</span><Link href="/">Otvori igru ↗</Link></footer>
  </main>;
}
