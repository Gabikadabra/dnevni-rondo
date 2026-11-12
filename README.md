# Dnevni Rondo

Hrvatska dnevna kviz igra: Next.js App Router, TypeScript, Tailwind i Supabase. Rješenja se provjeravaju u server API-ju i ne šalju se klijentu.

## Lokalno i Vercel

1. Napravite Supabase projekt. SQL Editorom pokrenite `supabase/schema.sql`, zatim `supabase/seed.sql`.
2. Supabase Authentication → Sign In / Providers: uključite Anonymous sign-ins i Email magic links. Dodajte `http://localhost:3000/**` i Vercel domenu u Redirect URLs.
3. Kopirajte `.env.example` u `.env.local`. Prepišite Project URL, anon/publishable key i service_role secret. Service role unosite samo u server environment, nikad u `NEXT_PUBLIC_` varijablu.
4. Pokrenite `npm install`, zatim `npm run dev`. Uvezite Git repozitorij u Vercel, postavite iste tri env varijable za Production i deployajte.
5. Za admina: prijavite se magic linkom, pronađite UUID u Supabase Authentication → Users, pa pokrenite `insert into public.admins(user_id) values ('UUID-OVDJE');`. `/admin` vraća 404 korisnicima bez uloge.

## Važno prije javnog lansiranja

Ovo je početna implementacija s igrivim prototipom, anon authom, dnevnim startom, provjerom odgovora na serveru, osnovnim dnevnim leaderboardom i osnovnim admin CRUD-om pitanja. Cjeloviti zahtjev još traži dodatni rad: drugi krug za pasove, zaključavanje rezultata i otkrivanje odgovora nakon završetka, dnevnu automatsku ploču bez ponavljanja, lige i njihove API-je, napredni admin kalendar/CSV/statistiku/moderaciju, email identity linking umjesto ponovne OTP prijave, zvukove/animacije, raspoloživo vrijeme autoritativno izračunato uz utrke te reviziju i idempotentne RLS politike. Ne objavljujte ovakav starter kao gotov natjecateljski servis bez tih koraka.

Shema uključuje tablice, indekse, RLS i početne leaderboard/streak/ghost funkcije. Svako dodatno pitanje dodaje se kao novi red u `questions`; `daily_boards` čuva ID-jeve izabrane ploče.
