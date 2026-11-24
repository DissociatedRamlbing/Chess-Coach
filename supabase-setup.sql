-- Chess Coach: run this once in your Supabase project (SQL Editor > New query > paste > Run).

create table if not exists public.games (
  code    text primary key,
  white   text,
  black   text,
  moves   jsonb  not null default '[]'::jsonb,
  created bigint,
  updated bigint
);

-- Anyone with the site link can create, read and update games (there are no logins).
alter table public.games enable row level security;

drop policy if exists "games read"   on public.games;
drop policy if exists "games create" on public.games;
drop policy if exists "games update" on public.games;

create policy "games read"   on public.games for select to anon using (true);
create policy "games create" on public.games for insert to anon with check (true);
create policy "games update" on public.games for update to anon using (true) with check (true);

-- Let the site's public key use the table (the rules above still apply).
grant usage on schema public to anon;
grant select, insert, update on public.games to anon;

-- Live updates, so a move shows on the other device right away.
do $$
begin
  alter publication supabase_realtime add table public.games;
exception when duplicate_object then null;
end $$;
