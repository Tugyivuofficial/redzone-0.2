-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    'player'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update team stats when a match is completed
CREATE OR REPLACE FUNCTION public.update_team_stats_on_match()
RETURNS trigger AS $$
DECLARE
  w_id uuid;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    w_id := NEW.winner_id;
    -- Increment wins for winner, losses for loser
    IF w_id IS NOT NULL THEN
      UPDATE teams SET wins = wins + 1, updated_at = now() WHERE id = w_id;
      UPDATE teams SET losses = losses + 1, updated_at = now() WHERE id IN (NEW.team1_id, NEW.team2_id) AND id != w_id;
      -- Update player stats for members of winning team
      UPDATE profiles SET wins = wins + 1, updated_at = now() WHERE team_id = w_id;
      -- Update player stats for members of losing team
      UPDATE profiles SET losses = losses + 1, updated_at = now() WHERE team_id IN (NEW.team1_id, NEW.team2_id) AND team_id != w_id;
    END IF;
    -- If draw (winner_id is null and scores equal)
    IF w_id IS NULL AND NEW.team1_score = NEW.team2_score THEN
      UPDATE teams SET draws = draws + 1, updated_at = now() WHERE id IN (NEW.team1_id, NEW.team2_id);
      UPDATE profiles SET draws = draws + 1, updated_at = now() WHERE team_id IN (NEW.team1_id, NEW.team2_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_match_completed ON matches;
CREATE TRIGGER on_match_completed
  AFTER UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION public.update_team_stats_on_match();

-- Storage policy for avatars bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatar_upload_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "avatar_read_public" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "avatar_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[2] = auth.uid()::text);
