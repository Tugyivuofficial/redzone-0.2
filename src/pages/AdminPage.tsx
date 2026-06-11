import { useEffect, useState } from 'react';
import { Shield, Users, Gamepad2, AlertTriangle, Settings, CheckCircle, X, Plus } from 'lucide-react';
import { supabase, isSupabaseAvailable, type Profile, type Team, type Match, type Report, type Tournament } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

type Tab = 'users' | 'teams' | 'matches' | 'reports' | 'tournaments' | 'settings';

export function AdminPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [discordUrl, setDiscordUrl] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCreateTournament, setShowCreateTournament] = useState(false);
  const [tournName, setTournName] = useState('');
  const [tournFormat, setTournFormat] = useState<'bo1' | 'bo3' | 'bo5'>('bo3');
  const [tournMaxTeams, setTournMaxTeams] = useState(16);
  const [tournPrize, setTournPrize] = useState('');

  useEffect(() => {
    if (profile?.role !== 'admin' || !isSupabaseAvailable) return;
    fetchAll();
  }, [profile]);

  const fetchAll = async () => {
    try {
      const [u, t, m, r, s, tour] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('teams').select('*').order('created_at', { ascending: false }),
        supabase.from('matches').select('*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*)').order('created_at', { ascending: false }),
        supabase.from('reports').select('*, reporter:profiles!reports_reporter_id_fkey(*)').order('created_at', { ascending: false }),
        supabase.from('site_settings').select('*').single(),
        supabase.from('tournaments').select('*').order('created_at', { ascending: false }),
      ]);
      setUsers(u.data ?? []);
      setTeams(t.data ?? []);
      setMatches(m.data ?? []);
      setReports(r.data ?? []);
      setTournaments(tour.data ?? []);
      if (s.data) {
        setDiscordUrl(s.data.discord_url ?? '');
        setAnnouncement(s.data.announcement ?? '');
      }
    } catch { /* use defaults */ }
  };

  const updateRole = async (userId: string, role: string) => {
    try { await supabase.from('profiles').update({ role }).eq('id', userId); } catch { /* ignore */ }
    fetchAll();
  };

  const resolveMatch = async (matchId: string, status: 'completed' | 'cancelled') => {
    try { await supabase.from('matches').update({ status, confirmed_by: profile?.id }).eq('id', matchId); } catch { /* ignore */ }
    fetchAll();
  };

  const resolveReport = async (reportId: string, status: 'resolved' | 'dismissed') => {
    try { await supabase.from('reports').update({ status, resolved_at: new Date().toISOString() }).eq('id', reportId); } catch { /* ignore */ }
    fetchAll();
  };

  const createTournament = async () => {
    if (!tournName.trim()) return;
    setSaving(true);
    try {
      await supabase.from('tournaments').insert({
        name: tournName.trim(),
        format: tournFormat,
        max_teams: tournMaxTeams,
        prize_pool: tournPrize.trim() || null,
        status: 'upcoming',
      });
      setShowCreateTournament(false);
      setTournName('');
      setTournFormat('bo3');
      setTournMaxTeams(16);
      setTournPrize('');
    } catch { /* ignore */ }
    setSaving(false);
    fetchAll();
  };

  const updateTournamentStatus = async (tournId: string, status: Tournament['status']) => {
    try { await supabase.from('tournaments').update({ status }).eq('id', tournId); } catch { /* ignore */ }
    fetchAll();
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await supabase.from('site_settings').update({ discord_url: discordUrl, announcement }).eq('id', 1);
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (profile?.role !== 'admin') {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Shield className="w-16 h-16 text-rz-text-muted mb-4" />
        <h2 className="text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-rz-text-secondary">You need admin privileges to access this panel</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'teams', label: 'Teams', icon: Users },
    { id: 'matches', label: 'Matches', icon: Gamepad2 },
    { id: 'tournaments', label: 'Tournaments', icon: Shield },
    { id: 'reports', label: 'Reports', icon: AlertTriangle },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-rz-accent" /> Admin Panel
        </h1>
        <p className="text-sm text-rz-text-secondary mt-1">Manage the platform</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 glass rounded-xl overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all
              ${tab === id ? 'bg-rz-accent text-white' : 'text-rz-text-secondary hover:text-rz-text hover:bg-rz-card'}`}
          >
            <Icon className="w-4 h-4" /> {label}
            {id === 'reports' && reports.filter(r => r.status === 'open').length > 0 && (
              <span className="w-5 h-5 rounded-full bg-rz-error text-white text-[10px] flex items-center justify-center font-bold">
                {reports.filter(r => r.status === 'open').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="glass rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-rz-card border border-rz-border flex items-center justify-center overflow-hidden shrink-0">
                {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : <span className="text-sm font-bold text-rz-accent">{u.username.charAt(0).toUpperCase()}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{u.username}</p>
                <p className="text-xs text-rz-text-muted">{u.wins}W/{u.losses}L</p>
              </div>
              <select
                value={u.role}
                onChange={e => updateRole(u.id, e.target.value)}
                className="input-field !py-1.5 !px-2 text-xs"
              >
                <option value="player">Player</option>
                <option value="captain">Captain</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          ))}
          {users.length === 0 && <p className="text-center text-rz-text-secondary py-8">No users found</p>}
        </div>
      )}

      {/* Teams Tab */}
      {tab === 'teams' && (
        <div className="space-y-2">
          {teams.map(t => (
            <div key={t.id} className="glass rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-rz-card border border-rz-border flex items-center justify-center overflow-hidden shrink-0">
                {t.logo_url ? <img src={t.logo_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-rz-accent">{t.tag}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{t.name}</p>
                <p className="text-xs text-rz-text-muted">{t.wins}W/{t.losses}L</p>
              </div>
              <span className="badge-info">{t.tag}</span>
            </div>
          ))}
          {teams.length === 0 && <p className="text-center text-rz-text-secondary py-8">No teams found</p>}
        </div>
      )}

      {/* Matches Tab */}
      {tab === 'matches' && (
        <div className="space-y-2">
          {matches.map(m => (
            <div key={m.id} className="glass rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={m.status === 'disputed' ? 'badge-error' : m.status === 'completed' ? 'badge-success' : 'badge-info'}>
                  {m.status.toUpperCase()}
                </span>
                <span className="text-xs text-rz-text-muted">{new Date(m.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-semibold text-sm">{m.team1?.name ?? 'T1'}</span>
                <span className="text-xs text-rz-text-muted font-mono">{m.team1_score} - {m.team2_score}</span>
                <span className="font-semibold text-sm">{m.team2?.name ?? 'T2'}</span>
              </div>
              {m.status === 'disputed' && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-rz-error flex-1">Reason: {m.dispute_reason}</p>
                  <button onClick={() => resolveMatch(m.id, 'completed')} className="text-xs btn-ghost text-rz-success flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Confirm
                  </button>
                  <button onClick={() => resolveMatch(m.id, 'cancelled')} className="text-xs btn-ghost text-rz-error flex items-center gap-1">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
          {matches.length === 0 && <p className="text-center text-rz-text-secondary py-8">No matches found</p>}
        </div>
      )}

      {/* Tournaments Tab */}
      {tab === 'tournaments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">All Tournaments</h2>
            <button onClick={() => setShowCreateTournament(true)} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Create
            </button>
          </div>
          <div className="space-y-2">
            {tournaments.map(t => (
              <div key={t.id} className="glass rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{t.name}</p>
                  <p className="text-xs text-rz-text-muted">{t.format.toUpperCase()} | {t.max_teams} slots | {t.status.toUpperCase()}</p>
                </div>
                <select
                  value={t.status}
                  onChange={e => updateTournamentStatus(t.id, e.target.value as Tournament['status'])}
                  className="input-field !py-1.5 !px-2 text-xs"
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="live">Live</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            ))}
            {tournaments.length === 0 && <p className="text-center text-rz-text-secondary py-8">No tournaments found</p>}
          </div>

          {/* Create Tournament Modal */}
          {showCreateTournament && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateTournament(false)}>
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <div className="relative w-full max-w-md glass-strong rounded-2xl p-6 animate-fade-up" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold">Create Tournament</h2>
                  <button onClick={() => setShowCreateTournament(false)} className="text-rz-text-muted hover:text-rz-text"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-rz-text-secondary mb-1.5 block">Tournament Name</label>
                    <input type="text" placeholder="e.g. Redzone Championship" value={tournName} onChange={e => setTournName(e.target.value)} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="text-sm text-rz-text-secondary mb-1.5 block">Format</label>
                    <select value={tournFormat} onChange={e => setTournFormat(e.target.value as 'bo1' | 'bo3' | 'bo5')} className="input-field w-full">
                      <option value="bo1">Best of 1</option>
                      <option value="bo3">Best of 3</option>
                      <option value="bo5">Best of 5</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-rz-text-secondary mb-1.5 block">Max Teams</label>
                    <input type="number" min={2} max={64} value={tournMaxTeams} onChange={e => setTournMaxTeams(parseInt(e.target.value) || 16)} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="text-sm text-rz-text-secondary mb-1.5 block">Prize Pool (optional)</label>
                    <input type="text" placeholder="e.g. $500" value={tournPrize} onChange={e => setTournPrize(e.target.value)} className="input-field w-full" />
                  </div>
                  <button onClick={createTournament} disabled={saving || !tournName.trim()} className="btn-primary w-full disabled:opacity-50">
                    {saving ? 'Creating...' : 'Create Tournament'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reports Tab */}
      {tab === 'reports' && (
        <div className="space-y-2">
          {reports.map(r => (
            <div key={r.id} className="glass rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={r.status === 'open' ? 'badge-error' : r.status === 'resolved' ? 'badge-success' : 'badge-info'}>
                  {r.status.toUpperCase()}
                </span>
                <span className="text-xs text-rz-text-muted">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm mb-1">{r.reason}</p>
              <p className="text-xs text-rz-text-muted">By: {r.reporter?.username ?? 'Unknown'} | Type: {r.target_type}</p>
              {r.status === 'open' && (
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => resolveReport(r.id, 'resolved')} className="text-xs btn-ghost text-rz-success flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Resolve
                  </button>
                  <button onClick={() => resolveReport(r.id, 'dismissed')} className="text-xs btn-ghost text-rz-text-muted flex items-center gap-1">
                    <X className="w-3 h-3" /> Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
          {reports.length === 0 && <p className="text-center text-rz-text-secondary py-8">No reports found</p>}
        </div>
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <div className="glass rounded-2xl p-6 space-y-4 max-w-lg">
          <div>
            <label className="text-sm text-rz-text-secondary mb-1.5 block">Discord Invite URL</label>
            <input type="text" value={discordUrl} onChange={e => setDiscordUrl(e.target.value)} className="input-field w-full" />
          </div>
          <div>
            <label className="text-sm text-rz-text-secondary mb-1.5 block">Announcement</label>
            <textarea value={announcement} onChange={e => setAnnouncement(e.target.value)} placeholder="Site-wide announcement..." className="input-field w-full h-24 resize-none" />
          </div>
          <button onClick={saveSettings} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            <Settings className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
}
