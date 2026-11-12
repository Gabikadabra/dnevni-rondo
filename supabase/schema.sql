create extension if not exists pgcrypto;
create table if not exists public.profiles(id uuid primary key references auth.users on delete cascade,nickname text not null default 'Igrač',streak int not null default 0,longest_streak int not null default 0,last_play_date date,hidden boolean not null default false,blocked boolean not null default false,created_at timestamptz default now());
create table if not exists public.questions(id uuid primary key default gen_random_uuid(),letter text not null check(letter in ('A','B','C','Č','Ć','D','Dž','Đ','E','F','G','H','I','J','K','L','Lj','M','N','Nj','O','P','R','S','Š','T','U','V','Z','Ž')),ordinal int not null default 1,prompt text not null,answer text not null,alternatives text[] not null default '{}',category text not null,difficulty int not null default 1 check(difficulty between 1 and 5),active boolean not null default true,created_at timestamptz default now());
create index if not exists questions_letter_idx on public.questions(letter,active);
create table if not exists public.daily_boards(date date primary key,question_ids uuid[] not null,locked boolean not null default false,created_at timestamptz default now());
create table if not exists public.games(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,date date not null,started_at timestamptz not null default now(),finished_at timestamptz,score int not null default 0,remaining_seconds int not null default 240,current_streak int not null default 0,bonus_seconds int not null default 0,emoji text[] not null default '{}',unique(user_id,date));
create index if not exists games_date_score_idx on public.games(date,score desc,remaining_seconds desc);
create table if not exists public.game_answers(game_id uuid not null references public.games on delete cascade,letter text not null,outcome text not null check(outcome in ('correct','wrong','skipped')),round int not null default 1,created_at timestamptz default now(),primary key(game_id,letter,round));
create table if not exists public.leagues(id uuid primary key default gen_random_uuid(),name text not null,code char(6) unique not null,owner_id uuid not null references auth.users,created_at timestamptz default now());
create table if not exists public.league_members(league_id uuid references public.leagues on delete cascade,user_id uuid references auth.users on delete cascade,joined_at timestamptz default now(),primary key(league_id,user_id));
create table if not exists public.admins(user_id uuid primary key references auth.users on delete cascade);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from admins where user_id=auth.uid())$$;
create or replace function public.update_streak(p_user_id uuid,p_date date) returns void language plpgsql security definer set search_path=public as $$declare p profiles%rowtype; begin select * into p from profiles where id=p_user_id; if not found then return; end if; if p.last_play_date=p_date then return; elsif p.last_play_date=p_date-1 then update profiles set streak=streak+1,longest_streak=greatest(longest_streak,streak+1),last_play_date=p_date where id=p_user_id; else update profiles set streak=1,longest_streak=greatest(longest_streak,1),last_play_date=p_date where id=p_user_id; end if; end$$;
create or replace view public.daily_leaderboard with (security_invoker=true) as select g.user_id,p.nickname,g.date,g.score,g.remaining_seconds from games g join profiles p on p.id=g.user_id where g.finished_at is not null and not p.hidden and not p.blocked;
create or replace function public.weekly_leaderboard(p_league uuid) returns table(user_id uuid,nickname text,score bigint) language sql security definer set search_path=public as $$select g.user_id,p.nickname,sum(g.score)::bigint from league_members lm join games g on g.user_id=lm.user_id join profiles p on p.id=g.user_id where lm.league_id=p_league and g.date>=date_trunc('week',timezone('Europe/Zagreb',now()))::date and not p.hidden and not p.blocked group by g.user_id,p.nickname order by 3 desc$$;
create or replace function public.daily_percentile(p_score int,p_date date) returns numeric language sql stable as $$select coalesce(round(100.0*count(*) filter(where score<p_score)/nullif(count(*),0),0),0) from games where date=p_date and finished_at is not null$$;
create or replace function public.daily_ghost(p_date date) returns table(letter text,correct_rate numeric) language sql stable as $$
 select q.letter,
        coalesce(
          avg(case when played.outcome='correct' then 1.0 else 0.0 end),
          case when q.letter in ('Dž','Lj','Nj') then .38 else .62 end
        )::numeric as correct_rate
 from public.daily_boards b
 cross join lateral unnest(b.question_ids) as picked(question_id)
 join public.questions q on q.id=picked.question_id
 left join (
   select a.letter,a.outcome
   from public.game_answers a
   join public.games g on g.id=a.game_id
   where g.date=p_date
 ) as played on played.letter=q.letter
 where b.date=p_date
 group by q.letter
$$;
alter table profiles enable row level security;alter table questions enable row level security;alter table daily_boards enable row level security;alter table games enable row level security;alter table game_answers enable row level security;alter table leagues enable row level security;alter table league_members enable row level security;alter table admins enable row level security;
create policy "profile own/admin" on profiles for all using(id=auth.uid() or is_admin()) with check(id=auth.uid() or is_admin());create policy "questions admin only" on questions for all using(is_admin()) with check(is_admin());create policy "boards admin only" on daily_boards for all using(is_admin()) with check(is_admin());create policy "games own/admin" on games for all using(user_id=auth.uid() or is_admin()) with check(user_id=auth.uid() or is_admin());create policy "answers own/admin" on game_answers for all using(exists(select 1 from games where id=game_id and user_id=auth.uid()) or is_admin()) with check(exists(select 1 from games where id=game_id and user_id=auth.uid()) or is_admin());create policy "league readable" on leagues for select using(true);create policy "league owner write" on leagues for all using(owner_id=auth.uid() or is_admin()) with check(owner_id=auth.uid() or is_admin());create policy "membership self/read league" on league_members for select using(user_id=auth.uid() or exists(select 1 from league_members x where x.league_id=league_id and x.user_id=auth.uid()) or is_admin());create policy "membership self join" on league_members for insert with check(user_id=auth.uid());create policy "membership self leave" on league_members for delete using(user_id=auth.uid() or is_admin());create policy "admins self read" on admins for select using(user_id=auth.uid() or is_admin());
grant select on public.daily_leaderboard to anon,authenticated;grant execute on function public.weekly_leaderboard(uuid) to anon,authenticated;grant execute on function public.daily_percentile(int,date) to anon,authenticated;grant execute on function public.daily_ghost(date) to anon,authenticated;
