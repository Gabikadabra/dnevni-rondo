  -- Dnevni Rondo: pokrenuti kao jedna cjelina u Supabase SQL Editoru.
  create extension if not exists pgcrypto;

  create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    nickname text not null default 'Igrač' check (char_length(nickname) between 2 and 24),
    streak integer not null default 0,
    longest_streak integer not null default 0,
    last_play_date date,
    hidden boolean not null default false,
    blocked boolean not null default false,
    created_at timestamptz not null default now()
  );

  create table if not exists public.questions (
    id uuid primary key default gen_random_uuid(),
    letter text not null check (letter in ('A','B','C','Č','Ć','D','Dž','Đ','E','F','G','H','I','J','K','L','Lj','M','N','Nj','O','P','R','S','Š','T','U','V','Z','Ž')),
    ordinal integer not null default 1,
    prompt text not null check (length(trim(prompt)) > 0),
    answer text not null check (length(trim(answer)) > 0),
    alternatives text[] not null default '{}',
    category text not null,
    difficulty integer not null default 1 check (difficulty between 1 and 5),
    active boolean not null default true,
    created_at timestamptz not null default now()
  );
  create index if not exists questions_letter_active_idx on public.questions(letter, active);
  create index if not exists questions_category_idx on public.questions(category, active);

  create table if not exists public.daily_boards (
    date date primary key,
    question_ids uuid[] not null check (cardinality(question_ids) = 30),
    locked boolean not null default false,
    created_at timestamptz not null default now()
  );

  create table if not exists public.games (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    date date not null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    score integer not null default 0 check (score between 0 and 30),
    remaining_seconds integer not null default 240 check (remaining_seconds between 0 and 360),
    current_streak integer not null default 0,
    bonus_seconds integer not null default 0,
    paused_milliseconds integer not null default 0,
    emoji text[] not null default '{}',
    hidden_from_board boolean not null default false,
    unique(user_id, date)
  );
  create index if not exists games_date_score_idx on public.games(date, score desc, remaining_seconds desc) where finished_at is not null;
  create index if not exists games_user_date_idx on public.games(user_id, date desc);

  create table if not exists public.game_answers (
    game_id uuid not null references public.games(id) on delete cascade,
    question_id uuid references public.questions(id) on delete set null,
    letter text not null,
    outcome text not null check (outcome in ('correct','wrong','skipped')),
    round integer not null default 1 check (round in (1,2)),
    submitted_answer text,
    created_at timestamptz not null default now(),
    primary key(game_id, letter, round)
  );
  create index if not exists game_answers_letter_outcome_idx on public.game_answers(letter, outcome);

  create table if not exists public.leagues (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 3 and 40),
    code char(6) unique not null,
    owner_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
  );
  create table if not exists public.league_members (
    league_id uuid not null references public.leagues(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    joined_at timestamptz not null default now(),
    primary key(league_id,user_id)
  );
  create index if not exists league_members_user_idx on public.league_members(user_id);
  create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);

  -- Idempotent upgrade path for the starter schema in the supplied project.
  alter table public.profiles add column if not exists hidden boolean not null default false;
  alter table public.profiles add column if not exists blocked boolean not null default false;
  alter table public.games add column if not exists hidden_from_board boolean not null default false;
  alter table public.games add column if not exists paused_milliseconds integer not null default 0;
  alter table public.games drop constraint if exists games_remaining_seconds_check;
  alter table public.games add constraint games_remaining_seconds_check check (remaining_seconds between 0 and 360);
  alter table public.game_answers add column if not exists submitted_answer text;
  alter table public.game_answers add column if not exists question_id uuid references public.questions(id) on delete set null;

  create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$ select exists(select 1 from public.admins where user_id = auth.uid()) $$;
  revoke all on function public.is_admin() from public, anon;
  grant execute on function public.is_admin() to authenticated, service_role;

  create or replace function public.is_league_member(p_league uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$ select exists(select 1 from public.league_members where league_id=p_league and user_id=auth.uid()) $$;
  revoke all on function public.is_league_member(uuid) from public, anon;
  grant execute on function public.is_league_member(uuid) to authenticated, service_role;

  create or replace function public.update_streak(p_user_id uuid, p_date date) returns void
  language plpgsql security definer set search_path = public, pg_temp
  as $$
  declare p public.profiles%rowtype;
  begin
    select * into p from public.profiles where id = p_user_id for update;
    if not found or p.last_play_date = p_date then return; end if;
    if p.last_play_date = p_date - 1 then
      update public.profiles set streak = streak + 1, longest_streak = greatest(longest_streak, streak + 1), last_play_date = p_date where id = p_user_id;
    else
      update public.profiles set streak = 1, longest_streak = greatest(longest_streak, 1), last_play_date = p_date where id = p_user_id;
    end if;
  end $$;
  revoke all on function public.update_streak(uuid,date) from public, anon, authenticated;
  grant execute on function public.update_streak(uuid,date) to service_role;

  drop view if exists public.daily_leaderboard;
  create view public.daily_leaderboard with (security_barrier = true) as
  select p.nickname, g.date, g.score, g.remaining_seconds
  from public.games g join public.profiles p on p.id = g.user_id
  where g.finished_at is not null and not g.hidden_from_board and not p.hidden and not p.blocked;

  drop function if exists public.weekly_leaderboard(uuid);
  create function public.weekly_leaderboard(p_league uuid)
  returns table(nickname text, score bigint) language sql stable security definer set search_path = public, pg_temp
  as $$
    select p.nickname, sum(g.score)::bigint
    from public.league_members lm join public.games g on g.user_id=lm.user_id
    join public.profiles p on p.id=g.user_id
    where lm.league_id=p_league and g.date >= date_trunc('week', timezone('Europe/Zagreb', now()))::date
      and g.finished_at is not null and not g.hidden_from_board and not p.hidden and not p.blocked
    group by g.user_id,p.nickname order by 2 desc,p.nickname asc
  $$;
  revoke all on function public.weekly_leaderboard(uuid) from public, anon, authenticated;
  grant execute on function public.weekly_leaderboard(uuid) to service_role;

  create or replace function public.daily_percentile(p_score integer,p_date date)
  returns numeric language sql stable security definer set search_path = public, pg_temp
  as $$ select coalesce(round(100.0 * count(*) filter(where score < p_score) / nullif(count(*),0), 0),0)
        from public.games g join public.profiles p on p.id=g.user_id where date=p_date and finished_at is not null and not hidden_from_board and not p.hidden and not p.blocked $$;

  create or replace function public.daily_ghost(p_date date)
  returns table(letter text,correct_rate numeric) language sql stable security definer set search_path = public, pg_temp
  as $$
    select l.letter, coalesce(avg(case when a.outcome='correct' then 1.0 else 0.0 end) filter (where a.outcome is not null),
      case when l.letter in ('Dž','Lj','Nj') then .38 else .62 end)::numeric
    from unnest(array['A','B','C','Č','Ć','D','Dž','Đ','E','F','G','H','I','J','K','L','Lj','M','N','Nj','O','P','R','S','Š','T','U','V','Z','Ž']) l(letter)
    left join (select distinct on (ga.game_id,ga.letter) ga.letter,ga.outcome from public.game_answers ga join public.games gg on gg.id=ga.game_id join public.profiles gp on gp.id=gg.user_id where gg.date=p_date and gg.finished_at is not null and not gg.hidden_from_board and not gp.hidden and not gp.blocked order by ga.game_id,ga.letter,ga.round desc) a on a.letter=l.letter
    group by l.letter order by min(array_position(array['A','B','C','Č','Ć','D','Dž','Đ','E','F','G','H','I','J','K','L','Lj','M','N','Nj','O','P','R','S','Š','T','U','V','Z','Ž'],l.letter))
  $$;

  -- Atomically serializes an answer, validates the server clock/round/letter,
  -- applies streak bonus and writes the resulting score in one transaction.
  create or replace function public.record_game_answer(
    p_user_id uuid, p_date date, p_letter text, p_outcome text, p_round integer,
    p_question_id uuid, p_submitted_answer text default null
  ) returns jsonb language plpgsql security definer set search_path = public, pg_temp
  as $$
  declare
    v_game public.games%rowtype;
    v_letters text[] := array['A','B','C','Č','Ć','D','Dž','Đ','E','F','G','H','I','J','K','L','Lj','M','N','Nj','O','P','R','S','Š','T','U','V','Z','Ž'];
    v_done integer;
    v_next text;
    v_round integer;
    v_elapsed numeric;
    v_streak integer;
    v_bonus integer;
    v_score integer;
    v_remaining integer;
    v_finished boolean;
    v_emojis text[];
  begin
    select * into v_game from public.games where user_id=p_user_id and date=p_date for update;
    if not found or v_game.finished_at is not null then return jsonb_build_object('error','Partija nije aktivna.'); end if;
    -- Previous answer animations are excluded from active play time. This answer
    -- reserves the same 1.5 seconds that the client animation will use.
    v_elapsed := extract(epoch from (clock_timestamp() - v_game.started_at)) - (v_game.paused_milliseconds / 1000.0);
    if v_elapsed > 240 + v_game.bonus_seconds + 1.5 then return jsonb_build_object('error','Vrijeme je isteklo.'); end if;
    select count(*) into v_done from public.game_answers where game_id=v_game.id and round=1;
    v_next := null;
    select x.letter into v_next from unnest(v_letters) with ordinality x(letter,ord)
      where not exists(select 1 from public.game_answers a where a.game_id=v_game.id and a.letter=x.letter and a.round=1)
      order by x.ord limit 1;
    if v_next is null then
      select x.letter into v_next from unnest(v_letters) with ordinality x(letter,ord)
        where exists(select 1 from public.game_answers a where a.game_id=v_game.id and a.letter=x.letter and a.round=1 and a.outcome='skipped')
          and not exists(select 1 from public.game_answers a where a.game_id=v_game.id and a.letter=x.letter and a.round=2)
        order by x.ord limit 1;
    end if;
    v_round := case when v_done < 30 then 1 else 2 end;
    if v_next is null or p_letter <> v_next or p_round <> v_round then return jsonb_build_object('error','Slovo ili krug se promijenio. Osvježi igru.'); end if;
    if p_outcome not in ('correct','wrong','skipped') or (p_outcome='skipped' and v_round<>1) then return jsonb_build_object('error','Nevažeći odgovor.'); end if;
    begin
      insert into public.game_answers(game_id,question_id,letter,outcome,round,submitted_answer)
      values(v_game.id,p_question_id,p_letter,p_outcome,v_round,left(p_submitted_answer,120));
    exception when unique_violation then return jsonb_build_object('error','Odgovor je već zaprimljen.');
    end;
    v_streak := case when p_outcome='correct' then v_game.current_streak+1 else 0 end;
    v_bonus := case when p_outcome='correct' and v_streak % 5=0 then 5 else 0 end;
    v_score := v_game.score + case when p_outcome='correct' then 1 else 0 end;
    v_remaining := greatest(0,floor(240 + v_game.bonus_seconds + v_bonus + 1.5 - v_elapsed)::integer);
    select x.letter into v_next from unnest(v_letters) with ordinality x(letter,ord)
      where not exists(select 1 from public.game_answers a where a.game_id=v_game.id and a.letter=x.letter and a.round=1)
      order by x.ord limit 1;
    if v_next is null then
      select x.letter into v_next from unnest(v_letters) with ordinality x(letter,ord)
        where exists(select 1 from public.game_answers a where a.game_id=v_game.id and a.letter=x.letter and a.round=1 and a.outcome='skipped')
          and not exists(select 1 from public.game_answers a where a.game_id=v_game.id and a.letter=x.letter and a.round=2)
        order by x.ord limit 1;
    end if;
    v_finished := v_next is null;
    select array_agg(case latest.outcome when 'correct' then '🟦' when 'wrong' then '🟥' when 'skipped' then '⬜' else '⬜' end order by x.ord)
      into v_emojis from unnest(v_letters) with ordinality x(letter,ord)
      left join lateral (select a.outcome from public.game_answers a where a.game_id=v_game.id and a.letter=x.letter order by a.round desc limit 1) latest on true;
    update public.games set score=v_score,current_streak=v_streak,bonus_seconds=bonus_seconds+v_bonus,
      paused_milliseconds=paused_milliseconds+1500,
      remaining_seconds=v_remaining,emoji=v_emojis,finished_at=case when v_finished then clock_timestamp() else null end
      where id=v_game.id;
    if v_finished then perform public.update_streak(p_user_id,p_date); end if;
    return jsonb_build_object('outcome',p_outcome,'score',v_score,'streak',v_streak,'bonus_seconds',v_bonus,
      'remaining',v_remaining,'nextLetter',v_next,'round',case when v_done+1>=30 then 2 else 1 end,
      'finished',v_finished,'game_id',v_game.id);
  end $$;
  revoke all on function public.record_game_answer(uuid,date,text,text,integer,uuid,text) from public, anon, authenticated;
  grant execute on function public.record_game_answer(uuid,date,text,text,integer,uuid,text) to service_role;

  alter table public.profiles enable row level security;
  alter table public.questions enable row level security;
  alter table public.daily_boards enable row level security;
  alter table public.games enable row level security;
  alter table public.game_answers enable row level security;
  alter table public.leagues enable row level security;
  alter table public.league_members enable row level security;
  alter table public.admins enable row level security;

  drop policy if exists "profile own/admin" on public.profiles;
  drop policy if exists "profiles self read" on public.profiles;
  create policy "profiles self read" on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
  drop policy if exists "questions admin only" on public.questions;
  create policy "questions admin only" on public.questions for all to authenticated using (public.is_admin()) with check (public.is_admin());
  drop policy if exists "boards admin only" on public.daily_boards;
  create policy "boards admin only" on public.daily_boards for all to authenticated using (public.is_admin()) with check (public.is_admin());
  drop policy if exists "games own/admin" on public.games;
  drop policy if exists "games own read" on public.games;
  create policy "games own read" on public.games for select to authenticated using (user_id=auth.uid() or public.is_admin());
  drop policy if exists "answers own/admin" on public.game_answers;
  drop policy if exists "answers own read" on public.game_answers;
  create policy "answers own read" on public.game_answers for select to authenticated using (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()) or public.is_admin());
  drop policy if exists "league readable" on public.leagues;
  drop policy if exists "league owner write" on public.leagues;
  drop policy if exists "league members read league" on public.leagues;
  create policy "league members read league" on public.leagues for select to authenticated using (public.is_league_member(id) or owner_id=auth.uid() or public.is_admin());
  create policy "league owner write" on public.leagues for all to authenticated using (owner_id=auth.uid() or public.is_admin()) with check (owner_id=auth.uid() or public.is_admin());
  drop policy if exists "membership self/read league" on public.league_members;
  drop policy if exists "membership self join" on public.league_members;
  drop policy if exists "membership self leave" on public.league_members;
  drop policy if exists "membership visible to league" on public.league_members;
  create policy "membership visible to league" on public.league_members for select to authenticated using (user_id=auth.uid() or public.is_league_member(league_id) or public.is_admin());
  create policy "membership self join" on public.league_members for insert to authenticated with check (user_id=auth.uid());
  create policy "membership self leave" on public.league_members for delete to authenticated using (user_id=auth.uid() or public.is_admin());
  drop policy if exists "admins self read" on public.admins;
  create policy "admins self read" on public.admins for select to authenticated using (user_id=auth.uid() or public.is_admin());

  -- Game/profile writes go through server routes using the service-role key only.
  -- In particular, anon/authenticated cannot select the answer key or daily board.
  revoke all on public.questions, public.daily_boards from public, anon, authenticated;
  revoke all on public.profiles, public.games, public.game_answers, public.leagues, public.league_members, public.admins from public, anon, authenticated;
  grant all on public.profiles, public.questions, public.daily_boards, public.games, public.game_answers, public.leagues, public.league_members, public.admins to service_role;
  grant select on public.profiles, public.games, public.game_answers, public.leagues, public.league_members, public.admins to authenticated;
  grant select on public.daily_leaderboard to anon, authenticated;
  grant execute on function public.daily_percentile(integer,date) to anon, authenticated;
  grant execute on function public.daily_ghost(date) to anon, authenticated, service_role;
  grant select on public.admins to authenticated;

  -- Supabase Realtime is optional; enable it for league_members/games in the Dashboard if desired.
