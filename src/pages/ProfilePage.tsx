import { useState, useEffect } from 'react';
import { User, Upload, Save, Gamepad2, Trophy, Shield, Crown, Users } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase, isSupabaseAvailable, type Team } from '../lib/supabase';

export function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [discordUsername, setDiscordUsername] = useState('');
  const [standoff2Id, setStandoff2Id] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [myTeam, setMyTeam] = useState<Team | null>(null);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setDiscordUsername(profile.discord_username ?? '');
      setStandoff2Id(profile.standoff2_id ?? '');
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.team_id && isSupabaseAvailable) {
      (async () => {
        try {
          const { data } = await supabase.from('teams').select('*').eq('id', profile.team_id).single();
          setMyTeam(data);
        } catch { setMyTeam(null); }
      })();
    } else {
      setMyTeam(null);
    }
  }, [profile?.team_id]);

  if (!profile) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center min-h-[50vh] text-center">
        <User className="w-16 h-16 text-rz-text-muted mb-4" />
        <h2 className="text-xl font-bold mb-2">Sign In Required</h2>
        <p className="text-rz-text-secondary">You need to be signed in to view your profile</p>
      </div>
    );
  }

  const total = profile.wins + profile.losses + profile.draws;
  const winRate = total > 0 ? Math.round((profile.wins / total) * 100) : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        username: username.trim(),
        discord_username: discordUsername.trim() || null,
        standoff2_id: standoff2Id.trim() || null,
      }).eq('id', profile.id);
      if (!error) {
        await refreshProfile();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split('.').pop();
      const path = `avatars/${profile.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (uploadError) return;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      if (data.publicUrl) {
        const url = `${data.publicUrl}?t=${Date.now()}`;
        await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id);
        await refreshProfile();
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="animate-fade-in space-y-6 max-w-2xl mx-auto">
      {/* Profile Header */}
      <div className="glass rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-48 h-48 bg-rz-accent rounded-full blur-[80px]" />
        </div>
        <div className="relative flex flex-col md:flex-row items-center gap-6">
          <div className="relative group">
            <div className="w-24 h-24 rounded-2xl bg-rz-card border-2 border-rz-border flex items-center justify-center overflow-hidden">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-rz-accent">{profile.username.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <Upload className="w-5 h-5 text-white" />
              <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </label>
          </div>
          <div className="text-center md:text-left">
            <h1 className="text-2xl font-bold">{profile.username}</h1>
            <div className="flex items-center gap-2 mt-1 justify-center md:justify-start">
              <span className={profile.role === 'admin' ? 'badge-error' : profile.role === 'captain' ? 'badge-warning' : 'badge-info'}>
                {profile.role === 'captain' && <Crown className="w-3 h-3" />}
                {profile.role === 'admin' && <Shield className="w-3 h-3" />}
                {profile.role.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {[
          { label: 'Wins', value: profile.wins, icon: Trophy, color: 'text-rz-success' },
          { label: 'Losses', value: profile.losses, icon: Gamepad2, color: 'text-rz-error' },
          { label: 'Draws', value: profile.draws, icon: Shield, color: 'text-rz-text-secondary' },
          { label: 'Win Rate', value: `${winRate}%`, icon: Trophy, color: 'text-rz-accent' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card text-center !p-3 md:!p-4">
            <Icon className={`w-4 h-4 mx-auto mb-1.5 ${color}`} />
            <p className="text-lg md:text-xl font-bold">{value}</p>
            <p className="text-[10px] text-rz-text-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Team Info */}
      {myTeam && (
        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-rz-info" /> My Team
          </h2>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-rz-card border border-rz-border flex items-center justify-center overflow-hidden shrink-0">
              {myTeam.logo_url ? <img src={myTeam.logo_url} alt="" className="w-full h-full object-cover" /> : <span className="text-sm font-bold text-rz-accent">{myTeam.tag}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{myTeam.name}</p>
              <p className="text-xs text-rz-text-secondary">[{myTeam.tag}]</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold">{myTeam.wins}W / {myTeam.losses}L / {myTeam.draws}D</p>
            </div>
          </div>
        </div>
      )}

      {/* Edit Form */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-bold mb-5">Edit Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-rz-text-secondary mb-1.5 block">Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="input-field w-full" />
          </div>
          <div>
            <label className="text-sm text-rz-text-secondary mb-1.5 block">Discord Username</label>
            <input type="text" placeholder="e.g. player#1234" value={discordUsername} onChange={e => setDiscordUsername(e.target.value)} className="input-field w-full" />
          </div>
          <div>
            <label className="text-sm text-rz-text-secondary mb-1.5 block">Standoff 2 ID</label>
            <input type="text" placeholder="Your SO2 player ID" value={standoff2Id} onChange={e => setStandoff2Id(e.target.value)} className="input-field w-full" />
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
