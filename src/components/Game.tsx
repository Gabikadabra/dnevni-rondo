"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LETTERS } from "@/lib/letters";
import Link from "next/link";

type Question = { letter: string; question: string };
type Reveal = Question & { answer: string; alternatives: string[] };
type BoardResponse = { game: any; nickname: string; streak: number; questions: Question[]; nextIndex: number; nextLetter: string | null; round: number; emojis: string[]; remaining: number };

export default function Game() {
  const [user, setUser] = useState<any>(null), [nick, setNick] = useState(""), [board, setBoard] = useState<Question[]>([]), [game, setGame] = useState<any>(null), [active, setActive] = useState<string | null>(null), [round, setRound] = useState(1), [answer, setAnswer] = useState(""), [remaining, setRemaining] = useState(240), [score, setScore] = useState(0), [streak, setStreak] = useState(0), [share, setShare] = useState<string[]>([]), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [reveals, setReveals] = useState<Reveal[]>([]), [percentile, setPercentile] = useState<number | null>(null), [sound, setSound] = useState(true), [dark, setDark] = useState(false), [leagues, setLeagues] = useState<any[]>([]), [leagueName, setLeagueName] = useState(""), [leagueCode, setLeagueCode] = useState(""), [ghostScore, setGhostScore] = useState(18), [challengeScore, setChallengeScore] = useState<number|null>(null), [bonusFlash, setBonusFlash] = useState(false);
  const client = useRef(createClient()), field = useRef<HTMLInputElement>(null), ended = useRef(false), audio = useRef<AudioContext | null>(null), lastTick = useRef(31);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let { data: { user: current } } = await client.current.auth.getUser();
      if (!current) { const result = await client.current.auth.signInAnonymously(); current = result.data.user; if (result.error) throw result.error; }
      setUser(current);
      const response = await fetch("/api/game/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: localStorage.getItem("rondo-nick") || "" }) });
      const data: BoardResponse = await response.json();
      if (!response.ok) throw new Error((data as any).error || "Današnju igru nije moguće učitati.");
      setBoard(data.questions); setGame(data.game); setNick(data.nickname); setScore(data.game?.score || 0); setStreak(data.game?.current_streak || 0); setActive(data.nextLetter); setRound(data.round); setRemaining(data.remaining); setShare(data.emojis);
      if (data.game?.finished_at) await finishResult();
    } catch (e: any) { setError(e.message || "Došlo je do pogreške."); }
    finally { setLoading(false); }
  }, []);

  const finishResult = useCallback(async () => {
    if (ended.current) return;
    ended.current = true;
    const response = await fetch("/api/game/finish", { method: "POST" });
    const data = await response.json();
    if (response.ok) { setGame(data.game); setReveals(data.answers ?? []); setRemaining(data.game?.remaining_seconds ?? 0); const latest=new Map<string,any>(); for(const row of data.outcomes??[]){const prev=latest.get(row.letter);if(!prev||row.round>prev.round)latest.set(row.letter,row);} setShare(LETTERS.map((l)=>{const x=latest.get(l);return x?.outcome==="correct"?"🟦":x?.outcome==="wrong"?"🟥":x?.outcome==="skipped"?"⬜":"🟥";})); }
    else { ended.current=false; setTimeout(() => finishResult(), response.status===409?800:1600); return; }
    const stats = await fetch("/api/leaderboard").then((r) => r.json()).catch(() => null);
    if (stats?.percentile != null) setPercentile(stats.percentile);
    if (stats?.ghostScore != null) setGhostScore(stats.ghostScore);
  }, []);

  useEffect(() => { load(); const stored = localStorage.getItem("rondo-dark"); setDark(stored === "true"); const challenge = Number(new URLSearchParams(location.search).get("challenge")); if (Number.isFinite(challenge) && challenge > 0) setChallengeScore(challenge); fetch("/api/leaderboard").then((r) => r.json()).then((d) => setGhostScore(d.ghostScore ?? 18)).catch(() => {}); }, [load]);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); localStorage.setItem("rondo-dark", String(dark)); }, [dark]);
  useEffect(() => {
    if (!game || game.finished_at) return;
    const tick = () => { const n = Math.max(0, Math.ceil((new Date(game.started_at).getTime() + 240000 + (game.bonus_seconds || 0) * 1000 - Date.now()) / 1000)); setRemaining(n); if(n>0&&n<=30&&Math.floor(n)!==lastTick.current){lastTick.current=Math.floor(n);playTone(n<=10?920:580,.06);} if (n === 0 && lastTick.current!==0) { lastTick.current=0; finishResult(); } };
    tick(); const id = setInterval(tick, 200); return () => clearInterval(id);
  }, [game, finishResult]);
  useEffect(() => { if (!game || !game.finished_at) return; finishResult(); }, [game, finishResult]);
  useEffect(() => { if (!user) return; fetch("/api/leagues").then((r) => r.json()).then((d) => setLeagues(d.leagues || [])).catch(() => {}); }, [user]);

  function playTone(freq = 620, duration = 0.11) { if (!sound) return; try { audio.current ??= new AudioContext(); const osc = audio.current.createOscillator(), gain = audio.current.createGain(); osc.frequency.value = freq; gain.gain.value = .06; osc.connect(gain); gain.connect(audio.current.destination); osc.start(); gain.gain.exponentialRampToValueAtTime(.001, audio.current.currentTime + duration); osc.stop(audio.current.currentTime + duration); } catch {} }
  async function start() {
    const value = nick.trim(); if (value.length < 2) { setError("Nadimak mora imati barem 2 znaka."); return; }
    try { audio.current ??= new AudioContext(); } catch {}
    localStorage.setItem("rondo-nick", value); setError(""); setBusy(true);
    const response = await fetch("/api/game/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: value }) }), data = await response.json(); setBusy(false);
    if (!response.ok) { setError(data.error || "Ne mogu započeti igru."); return; }
    setGame(data.game); setNick(value); setBoard(data.questions); setActive(data.nextLetter); setRound(data.round); setRemaining(data.remaining); setShare(data.emojis); setScore(data.game.score); setStreak(data.game.current_streak || 0);
  }
  async function submit(pass = false) {
    if (!game || busy || !active) return;
    setBusy(true); setError("");
    const response = await fetch("/api/game/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ letter: active, answer: pass ? null : answer, pass }) }), data = await response.json(); setBusy(false);
    if (!response.ok) { setError(data.error || "Odgovor nije prihvaćen."); if (response.status === 409) await load(); return; }
    const i = LETTERS.indexOf(active as typeof LETTERS[number]); setShare((v) => v.map((x, n) => n === i ? data.outcome === "correct" ? "🟦" : data.outcome === "wrong" ? "🟥" : "⬜" : x));
    setScore(data.score); setStreak(data.streak); setRemaining(data.remaining); setAnswer(""); setActive(data.nextLetter); setRound(data.round); setGame(data.game); playTone(data.outcome === "correct" ? 760 : data.outcome === "wrong" ? 260 : 420);
    if (data.bonus_seconds) { setBonusFlash(true); setTimeout(()=>setBonusFlash(false),1400); playTone(980, .3); }
    if (data.finished) { ended.current = false; await finishResult(); }
    else field.current?.focus();
  }

  async function updateEmail(email: string) { const { error: authError } = await client.current.auth.updateUser({ email }); setError(authError?.message || "Provjeri e-poštu i potvrdi povezivanje računa."); }
  async function signInEmail(email: string) { const { error: authError } = await client.current.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }); setError(authError?.message || "Poslali smo poveznicu za prijavu. Otvori je na ovom uređaju."); }
  async function league(action: "create" | "join") { const response = await fetch("/api/leagues", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "create" ? { action, name: leagueName } : { action, code: leagueCode }) }), data = await response.json(); if (!response.ok) setError(data.error); else { setLeagueName(""); setLeagueCode(""); const result = await fetch("/api/leagues").then((r) => r.json()); setLeagues(result.leagues || []); } }
  async function shareScore() { const emojis = LETTERS.map((_, i) => share[i] || "⬜").join(""); const link = `${location.origin}/?challenge=${score}`; await navigator.clipboard.writeText(`${emojis}\n${score}/30 · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} · Dnevni Rondo ${link}`); setError("Rezultat i izazov kopirani su za dijeljenje."); }
  const activeQuestion = board.find((q) => q.letter === active);
  const done = !!game?.finished_at;

  if (loading) return <main className="page"><p className="loading">Pripremamo današnji rondo…</p></main>;
  if (!user || !board.length) return <main className="page"><p className="loading">{error || "Nije moguće povezati se s igrom."}</p><button className="button primary" onClick={load}>Pokušaj ponovno</button></main>;

  return <main className="page">
    <header className="topbar"><div className="brand"><span className="brand-ball">⚽</span><div><div className="eyebrow">Dnevna kviz igra</div><h1>Dnevni Rondo</h1></div></div><div className="header-actions"><button className="icon-button" onClick={() => setDark((v) => !v)} aria-label="Promijeni temu">{dark ? "☀️" : "🌙"}</button><button className="icon-button" onClick={() => setSound((v) => !v)} aria-label="Uključi ili isključi zvuk">{sound ? "🔊" : "🔇"}</button><Link href="/admin" className="admin-link">Admin ↗</Link></div></header>
    <div className="intro"><div><div className="eyebrow">DANAS · {new Intl.DateTimeFormat("hr-HR", { dateStyle: "full", timeZone: "Europe/Zagreb" }).format(new Date())}</div><h2>Znanje u krugu.<br/><span>Lopta u pokretu.</span></h2></div><p>30 slova · jedan zajednički sat · jedna prilika dnevno</p></div>
    {error && <div className="notice" role="status">{error}<button onClick={() => setError("")}>×</button></div>}

    {!game?.id ? <section className="welcome card"><div className="welcome-mark">◉</div><div><div className="eyebrow">Prije početka</div><h2>Pridruži se današnjem krugu</h2><p>Unesi nadimak. Sat kreće s prvim pitanjem i ne staje do kraja.</p></div><div className="welcome-form"><input value={nick} onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()} placeholder="Tvoj nadimak" maxLength={24}/><button className="button primary" onClick={start} disabled={busy}>Zaigraj rondo <span>→</span></button></div></section> : <div className="game-grid">
      <section className="field-column"><div className="scorebar"><div className="score-side"><span className="eyebrow">TI</span><strong>{nick || "Igrač"}</strong><b className="score-num">{score}</b></div><div className={`clock ${remaining <= 30 ? "urgent" : ""}`}><span className="eyebrow">VRIJEME</span><strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong>{bonusFlash&&<span className="bonus-float">+5 s ✨</span>}</div><div className="score-side right"><span className="eyebrow">DUH · JUČER</span><strong>👻 Dnevni duh</strong><b className="score-num">{ghostScore}</b></div></div>
      <div className="pitch"><div className="pitch-line"><i/><b/></div><div className="center-ghost">👻<small>DUH</small></div>{LETTERS.map((letter, i) => { const angle = i / 30 * Math.PI * 2 - Math.PI / 2, state = share[i], current = active === letter && !done; return <div key={letter} className={`player-wrap ${current ? "current" : ""}`} style={{ left: `${50 + 44 * Math.cos(angle)}%`, top: `${50 + 44 * Math.sin(angle)}%` }}><span className={`player ${state === "🟦" ? "correct" : state === "🟥" ? "wrong" : state === "⬜" ? "passed" : ""}`}>{letter}</span>{current && <span className="ball">⚽</span>}</div>; })}</div>
      <div className="field-legend"><span><i className="dot blue"/> Točno</span><span><i className="dot red"/> Netočno</span><span><i className="dot gray"/> Pas</span><span>🔥 Niz {streak}/5</span></div></section>

      <aside className="side-column"><section className="question-card card"><div className="question-head"><span className="eyebrow">{done ? "ZAVRŠNI REZULTAT" : round === 1 ? "PRVI KRUG" : "DRUGI KRUG · PRESKOČENA SLOVA"}</span><span className="question-index">{active ? LETTERS.indexOf(active as typeof LETTERS[number]) + 1 : 30}<i>/30</i></span></div>{done ? <><h2>{score > 0 ? "Rondo je gotov." : "Igra je završena."}</h2><p className="result-sub">Osvojio/la si <strong>{score} bodova</strong>{percentile != null && `. Bolji/a si od ${percentile}% igrača.`}</p>{challengeScore!=null&&<div className="win-banner">{score>challengeScore?"🏆 Pobijedio/la si izazov prijatelja!":`Izazov: pokušaj nadmašiti ${challengeScore} bodova.`}</div>}{score > ghostScore && <div className="win-banner">🎉 Sjajna igra — pobijedio/la si dnevnog duha!</div>}<button className="button primary full" onClick={shareScore}>Podijeli rezultat ↗</button></> : !active ? <><h2>Priprema terena…</h2><p>Učitavamo sljedeće slovo.</p></> : <><div className="letter-tag">{active}</div><h2 className="question-text">{activeQuestion?.question}</h2><form onSubmit={(e) => { e.preventDefault(); submit(); }}><div className="answer-row"><input ref={field} autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={`Odgovor na ${active}…`} autoComplete="off"/><button className="button primary send" disabled={busy || !answer.trim()} aria-label="Pošalji odgovor">→</button></div></form><button className="pass-button" onClick={() => submit(true)} disabled={busy || round !== 1}>⚽ Pas <span>{round === 2 ? "dostupno samo u prvom krugu" : "vratit će se u drugom krugu"}</span></button>{round === 2 && <p className="hint">U drugom krugu svaki preostali pas ima jedan pokušaj.</p>}</>}</section>
      <section className="card streak-card"><span className="streak-icon">🔥</span><div><strong>{streak} točnih zaredom</strong><p>Svakih 5 točnih odgovora dobivaš +5 sekundi.</p></div></section>
      <Leaderboard/><Account onLink={updateEmail} onSignIn={signInEmail}/>
      <section className="card leagues-card"><div className="section-head"><h3>Tvoje lige</h3><span>↗</span></div>{leagues.map((l) => <details key={l.id} className="league-row"><summary>{l.name}<span>Kod {l.code}</span></summary>{l.weekly?.map((x: any, i: number) => <p key={`${x.nickname}-${i}`}>{i + 1}. {x.nickname}<b>{x.score}</b></p>)}</details>)}<div className="league-tools"><input value={leagueName} onChange={(e) => setLeagueName(e.target.value)} placeholder="Naziv nove lige"/><button onClick={() => league("create")}>＋ Stvori</button><input value={leagueCode} onChange={(e) => setLeagueCode(e.target.value.toUpperCase())} placeholder="Kod lige" maxLength={6}/><button onClick={() => league("join")}>Pridruži se</button></div></section>
      </aside>
    </div>}

    {done && reveals.length > 0 && <section className="answers-section card"><div className="section-head"><div><div className="eyebrow">ZA ZNATI VIŠE</div><h2>Odgovori današnje ploče</h2></div><button className="button subtle" onClick={shareScore}>Podijeli ↗</button></div><div className="reveal-grid">{reveals.map((q) => <div key={q.letter} className="reveal-row"><b>{q.letter}</b><span>{q.question}</span><strong>{q.answer}</strong></div>)}</div></section>}
    <footer className="footer"><span>Dnevna ploča se mijenja u ponoć po vremenu Europe/Zagreb.</span><span>Pravilo poštene igre · Rezultat se bilježi jednom dnevno</span></footer>
  </main>;
}

