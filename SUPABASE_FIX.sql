-- REDZONE ARENA Supabase fix
-- Paste this in Supabase SQL Editor if Create Team/Profile does not work.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "teams_select" ON teams;
DROP POLICY IF EXISTS "teams_insert" ON teams;
DROP POLICY IF EXISTS "teams_update_captain" ON teams;
DROP POLICY IF EXISTS "teams_admin_update" ON teams;
DROP POLICY IF EXISTS "teams_delete_captain" ON teams;
CREATE POLICY "teams_select" ON teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_insert" ON teams FOR INSERT TO authenticated WITH CHECK (captain_id = auth.uid());
CREATE POLICY "teams_update_captain" ON teams FOR UPDATE TO authenticated USING (captain_id = auth.uid()) WITH CHECK (captain_id = auth.uid());
CREATE POLICY "teams_admin_update" ON teams FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "teams_delete_captain" ON teams FOR DELETE TO authenticated USING (captain_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1),
      'player_' || left(NEW.id::text, 6)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    'player'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
