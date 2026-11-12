"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LETTERS } from "@/lib/letters";
import Link from "next/link";

type Question = { letter: string; question: string };
type Reveal = Question & { answer: string; alternatives: string[] };
type BoardResponse = { game: any; nickname: string; streak: number; questions: Question[]; nextIndex: number; nextLetter: string | null; round: number; emojis: string[]; remaining: number };
type Theme = "stadium" | "night" | "retro" | "croatia";

export default function Game() {
  const [user, setUser] = useState<any>(null), [nick, setNick] = useState(""), [board, setBoard] = useState<Question[]>([]), [game, setGame] = useState<any>(null), [active, setActive] = useState<string | null>(null), [round, setRound] = useState(1), [answer, setAnswer] = useState(""), [remaining, setRemaining] = useState(240), [score, setScore] = useState(0), [streak, setStreak] = useState(0), [share, setShare] = useState<string[]>([]), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [reveals, setReveals] = useState<Reveal[]>([]), [percentile, setPercentile] = useState<number | null>(null), [sound, setSound] = useState(true), [theme, setTheme] = useState<Theme>("stadium"), [leagues, setLeagues] = useState<any[]>([]), [leagueName, setLeagueName] = useState(""), [leagueCode, setLeagueCode] = useState(""), [ghostScore, setGhostScore] = useState(18), [challengeScore, setChallengeScore] = useState<number|null>(null), [bonusFlash, setBonusFlash] = useState(false), [playMoment, setPlayMoment] = useState<{letter:string;outcome:string;key:number}|null>(null);
  const client = useRef(createClient()), field = useRef<HTMLInputElement>(null), ended = useRef(false), audio = useRef<AudioContext | null>(null), lastTick = useRef(31);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user: current } } = await client.current.auth.getUser();
      if (current?.is_anonymous) await client.current.auth.signOut();
      if (!current || current.is_anonymous) { setUser(null); return; }
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

  useEffect(() => { load(); const savedTheme = localStorage.getItem("rondo-theme") as Theme | null; if (savedTheme && ["stadium","night","retro","croatia"].includes(savedTheme)) setTheme(savedTheme); const challenge = Number(new URLSearchParams(location.search).get("challenge")); if (Number.isFinite(challenge) && challenge > 0) setChallengeScore(challenge); fetch("/api/leaderboard").then((r) => r.json()).then((d) => setGhostScore(d.ghostScore ?? 18)).catch(() => {}); }, [load]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("rondo-theme", theme); }, [theme]);
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
    const moment = { letter: active, outcome: data.outcome, key: Date.now() }; setPlayMoment(moment); window.setTimeout(() => setPlayMoment((current) => current?.key === moment.key ? null : current), 1500);
    setScore(data.score); setStreak(data.streak); setRemaining(data.remaining); setAnswer(""); setActive(data.nextLetter); setRound(data.round); setGame(data.game); playTone(data.outcome === "correct" ? 760 : data.outcome === "wrong" ? 260 : 420);
    if (data.bonus_seconds) { setBonusFlash(true); setTimeout(()=>setBonusFlash(false),1400); playTone(980, .3); }
    if (data.finished) { ended.current = false; await finishResult(); }
    else field.current?.focus();
  }

  async function signInEmail(email: string) { const { error: authError } = await client.current.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/` } }); setError(authError?.message || "Poslali smo poveznicu za prijavu. Otvori je na ovom uređaju."); }
  async function signInGoogle() { const { error: authError } = await client.current.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback?next=/` } }); if (authError) setError(authError.message); }
  async function signOut() { await client.current.auth.signOut(); setUser(null); setGame(null); setBoard([]); setError(""); }
  async function league(action: "create" | "join") { const response = await fetch("/api/leagues", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "create" ? { action, name: leagueName } : { action, code: leagueCode }) }), data = await response.json(); if (!response.ok) setError(data.error); else { setLeagueName(""); setLeagueCode(""); const result = await fetch("/api/leagues").then((r) => r.json()); setLeagues(result.leagues || []); setError(action === "create" ? `Liga „${data.league.name}” je spremna. Kod: ${data.league.code}` : `Pridružio/la si se ligi „${data.league.name}”.`); } }
  async function copyLeagueCode(code:string) { await navigator.clipboard.writeText(code); setError(`Kod lige ${code} kopiran je.`); }
  async function shareScore() { const emojis = LETTERS.map((_, i) => share[i] || "⬜").join(""); const link = `${location.origin}/?challenge=${score}`; await navigator.clipboard.writeText(`${emojis}\n${score}/30 · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} · Dnevni Rondo ${link}`); setError("Rezultat i izazov kopirani su za dijeljenje."); }
  const activeQuestion = board.find((q) => q.letter === active);
  const done = !!game?.finished_at;

  if (loading) return <main className="page"><p className="loading">Pripremamo današnji rondo…</p></main>;
  if (!user) return <main className="page"><header className="topbar"><div className="brand"><span className="brand-ball">⚽</span><div><div className="eyebrow">Dnevna kviz igra</div><h1>Dnevni Rondo</h1></div></div><Link href="/admin" className="admin-link">Admin ↗</Link></header><section className="auth-gate card"><div className="welcome-mark">◉</div><div className="eyebrow">TVOJ RAČUN, TVOJ NAPREDAK</div><h2>Prijavi se i zaigraj</h2><p>Prijava Google računom ili e-poštom čuva tvoje rezultate i niz između uređaja.</p>{error&&<div className="notice" role="status">{error}<button onClick={()=>setError("")}>×</button></div>}<Account user={null} onSignIn={signInEmail} onSignInGoogle={signInGoogle}/></section></main>;
  if (!board.length) return <main className="page"><p className="loading">{error || "Nije moguće povezati se s igrom."}</p><button className="button primary" onClick={load}>Pokušaj ponovno</button></main>;

  return <main className="page">
    <header className="topbar"><div className="brand"><span className="brand-ball">⚽</span><div><div className="eyebrow">Dnevna kviz igra</div><h1>Dnevni Rondo</h1></div></div><div className="header-actions"><span className="signed-in" title={user.email || user.id}>{user.email || "Google račun"}</span><label className="theme-control"><span>🎨</span><select aria-label="Nogometna tema" value={theme} onChange={(e)=>setTheme(e.target.value as Theme)}><option value="stadium">Stadion</option><option value="night">Noćna</option><option value="retro">Retro</option><option value="croatia">Hrvatska</option></select></label><button className="icon-button" onClick={() => setSound((v) => !v)} aria-label="Uključi ili isključi zvuk">{sound ? "🔊" : "🔇"}</button><button className="admin-link" onClick={signOut}>Odjava</button><Link href="/admin" className="admin-link">Admin ↗</Link></div></header>
    <div className="intro"><div><div className="eyebrow">DANAS · {new Intl.DateTimeFormat("hr-HR", { dateStyle: "full", timeZone: "Europe/Zagreb" }).format(new Date())}</div><h2>Znanje u krugu.<br/><span>Lopta u pokretu.</span></h2></div><p>30 slova · jedan zajednički sat · jedna prilika dnevno</p></div>
    {error && <div className="notice" role="status">{error}<button onClick={() => setError("")}>×</button></div>}

    {!game?.id ? <div className="welcome-stack"><section className="welcome card"><div className="welcome-mark">◉</div><div><div className="eyebrow">Prije početka</div><h2>Pridruži se današnjem krugu</h2><p>Unesi nadimak. Sat kreće s prvim pitanjem i ne staje do kraja.</p></div><div className="welcome-form"><input value={nick} onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()} placeholder="Tvoj nadimak" maxLength={24}/><button className="button primary" onClick={start} disabled={busy}>Zaigraj rondo <span>→</span></button></div></section><Account user={user} onSignIn={signInEmail} onSignInGoogle={signInGoogle}/><LeagueHub leagues={leagues} leagueName={leagueName} leagueCode={leagueCode} setLeagueName={setLeagueName} setLeagueCode={setLeagueCode} league={league} copyCode={copyLeagueCode}/></div> : <div className="game-grid">
      <section className="field-column"><div className="scorebar"><div className="score-side"><span className="eyebrow">TI</span><strong>{nick || "Igrač"}</strong><b className="score-num">{score}</b></div><div className={`clock ${remaining <= 30 ? "urgent" : ""}`}><span className="eyebrow">VRIJEME</span><strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong>{bonusFlash&&<span className="bonus-float">+5 s ✨</span>}</div><div className="score-side right"><span className="eyebrow">DUH · JUČER</span><strong>👻 Dnevni duh</strong><b className="score-num">{ghostScore}</b></div></div>
      <div className={`pitch game-pitch ${playMoment ? `play-${playMoment.outcome}` : ""}`}><div className="pitch-line"><i/><b/></div>{LETTERS.map((letter, i) => { const angle = i / 30 * Math.PI * 2 - Math.PI / 2, state = share[i], current = active === letter && !done, justPlayed = playMoment?.letter === letter; return <div key={letter} className={`player-wrap ${current ? "current" : ""} ${justPlayed ? `just-played ${playMoment?.outcome}` : ""}`} style={{ left: `${50 + 44 * Math.cos(angle)}%`, top: `${50 + 44 * Math.sin(angle)}%` }}><span className={`player ${state === "🟦" ? "correct" : state === "🟥" ? "wrong" : state === "⬜" ? "passed" : ""}`}><span className="shirt-number">{letter}</span></span>{current && (!playMoment || playMoment.outcome === "correct") && <span className="ball">⚽</span>}</div>; })}{(()=>{const steals=playMoment&&(playMoment.outcome==="wrong"||playMoment.outcome==="skipped"),i=steals?LETTERS.indexOf(playMoment.letter as typeof LETTERS[number]):-1,angle=i/30*Math.PI*2-Math.PI/2;return <div className={`center-ghost ${steals?"stealing":""}`} style={{left:steals?`${50+44*Math.cos(angle)}%`:"50%",top:steals?`${50+44*Math.sin(angle)}%`:"50%"}}><span>{steals?"🏃":"👻"}</span><small>{steals?"OSVAJA LOPTU":"DUH"}</small>{steals&&<b className="stolen-ball">⚽</b>}</div>;})()}</div>
      <div className="field-legend"><span><i className="dot blue"/> Točno</span><span><i className="dot red"/> Netočno</span><span><i className="dot gray"/> Pas</span><span>🔥 Niz {streak}/5</span></div></section>

      <aside className="side-column"><section className="question-card card"><div className="question-head"><span className="eyebrow">{done ? "ZAVRŠNI REZULTAT" : round === 1 ? "PRVI KRUG" : "DRUGI KRUG · PRESKOČENA SLOVA"}</span><span className="question-index">{active ? LETTERS.indexOf(active as typeof LETTERS[number]) + 1 : 30}<i>/30</i></span></div>{done ? <><h2>{score > 0 ? "Rondo je gotov." : "Igra je završena."}</h2><p className="result-sub">Osvojio/la si <strong>{score} bodova</strong>{percentile != null && `. Bolji/a si od ${percentile}% igrača.`}</p>{challengeScore!=null&&<div className="win-banner">{score>challengeScore?"🏆 Pobijedio/la si izazov prijatelja!":`Izazov: pokušaj nadmašiti ${challengeScore} bodova.`}</div>}{score > ghostScore && <div className="win-banner">🎉 Sjajna igra — pobijedio/la si dnevnog duha!</div>}<button className="button primary full" onClick={shareScore}>Podijeli rezultat ↗</button></> : !active ? <><h2>Priprema terena…</h2><p>Učitavamo sljedeće slovo.</p></> : <><div className="letter-tag">{active}</div><h2 className="question-text">{activeQuestion?.question}</h2><form onSubmit={(e) => { e.preventDefault(); submit(); }}><div className="answer-row"><input ref={field} autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={`Odgovor na ${active}…`} autoComplete="off"/><button className="button primary send" disabled={busy || !answer.trim()} aria-label="Pošalji odgovor">→</button></div></form><button className="pass-button" onClick={() => submit(true)} disabled={busy || round !== 1}>⚽ Pas <span>{round === 2 ? "dostupno samo u prvom krugu" : "vratit će se u drugom krugu"}</span></button>{round === 2 && <p className="hint">U drugom krugu svaki preostali pas ima jedan pokušaj.</p>}</>}</section>
      <section className="card streak-card"><span className="streak-icon">🔥</span><div><strong>{streak} točnih zaredom</strong><p>Svakih 5 točnih odgovora dobivaš +5 sekundi.</p></div></section>
      <Leaderboard/><Account user={user} onSignIn={signInEmail} onSignInGoogle={signInGoogle}/>
      <LeagueHub leagues={leagues} leagueName={leagueName} leagueCode={leagueCode} setLeagueName={setLeagueName} setLeagueCode={setLeagueCode} league={league} copyCode={copyLeagueCode}/>
      </aside>
    </div>}

    {done && reveals.length > 0 && <section className="answers-section card"><div className="section-head"><div><div className="eyebrow">ZA ZNATI VIŠE</div><h2>Odgovori današnje ploče</h2></div><button className="button subtle" onClick={shareScore}>Podijeli ↗</button></div><div className="reveal-grid">{reveals.map((q) => <div key={q.letter} className="reveal-row"><b>{q.letter}</b><span>{q.question}</span><strong>{q.answer}</strong></div>)}</div></section>}
    <footer className="footer"><span>Dnevna ploča se mijenja u ponoć po vremenu Europe/Zagreb.</span><span>Pravilo poštene igre · Rezultat se bilježi jednom dnevno</span></footer>
  </main>;
}