function Leaderboard() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { fetch("/api/leaderboard").then((r) => r.json()).then((d) => setRows(d.rows || [])).catch(() => {}); const t = setInterval(() => fetch("/api/leaderboard").then((r) => r.json()).then((d) => setRows(d.rows || [])).catch(() => {}), 30000); return () => clearInterval(t); }, []);
  return <section className="card leaderboard"><div className="section-head"><h3>Današnja ljestvica</h3><span>TOP IGRAČI</span></div>{rows.length ? rows.slice(0, 7).map((row, i) => <div className="leader-row" key={`${row.nickname}-${i}`}><span className="rank">{String(i + 1).padStart(2, "0")}</span><span className="leader-name">{row.nickname}</span><strong>{row.score}<small> bod.</small></strong><time>{Math.floor(row.remaining_seconds / 60)}:{String(row.remaining_seconds % 60).padStart(2, "0")}</time></div>) : <p className="empty-state">Još nema završenih partija danas.</p>}</section>;
}

function Account({ onLink,onSignIn }: { onLink: (email: string) => void; onSignIn:(email:string)=>void }) {
  const [email, setEmail] = useState("");
  return <section className="card account-card"><div><div className="eyebrow">SAČUVAJ NAPREDAK</div><h3>Poveži e-poštu</h3><p>Potvrdi povezivanje da preneseš niz na drugi uređaj.</p></div><div className="account-form"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ti@primjer.hr"/><button onClick={() => onLink(email)} disabled={!email.includes("@")}>Poveži račun</button></div><button className="account-login" onClick={() => onSignIn(email)} disabled={!email.includes("@")}>Već imaš povezani račun? Prijavi se ovdje</button></section>;
}
