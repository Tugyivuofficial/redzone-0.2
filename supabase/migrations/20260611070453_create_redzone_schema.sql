-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  discord_username TEXT,
  standoff2_id TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'captain', 'admin')),
  team_id UUID,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Teams table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  tag TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  banner_url TEXT,
  captain_id UUID NOT NULL REFERENCES profiles(id),
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add team FK now that teams exists
ALTER TABLE profiles ADD CONSTRAINT profiles_team_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- Tournaments table
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed', 'cancelled')),
  format TEXT NOT NULL DEFAULT 'bo3' CHECK (format IN ('bo1', 'bo3', 'bo5')),
  max_teams INT NOT NULL DEFAULT 16,
  prize_pool TEXT,
  start_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tournament participants
CREATE TABLE tournament_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, team_id)
);

-- Matches table
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  team1_id UUID NOT NULL REFERENCES teams(id),
  team2_id UUID NOT NULL REFERENCES teams(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'completed', 'disputed', 'cancelled')),
  team1_score INT NOT NULL DEFAULT 0,
  team2_score INT NOT NULL DEFAULT 0,
  winner_id UUID REFERENCES teams(id),
  submitted_by UUID REFERENCES profiles(id),
  confirmed_by UUID REFERENCES profiles(id),
  disputed_by UUID REFERENCES profiles(id),
  dispute_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Reports table
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'team', 'match')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Site settings
CREATE TABLE site_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  discord_url TEXT DEFAULT 'https://discord.gg/redzone',
  announcement TEXT,
  maintenance_mode BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO site_settings (discord_url) VALUES ('https://discord.gg/redzone');

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Teams policies
CREATE POLICY "teams_select" ON teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_insert" ON teams FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "teams_update_captain" ON teams FOR UPDATE TO authenticated USING (captain_id = auth.uid());
CREATE POLICY "teams_admin_update" ON teams FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "teams_delete_captain" ON teams FOR DELETE TO authenticated USING (captain_id = auth.uid());

-- Tournaments policies
CREATE POLICY "tournaments_select" ON tournaments FOR SELECT TO authenticated USING (true);
CREATE POLICY "tournaments_admin_insert" ON tournaments FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "tournaments_admin_update" ON tournaments FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Tournament participants policies
CREATE POLICY "tp_select" ON tournament_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "tp_insert" ON tournament_participants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tp_delete_own" ON tournament_participants FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM teams WHERE id = team_id AND captain_id = auth.uid()));

-- Matches policies
CREATE POLICY "matches_select" ON matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "matches_insert" ON matches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "matches_update_participant" ON matches FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM teams t WHERE t.id IN (team1_id, team2_id) AND t.captain_id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "matches_admin_update" ON matches FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Reports policies
CREATE POLICY "reports_select_admin" ON reports FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "reports_insert" ON reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports_admin_update" ON reports FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Site settings policies
CREATE POLICY "settings_select" ON site_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_admin_update" ON site_settings FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Indexes
CREATE INDEX idx_profiles_team ON profiles(team_id);
CREATE INDEX idx_teams_captain ON teams(captain_id);
CREATE INDEX idx_matches_teams ON matches(team1_id, team2_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_tournaments_status ON tournaments(status);