function LeagueHub({leagues,leagueName,leagueCode,setLeagueName,setLeagueCode,league,copyCode}:{leagues:any[];leagueName:string;leagueCode:string;setLeagueName:(value:string)=>void;setLeagueCode:(value:string)=>void;league:(action:"create"|"join")=>void;copyCode:(code:string)=>void}) {
  return <section className="card leagues-card"><div className="section-head league-hub-title"><div><div className="eyebrow">KLUBOVI I PRIJATELJI</div><h3>Tvoje lige</h3></div><span>{leagues.length} {leagues.length===1||leagues.length>=5?"LIGA":"LIGE"}</span></div>
    <div className="league-tools"><input value={leagueName} onChange={(e)=>setLeagueName(e.target.value)} placeholder="Naziv nove lige" maxLength={40}/><button onClick={()=>league("create")} disabled={leagueName.trim().length<3}>＋ Stvori ligu</button><input value={leagueCode} onChange={(e)=>setLeagueCode(e.target.value.toUpperCase())} placeholder="Unesi kod lige" maxLength={6}/><button onClick={()=>league("join")} disabled={leagueCode.trim().length!==6}>Pridruži se</button></div>
    {!leagues.length?<p className="empty-state league-empty">Još nisi u ligi. Stvori svoju ili se pridruži prijateljima kodom.</p>:<div className="league-list">{leagues.map((l:any)=><article className="league-card" key={l.id}><div className="league-card-head"><div><strong>{l.name}</strong><span>{l.owner_id===l.me?"Tvoja liga":"Liga prijatelja"}</span></div><button className="league-code" onClick={()=>copyCode(l.code)} aria-label={`Kopiraj kod lige ${l.code}`}>KOD · {l.code} ⧉</button></div><div className="league-stats"><div><small>ČLANOVI</small><b>👥 {l.stats?.memberCount??l.members?.length??0}</b></div><div><small>AKTIVNI OVAJ TJEDAN</small><b>{l.stats?.activeThisWeek??0}</b></div><div><small>PARTIJE DANAS</small><b>{l.stats?.todayGames??0}</b></div><div><small>PARTIJE OVAJ TJEDAN</small><b>{l.stats?.weeklyGames??0}</b></div><div><small>PROSJEK OVAJ TJEDAN</small><b>{l.stats?.averageScore??0}</b></div><div><small>PROSJEK UKUPNO</small><b>{l.stats?.lifetimeAverage??0}</b></div><div><small>NAJBOLJI REZULTAT</small><b>{l.stats?.bestScore??0}<em>{l.stats?.bestPlayer?` · ${l.stats.bestPlayer}`:""}</em></b></div><div><small>TVOJ TJEDNI POREDAK</small><b>{l.stats?.myRank?`#${l.stats.myRank} · ${l.stats.myWeeklyScore} bod.`:"Još nema rezultata"}</b></div><div><small>TVOJE PARTIJE · PROSJEK · REKORD</small><b>{l.stats?.myGames??0} · {l.stats?.myAverage??0} · {l.stats?.myBest??0}</b></div></div><div className="league-table-head"><strong>⚽ Tjedna ljestvica</strong><span>{l.stats?.lifetimeGames??0} odigranih partija ukupno</span></div>{l.weekly?.length?<ol className="league-standings">{l.weekly.map((player:any)=><li key={player.user_id} className={player.isYou?"you":""}><b className="league-rank">{player.rank===1?"🥇":player.rank===2?"🥈":player.rank===3?"🥉":player.rank}</b><span>{player.nickname}{player.isYou&&<small>TI</small>}</span><small>{player.games} {player.games===1?"partija":player.games<5?"partije":"partija"}</small><strong>{player.score} bod.</strong></li>)}</ol>:<p className="empty-state">Ljestvica se puni nakon prve završene partije člana.</p>}</article>)}</div>}
  </section>;
}

