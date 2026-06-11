-- REDZONE ARENA Play rooms + Team Select + Ready System + Empty Room Cleanup
-- Run this in Supabase SQL Editor. Safe to run multiple times.

create table if not exists match_rooms (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('2v2', '5v5')),
  host_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'full', 'live', 'completed', 'cancelled')),
  max_players int not null default 4,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists match_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references match_rooms(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  slot int not null,
  is_ready boolean not null default false,
  joined_at timestamptz not null default now()
);

alter table match_room_players add column if not exists room_id uuid references match_rooms(id) on delete cascade;
alter table match_room_players add column if not exists profile_id uuid references profiles(id) on delete cascade;
alter table match_room_players add column if not exists slot int;
alter table match_room_players add column if not exists is_ready boolean not null default false;
alter table match_room_players add column if not exists joined_at timestamptz not null default now();

alter table match_rooms add column if not exists max_players int not null default 4;
alter table match_rooms add column if not exists updated_at timestamptz not null default now();

alter table profiles add column if not exists points int not null default 0;
alter table teams add column if not exists points int not null default 0;
alter table match_rooms add column if not exists winner_team text check (winner_team in ('A', 'B'));
alter table match_rooms add column if not exists completed_at timestamptz;

-- Fill missing values if old rows exist
update match_room_players set is_ready = false where is_ready is null;
update match_room_players set slot = 1 where slot is null;

-- Remove broken/empty old rooms so they don't stay on the page forever
delete from match_rooms r
where r.status in ('waiting', 'full', 'cancelled')
  and not exists (select 1 from match_room_players p where p.room_id = r.id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'match_room_players_room_profile_unique') then
    alter table match_room_players add constraint match_room_players_room_profile_unique unique(room_id, profile_id);
  end if;
exception when duplicate_table then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'match_room_players_room_slot_unique') then
    alter table match_room_players add constraint match_room_players_room_slot_unique unique(room_id, slot);
  end if;
exception when duplicate_table then null;
end $$;

create index if not exists idx_match_rooms_status on match_rooms(status);
create index if not exists idx_match_room_players_room on match_room_players(room_id);
create index if not exists idx_match_room_players_profile on match_room_players(profile_id);

alter table match_rooms enable row level security;
alter table match_room_players enable row level security;

-- Re-create policies cleanly
drop policy if exists match_rooms_select on match_rooms;
drop policy if exists match_rooms_insert_own on match_rooms;
drop policy if exists match_rooms_update_host_or_player on match_rooms;
drop policy if exists match_rooms_delete_host on match_rooms;
drop policy if exists match_room_players_select on match_room_players;
drop policy if exists match_room_players_insert_own on match_room_players;
drop policy if exists match_room_players_update_own_team on match_room_players;
drop policy if exists match_room_players_update_own_ready on match_room_players;
drop policy if exists match_room_players_delete_own_or_host on match_room_players;

create policy match_rooms_select on match_rooms
for select to authenticated using (true);

create policy match_rooms_insert_own on match_rooms
for insert to authenticated with check (auth.uid() = host_id);

create policy match_rooms_update_host_or_player on match_rooms
for update to authenticated using (
  auth.uid() = host_id
  or exists (
    select 1 from match_room_players
    where match_room_players.room_id = match_rooms.id
      and match_room_players.profile_id = auth.uid()
  )
) with check (
  auth.uid() = host_id
  or exists (
    select 1 from match_room_players
    where match_room_players.room_id = match_rooms.id
      and match_room_players.profile_id = auth.uid()
  )
);

create policy match_rooms_delete_host on match_rooms
for delete to authenticated using (auth.uid() = host_id);

create policy match_room_players_select on match_room_players
for select to authenticated using (true);

create policy match_room_players_insert_own on match_room_players
for insert to authenticated with check (auth.uid() = profile_id);

create policy match_room_players_update_own_team on match_room_players
for update to authenticated
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

create policy match_room_players_update_own_ready on match_room_players
for update to authenticated
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

create policy match_room_players_delete_own_or_host on match_room_players
for delete to authenticated using (
  auth.uid() = profile_id
  or exists (
    select 1 from match_rooms
    where match_rooms.id = match_room_players.room_id
      and match_rooms.host_id = auth.uid()
  )
);

-- Auto delete rooms when the last player leaves.
create or replace function delete_empty_match_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from match_room_players where room_id = old.room_id) then
    delete from match_rooms where id = old.room_id;
  else
    update match_rooms
    set status = 'waiting', updated_at = now()
    where id = old.room_id and status = 'full';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_delete_empty_match_room on match_room_players;
create trigger trg_delete_empty_match_room
after delete on match_room_players
for each row execute function delete_empty_match_room();

