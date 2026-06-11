import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseAvailable = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseAvailable
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : createClient('https://placeholder.supabase.co', 'placeholder-key');

export type Profile = {
  id: string;
  username: string;
  discord_username: string | null;
  standoff2_id: string | null;
  avatar_url: string | null;
  role: 'player' | 'captain' | 'admin';
  team_id: string | null;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
  updated_at: string;
};

export type Team = {
  id: string;
  name: string;
  tag: string;
  logo_url: string | null;
  banner_url: string | null;
  captain_id: string;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
  updated_at: string;
  members?: Profile[];
};

export type Tournament = {
  id: string;
  name: string;
  description: string | null;
  status: 'upcoming' | 'live' | 'completed' | 'cancelled';
  format: 'bo1' | 'bo3' | 'bo5';
  max_teams: number;
  prize_pool: string | null;
  start_date: string | null;
  created_at: string;
  participant_count?: number;
};

export type Match = {
  id: string;
  tournament_id: string | null;
  team1_id: string;
  team2_id: string;
  status: 'pending' | 'live' | 'completed' | 'disputed' | 'cancelled';
  team1_score: number;
  team2_score: number;
  winner_id: string | null;
  submitted_by: string | null;
  confirmed_by: string | null;
  disputed_by: string | null;
  dispute_reason: string | null;
  created_at: string;
  completed_at: string | null;
  team1?: Team;
  team2?: Team;
};


export type MatchRoomPlayer = {
  id: string;
  room_id: string;
  profile_id: string;
  slot: number;
  joined_at: string;
  profile?: Profile;
};

export type MatchRoom = {
  id: string;
  mode: '2v2' | '5v5';
  host_id: string;
  status: 'waiting' | 'full' | 'live' | 'completed' | 'cancelled';
  max_players: number;
  created_at: string;
  updated_at: string;
  host?: Profile;
  players?: MatchRoomPlayer[];
};

export type Report = {
  id: string;
  reporter_id: string;
  target_type: 'user' | 'team' | 'match';
  target_id: string;
  reason: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
  resolved_at: string | null;
  reporter?: Profile;
};
