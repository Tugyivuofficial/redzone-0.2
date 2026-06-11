-- REDZONE ARENA Play page: 2v2 / 5v5 room system
-- Run this once in Supabase SQL Editor.

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
  joined_at timestamptz not null default now(),
  unique(room_id, profile_id),
  unique(room_id, slot)
);

alter table match_rooms enable row level security;
alter table match_room_players enable row level security;

create policy "match_rooms_select" on match_rooms
for select to authenticated using (true);

create policy "match_rooms_insert_own" on match_rooms
for insert to authenticated with check (auth.uid() = host_id);

create policy "match_rooms_update_host_or_player" on match_rooms
for update to authenticated using (
  auth.uid() = host_id
  or exists (
    select 1 from match_room_players
    where match_room_players.room_id = match_rooms.id
    and match_room_players.profile_id = auth.uid()
  )
);

create policy "match_room_players_select" on match_room_players
for select to authenticated using (true);

create policy "match_room_players_insert_own" on match_room_players
for insert to authenticated with check (auth.uid() = profile_id);

create policy "match_room_players_delete_own_or_host" on match_room_players
for delete to authenticated using (
  auth.uid() = profile_id
  or exists (
    select 1 from match_rooms
    where match_rooms.id = match_room_players.room_id
    and match_rooms.host_id = auth.uid()
  )
);

create index if not exists idx_match_rooms_status on match_rooms(status);
create index if not exists idx_match_room_players_room on match_room_players(room_id);
create index if not exists idx_match_room_players_profile on match_room_players(profile_id);


-- Allow players to switch between Team A and Team B by changing their slot.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'match_room_players'
      and policyname = 'match_room_players_update_own_team'
  ) then
    create policy "match_room_players_update_own_team" on match_room_players
    for update to authenticated
    using (auth.uid() = profile_id)
    with check (auth.uid() = profile_id);
  end if;
end $$;


-- Ready system: existing projects may already have match_room_players without this column.
alter table match_room_players
add column if not exists is_ready boolean not null default false;

-- Make sure own player row can be updated for Ready toggle and team switch.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'match_room_players'
      and policyname = 'match_room_players_update_own_ready'
  ) then
    create policy "match_room_players_update_own_ready" on match_room_players
    for update to authenticated
    using (auth.uid() = profile_id)
    with check (auth.uid() = profile_id);
  end if;
end $$;
