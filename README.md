# Dnevni Rondo

Potpuni izvorni projekt dnevne kviz igre na hrvatskom: Next.js App Router, TypeScript, Tailwind, Supabase Auth i Postgres, pripremljen za Vercel. Igrači koriste anonimnu prijavu i nadimak; rješenja se čitaju i provjeravaju samo u server API-ju. Točni odgovori šalju se igraču tek kad njegova partija završi.

## Sadržaj projekta

```text
src/app/                 igra, admin stranica i API rute
src/components/          igra i admin sučelje
src/lib/                 slova, normalizacija i Supabase klijenti
src/middleware.ts        provjera pristupa /admin
supabase/schema.sql      tablice, indeksi, RLS, funkcije i atomarni odgovor
supabase/seed.sql        početno pitanje za svako od 30 slova
.env.example             prazan predložak varijabli
```

## Lokalno pokretanje i Vercel

1. Napravite Supabase projekt.
2. U SQL Editoru pokrenite `supabase/schema.sql`, zatim jednom `supabase/seed.sql`.
3. Supabase → Authentication → Providers: uključite Anonymous sign-ins i Email. U URL Configuration upišite lokalnu adresu `http://localhost:3000` te konačnu Vercel domenu. Ako traži redirect pattern, dodajte `/admin` i root putanju.
4. Kopirajte `.env.example` u `.env.local` i unesite:

   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon/publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` — secret/service_role key; koristi se isključivo na serveru

5. U mapi projekta pokrenite `npm install` pa `npm run dev`. Otvorite `http://localhost:3000`.
6. Uvezite repozitorij u Vercel i unesite iste tri varijable u Project Settings → Environment Variables za Preview i Production. Nakon deploya dodajte produkcijsku domenu u Supabase URL Configuration.

Supabase ključeve nemojte stavljati u `NEXT_PUBLIC_` varijablu osim anon ključa. `.env.local` je u `.gitignore`; service role ključ nikad se ne uvozi u browser komponente.

## Prvi administrator

Otvorite `/admin`, unesite svoju e-poštu i otvorite pristiglu poveznicu. Dok vaš UUID još nije dodan u tablicu `admins`, zaštićena stranica nakon prijave ispravno vraća 404. U Supabase → Authentication → Users kopirajte ID svog računa i pokrenite:

```sql
insert into public.admins(user_id)
values ('OVDJE-UUID-VAŠEG-KORISNIKA');
```

Zatim ponovno otvorite `/admin`. Provjera se radi na serveru u middlewareu, stranici i svakoj admin API ruti. Admin sučelje uključuje filtriranje, straničenje, dodavanje/uređivanje/deaktivaciju pitanja, CSV, 30-dnevni kalendar, automatski i ručni odabir buduće ploče, testni pregled, statistiku, igrače, lige i moderiranje rezultata. Današnje i prošle ploče nisu moguće mijenjati.

## Pravila i sigurnost

- Hrvatska abeceda je kodirana redom u `src/lib/letters.ts`. Dž, Lj i Nj su pojedina slova; normalizacija pokriva velika/mala slova, kvačice i jedan tipfeler.
- Poslužitelj odabere i zaključa jednu zajedničku ploču za lokalni datum u `Europe/Zagreb`. Ploča se sprema u `daily_boards`, pa je jednaka svima. Admin može unaprijed složiti sljedećih 30 dana.
- Jedinstveni indeks dopušta jednu partiju korisnika po datumu. Sat od 240 sekundi počinje s prvom prikazanom pločom; Supabase RPC zaključava partiju, provjerava vrijeme i bilježi odgovor, bodove i bonus u jednoj transakciji. Klijent samo prikazuje odbrojavanje.
- Pas je besplatan, prekida niz i vraća slovo u drugi krug s jednim pokušajem. Svakih pet uzastopnih točnih odgovora server dodaje pet sekundi.
- RLS ne dopušta izravan pristup klijenta tablici s rješenjima ni dnevnoj ploči. Baza dopušta igraču čitati samo svoje partije i odgovore. Javna ljestvica izlaže nadimak, bodove i preostalo vrijeme; ne izlaže UUID igrača.
- Dnevni duh računa prosjek jučerašnjih dovršenih rezultata po slovu. Za slovo bez dovoljno podataka koristi zadani profil.
- Admin ploče upozoravaju kad je za slovo manje od 14 aktivnih pitanja. Seed donosi po jedno početno pitanje; dodajte još pitanja kroz admin sučelje ili CSV da bi dnevna ploča mijenjala sadržaj.

## Početna banka pitanja

Pitanja su namjerno kratka; alternativa prihvaća jednako valjan naziv ili zapis.

| Slovo | Pitanje | Točan odgovor | Alternative |
|---|---|---|---|
| A | Koji je glavni grad Grčke? | Atena | Atina |
| B | Koji je glavni grad Njemačke? | Berlin | — |
| C | Koji je rimski državnik prešao Rubikon i postao doživotni diktator? | Cezar | Julije Cezar |
| Č | Koja je južnoamerička država poznata po pustinji Atacama? | Čile | — |
| Ć | Koja se planina pruža istarskim poluotokom? | Ćićarija | — |
| D | Koja rijeka protječe kroz Osijek? | Drava | — |
| Dž | Koji je glavni grad Džibutija? | Džibuti | — |
| Đ | Koji je slavonski grad sjedište Đakovačko-osječke nadbiskupije? | Đakovo | — |
| E | Kako se zove afrička država čiji je glavni grad Asmara? | Eritreja | — |
| F | U kojem talijanskom gradu stoji katedrala Santa Maria del Fiore? | Firenca | — |
| G | Koja je rijeka sveta u hinduizmu? | Ganges | Ganga |
| H | Koji je glavni grad Finske? | Helsinki | — |
| I | Koji je najveći grad Turske? | Istanbul | — |
| J | Koji je planet poznat po Velikoj crvenoj pjegi? | Jupiter | — |
| K | Koji je glavni grad Danske? | Kopenhagen | København |
| L | Koji je glavni grad Perua? | Lima | — |
| Lj | Koji je glavni grad Slovenije? | Ljubljana | — |
| M | Koji je hrvatski nogometaš osvojio Zlatnu loptu 2018.? | Modrić | Luka Modrić |
| N | Koji je osmi planet od Sunca? | Neptun | — |
| Nj | Koje je hrvatsko turističko mjesto na otoku Krku? | Njivice | — |
| O | Koji element ima kemijski simbol Os? | Osmij | — |
| P | Koja država ima glavni grad Lisabon? | Portugal | — |
| R | Koji je glavni grad Latvije? | Riga | — |
| S | Koja je država poznata po gradu Beogradu? | Srbija | — |
| Š | Koji je hrvatski grad domaćin poznatog ljetnog festivala dalmatinske šansone? | Šibenik | — |
| T | Koji je glavni grad Japana? | Tokio | Tokyo |
| U | Koji kemijski element ima simbol U? | Uran | Uranij |
| V | Koji je drugi planet od Sunca? | Venera | — |
| Z | Koji je glavni grad Hrvatske? | Zagreb | — |
| Ž | Koja je preživačica s dugim vratom iz afričke savane? | Žirafa | — |

## Napomena o ključevima iz priloženog ZIP-a

Izvorni ZIP imao je stvarne Supabase vrijednosti u `.env.example`; u ovoj kopiji zamijenjene su praznim poljima. Rotirajte ih u Supabaseu, osobito service role ključ, ako je ZIP bio dijeljen ili objavljen. Ažurirajte vrijednosti u `.env.local` i Vercelu nakon rotacije.
