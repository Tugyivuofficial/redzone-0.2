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