function Leaderboard() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { fetch("/api/leaderboard").then((r) => r.json()).then((d) => setRows(d.rows || [])).catch(() => {}); const t = setInterval(() => fetch("/api/leaderboard").then((r) => r.json()).then((d) => setRows(d.rows || [])).catch(() => {}), 30000); return () => clearInterval(t); }, []);
  return <section className="card leaderboard"><div className="section-head"><h3>Današnja ljestvica</h3><span>TOP IGRAČI</span></div>{rows.length ? rows.slice(0, 7).map((row, i) => <div className="leader-row" key={`${row.nickname}-${i}`}><span className="rank">{String(i + 1).padStart(2, "0")}</span><span className="leader-name">{row.nickname}</span><strong>{row.score}<small> bod.</small></strong><time>{Math.floor(row.remaining_seconds / 60)}:{String(row.remaining_seconds % 60).padStart(2, "0")}</time></div>) : <p className="empty-state">Još nema završenih partija danas.</p>}</section>;
}

function Account({ user,onSignIn,onSignInGoogle }: { user:any; onSignIn:(email:string)=>void; onSignInGoogle:()=>void }) {
  const [email, setEmail] = useState("");
  if(user) return <section className="card account-card"><div><div className="eyebrow">TVOJ RAČUN</div><h3>Prijavljen/a si</h3><p>{user.email || "Google račun"} · napredak se sprema na tvoj račun.</p></div></section>;
  return <section className="card account-card"><div><div className="eyebrow">RAČUN I NAPREDAK</div><h3>Prijavi se za igru</h3><p>Bez anonimnih računa. Prijava čuva tvoje rezultate i niz na svim uređajima.</p></div><div className="auth-buttons"><button className="auth-option" onClick={onSignInGoogle}><span className="google-mark">G</span>Nastavi s Googleom</button></div><div className="account-form"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tvoja@e-posta.hr"/><button onClick={() => onSignIn(email)} disabled={!email.includes("@")}>Pošalji poveznicu</button></div></section>;
}