-- RPC FIX: use secure server-side functions for create/join/ready/leave/delete.
-- This avoids client-side RLS/schema mismatch errors.

create or replace function rz_current_profile_id()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid := auth.uid();
  v_email text;
begin
  if v_id is null then
    raise exception 'Not logged in';
  end if;

  select email into v_email from auth.users where id = v_id;

  insert into public.profiles (id, username, role)
  values (v_id, coalesce(split_part(v_email, '@', 1), 'player'), 'captain')
  on conflict (id) do nothing;

  return v_id;
end;
$$;

create or replace function rz_create_room(p_mode text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile uuid;
  v_room uuid;
  v_max int;
begin
  v_profile := rz_current_profile_id();

  if p_mode not in ('2v2', '5v5') then
    raise exception 'Invalid mode';
  end if;

  v_max := case when p_mode = '2v2' then 4 else 10 end;

  insert into public.match_rooms (mode, host_id, status, max_players)
  values (p_mode, v_profile, 'waiting', v_max)
  returning id into v_room;

  insert into public.match_room_players (room_id, profile_id, slot, is_ready)
  values (v_room, v_profile, 1, false)
  on conflict (room_id, profile_id) do update set slot = excluded.slot, is_ready = false;

  return v_room;
end;
$$;

create or replace function rz_join_room(p_room_id uuid, p_team text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile uuid;
  v_room public.match_rooms%rowtype;
  v_half int;
  v_start int;
  v_end int;
  v_slot int;
  v_count int;
begin
  v_profile := rz_current_profile_id();

  select * into v_room from public.match_rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if v_room.status not in ('waiting', 'full') then raise exception 'Room is not joinable'; end if;
  if p_team not in ('A', 'B') then raise exception 'Invalid team'; end if;

  v_half := v_room.max_players / 2;
  v_start := case when p_team = 'A' then 1 else v_half + 1 end;
  v_end := case when p_team = 'A' then v_half else v_room.max_players end;

  select s into v_slot
  from generate_series(v_start, v_end) s
  where not exists (
    select 1 from public.match_room_players p
    where p.room_id = p_room_id and p.slot = s and p.profile_id <> v_profile
  )
  order by s
  limit 1;

  if v_slot is null then raise exception 'Team is full'; end if;

  insert into public.match_room_players (room_id, profile_id, slot, is_ready)
  values (p_room_id, v_profile, v_slot, false)
  on conflict (room_id, profile_id)
  do update set slot = excluded.slot, is_ready = false;

  select count(*) into v_count from public.match_room_players where room_id = p_room_id;
  update public.match_rooms
  set status = case when v_count >= v_room.max_players then 'full' else 'waiting' end,
      updated_at = now()
  where id = p_room_id;
end;
$$;

create or replace function rz_toggle_ready(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile uuid;
  v_max int;
  v_count int;
  v_ready int;
begin
  v_profile := rz_current_profile_id();

  update public.match_room_players
  set is_ready = not is_ready
  where room_id = p_room_id and profile_id = v_profile;

  if not found then raise exception 'Join room first'; end if;

  select max_players into v_max from public.match_rooms where id = p_room_id;
  select count(*), count(*) filter (where is_ready)
  into v_count, v_ready
  from public.match_room_players
  where room_id = p_room_id;

  update public.match_rooms
  set status = case when v_count >= v_max and v_ready = v_count then 'live'
                    when v_count >= v_max then 'full'
                    else 'waiting' end,
      updated_at = now()
  where id = p_room_id;
end;
$$;

create or replace function rz_leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile uuid;
  v_host uuid;
  v_count int;
begin
  v_profile := rz_current_profile_id();
  select host_id into v_host from public.match_rooms where id = p_room_id;
  if not found then return; end if;

  -- If host leaves, remove the whole room.
  if v_host = v_profile then
    delete from public.match_rooms where id = p_room_id;
    return;
  end if;

  delete from public.match_room_players where room_id = p_room_id and profile_id = v_profile;
  select count(*) into v_count from public.match_room_players where room_id = p_room_id;

  if v_count = 0 then
    delete from public.match_rooms where id = p_room_id;
  else
    update public.match_rooms set status = 'waiting', updated_at = now() where id = p_room_id and status in ('full','live');
  end if;
end;
$$;

create or replace function rz_delete_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile uuid;
begin
  v_profile := rz_current_profile_id();
  delete from public.match_rooms where id = p_room_id and host_id = v_profile;
end;
$$;



create or replace function rz_submit_room_result(p_room_id uuid, p_winner_team text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile uuid;
  v_room public.match_rooms%rowtype;
  v_half int;
begin
  v_profile := rz_current_profile_id();

  select * into v_room from public.match_rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if v_room.host_id <> v_profile then raise exception 'Only host can submit result'; end if;
  if v_room.status not in ('live', 'full') then raise exception 'Room must be live or full'; end if;
  if p_winner_team not in ('A', 'B') then raise exception 'Invalid winner team'; end if;

  v_half := v_room.max_players / 2;

  -- Winner players: +10 points and +1 win.
  update public.profiles pr
  set points = coalesce(points, 0) + 10,
      wins = coalesce(wins, 0) + 1,
      updated_at = now()
  where pr.id in (
    select profile_id from public.match_room_players p
    where p.room_id = p_room_id
      and ((p_winner_team = 'A' and p.slot <= v_half) or (p_winner_team = 'B' and p.slot > v_half))
  );

  -- Loser players: -10 points and +1 loss.
  update public.profiles pr
  set points = coalesce(points, 0) - 10,
      losses = coalesce(losses, 0) + 1,
      updated_at = now()
  where pr.id in (
    select profile_id from public.match_room_players p
    where p.room_id = p_room_id
      and ((p_winner_team = 'A' and p.slot > v_half) or (p_winner_team = 'B' and p.slot <= v_half))
  );

  -- Team leaderboard: update real teams of players if profile.team_id is set.
  update public.teams t
  set points = coalesce(points, 0) + 10,
      wins = coalesce(wins, 0) + 1,
      updated_at = now()
  where t.id in (
    select distinct pr.team_id
    from public.match_room_players p
    join public.profiles pr on pr.id = p.profile_id
    where p.room_id = p_room_id and pr.team_id is not null
      and ((p_winner_team = 'A' and p.slot <= v_half) or (p_winner_team = 'B' and p.slot > v_half))
  );

  update public.teams t
  set points = coalesce(points, 0) - 10,
      losses = coalesce(losses, 0) + 1,
      updated_at = now()
  where t.id in (
    select distinct pr.team_id
    from public.match_room_players p
    join public.profiles pr on pr.id = p.profile_id
    where p.room_id = p_room_id and pr.team_id is not null
      and ((p_winner_team = 'A' and p.slot > v_half) or (p_winner_team = 'B' and p.slot <= v_half))
  );

  update public.match_rooms
  set status = 'completed', winner_team = p_winner_team, completed_at = now(), updated_at = now()
  where id = p_room_id;
end;
$$;

grant execute on function rz_submit_room_result(uuid, text) to authenticated;

grant execute on function rz_current_profile_id() to authenticated;
grant execute on function rz_create_room(text) to authenticated;
grant execute on function rz_join_room(uuid, text) to authenticated;
grant execute on function rz_toggle_ready(uuid) to authenticated;
grant execute on function rz_leave_room(uuid) to authenticated;
grant execute on function rz_delete_room(uuid) to authenticated;

-- Clean old broken rooms now.
delete from public.match_rooms r
where r.status in ('waiting', 'full', 'cancelled')
  and not exists (select 1 from public.match_room_players p where p.room_id = r.id);

-- Final match flow: captain-only Start Match + Result + Draw + automatic points.
-- Safe to run multiple times.

alter table public.profiles add column if not exists points int not null default 0;
alter table public.teams add column if not exists points int not null default 0;
alter table public.teams add column if not exists wins int not null default 0;
alter table public.teams add column if not exists losses int not null default 0;
alter table public.teams add column if not exists draws int not null default 0;
alter table public.match_rooms add column if not exists winner_team text check (winner_team in ('A', 'B'));
alter table public.match_rooms add column if not exists completed_at timestamptz;

-- Ready should make the room FULL when everyone is ready, not LIVE automatically.
-- Only the captain/host can start the match.
create or replace function public.rz_toggle_ready(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile uuid;
  v_max int;
  v_count int;
  v_ready int;
begin
  v_profile := rz_current_profile_id();

  update public.match_room_players
  set is_ready = not is_ready
  where room_id = p_room_id and profile_id = v_profile;

  if not found then raise exception 'Join room first'; end if;

  select max_players into v_max from public.match_rooms where id = p_room_id;
  select count(*), count(*) filter (where is_ready)
  into v_count, v_ready
  from public.match_room_players
  where room_id = p_room_id;

  update public.match_rooms
  set status = case when v_count >= v_max and v_ready = v_count then 'full'
                    else 'waiting' end,
      updated_at = now()
  where id = p_room_id and status in ('waiting','full');
end;
$$;

create or replace function public.rz_start_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile uuid;
  v_room public.match_rooms%rowtype;
  v_count int;
  v_ready int;
  v_team_a int;
  v_team_b int;
  v_half int;
  v_min_per_team int;
begin
  v_profile := rz_current_profile_id();

  select * into v_room from public.match_rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if v_room.host_id <> v_profile then raise exception 'Only host/captain can start match'; end if;
  if v_room.status not in ('waiting','full') then raise exception 'Room cannot be started'; end if;

  v_half := v_room.max_players / 2;
  v_min_per_team := case when v_room.mode = '5v5' then 3 else v_half end;

  select
    count(*),
    count(*) filter (where is_ready),
    count(*) filter (where slot <= v_half),
    count(*) filter (where slot > v_half)
  into v_count, v_ready, v_team_a, v_team_b
  from public.match_room_players
  where room_id = p_room_id;

  if v_team_a < v_min_per_team or v_team_b < v_min_per_team then
    raise exception 'Not enough players. Minimum is %v%', v_min_per_team, v_min_per_team;
  end if;
  if v_ready <> v_count then raise exception 'All players must be ready'; end if;

  update public.match_rooms
  set status = 'live', updated_at = now()
  where id = p_room_id;
end;
$$;

create or replace function public.rz_submit_room_result(p_room_id uuid, p_winner_team text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile uuid;
  v_room public.match_rooms%rowtype;
  v_half int;
begin
  v_profile := rz_current_profile_id();

  select * into v_room from public.match_rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if v_room.host_id <> v_profile then raise exception 'Only host/captain can submit result'; end if;
  if v_room.status <> 'live' then raise exception 'Match must be live'; end if;
  if p_winner_team not in ('A', 'B') then raise exception 'Invalid winner team'; end if;

  v_half := v_room.max_players / 2;

  update public.profiles pr
  set points = coalesce(points, 0) + 10,
      wins = coalesce(wins, 0) + 1,
      updated_at = now()
  where pr.id in (
    select profile_id from public.match_room_players p
    where p.room_id = p_room_id
      and ((p_winner_team = 'A' and p.slot <= v_half) or (p_winner_team = 'B' and p.slot > v_half))
  );

  update public.profiles pr
  set points = coalesce(points, 0) - 10,
      losses = coalesce(losses, 0) + 1,
      updated_at = now()
  where pr.id in (
    select profile_id from public.match_room_players p
    where p.room_id = p_room_id
      and ((p_winner_team = 'A' and p.slot > v_half) or (p_winner_team = 'B' and p.slot <= v_half))
  );

  update public.teams t
  set points = coalesce(points, 0) + 10,
      wins = coalesce(wins, 0) + 1,
      updated_at = now()
  where t.id in (
    select distinct pr.team_id
    from public.match_room_players p
    join public.profiles pr on pr.id = p.profile_id
    where p.room_id = p_room_id and pr.team_id is not null
      and ((p_winner_team = 'A' and p.slot <= v_half) or (p_winner_team = 'B' and p.slot > v_half))
  );

  update public.teams t
  set points = coalesce(points, 0) - 10,
      losses = coalesce(losses, 0) + 1,
      updated_at = now()
  where t.id in (
    select distinct pr.team_id
    from public.match_room_players p
    join public.profiles pr on pr.id = p.profile_id
    where p.room_id = p_room_id and pr.team_id is not null
      and ((p_winner_team = 'A' and p.slot > v_half) or (p_winner_team = 'B' and p.slot <= v_half))
  );

  update public.match_rooms
  set status = 'completed', winner_team = p_winner_team, completed_at = now(), updated_at = now()
  where id = p_room_id;
end;
$$;

create or replace function public.rz_submit_room_draw(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile uuid;
  v_room public.match_rooms%rowtype;
begin
  v_profile := rz_current_profile_id();

  select * into v_room from public.match_rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if v_room.host_id <> v_profile then raise exception 'Only host/captain can submit result'; end if;
  if v_room.status <> 'live' then raise exception 'Match must be live'; end if;

  -- Draw = 0 points, but +1 draw count.
  update public.profiles pr
  set draws = coalesce(draws, 0) + 1,
      updated_at = now()
  where pr.id in (
    select profile_id from public.match_room_players p where p.room_id = p_room_id
  );

  update public.teams t
  set draws = coalesce(draws, 0) + 1,
      updated_at = now()
  where t.id in (
    select distinct pr.team_id
    from public.match_room_players p
    join public.profiles pr on pr.id = p.profile_id
    where p.room_id = p_room_id and pr.team_id is not null
  );

  update public.match_rooms
  set status = 'completed', winner_team = null, completed_at = now(), updated_at = now()
  where id = p_room_id;
end;
$$;

grant execute on function public.rz_start_room(uuid) to authenticated;
grant execute on function public.rz_submit_room_result(uuid, text) to authenticated;
grant execute on function public.rz_submit_room_draw(uuid) to authenticated;
