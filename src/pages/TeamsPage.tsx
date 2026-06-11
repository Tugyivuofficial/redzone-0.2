import { useEffect, useState } from 'react';
import { Users, Plus, Search, Crown, X, Swords, UserPlus, LogOut } from 'lucide-react';
import { supabase, isSupabaseAvailable, type Team, type Profile } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export function TeamsPage() {
  const { profile, refreshProfile } = useAuth();
  const [teams, setTeams] = useState<(Team & { member_count: number })[]>([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTag, setNewTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<(Team & { members: Profile[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseAvailable) return;
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    try {
      const { data } = await supabase.from('teams').select('*').order('wins', { ascending: false });
      if (data) {
        const withCounts = await Promise.all(data.map(async t => {
          const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('team_id', t.id);
          return { ...t, member_count: count ?? 0 };
        }));
        setTeams(withCounts);
      }
    } catch { /* use default empty */ }
  };

  const createTeam = async () => {
    if (!profile || !newName.trim() || !newTag.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data: team, error: insertError } = await supabase.from('teams').insert({
        name: newName.trim(),
        tag: newTag.trim().toUpperCase(),
        captain_id: profile.id,
      }).select().single();
      if (insertError) {
        setError(insertError.message);
        setLoading(false);
        return;
      }
      if (team) {
        await supabase.from('profiles').update({ team_id: team.id, role: 'captain' }).eq('id', profile.id);
        await refreshProfile();
      }
      setShowCreate(false);
      setNewName('');
      setNewTag('');
      setLoading(false);
      fetchTeams();
    } catch { setError('Network error'); setLoading(false); }
  };

  const joinTeam = async (teamId: string) => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.from('profiles').update({ team_id: teamId }).eq('id', profile.id);
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
      await refreshProfile();
      setLoading(false);
      fetchTeams();
      if (selectedTeam) {
        const { data: members } = await supabase.from('profiles').select('*').eq('team_id', selectedTeam.id);
        setSelectedTeam({ ...selectedTeam, members: members ?? [] });
      }
    } catch { setError('Network error'); setLoading(false); }
  };

  const leaveTeam = async () => {
    if (!profile || !profile.team_id) return;
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.from('profiles').update({
        team_id: null,
        role: 'player',
      }).eq('id', profile.id);
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
      await refreshProfile();
      setSelectedTeam(null);
      setLoading(false);
      fetchTeams();
    } catch { setError('Network error'); setLoading(false); }
  };

  const viewTeam = async (team: Team) => {
    try {
      const { data: members } = await supabase.from('profiles').select('*').eq('team_id', team.id);
      setSelectedTeam({ ...team, members: members ?? [] });
    } catch { setSelectedTeam({ ...team, members: [] }); }
  };

  const filtered = teams.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.tag.toLowerCase().includes(search.toLowerCase())
  );

  const isMemberOfSelectedTeam = selectedTeam && profile?.team_id === selectedTeam.id;
  const isCaptainOfSelectedTeam = selectedTeam && profile?.id === selectedTeam.captain_id;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-rz-info" /> Teams
          </h1>
          <p className="text-sm text-rz-text-secondary mt-1">Browse and manage teams</p>
        </div>
        {profile && !profile.team_id && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Create Team
          </button>
        )}
      </div>

      {error && (
        <div className="bg-rz-error/10 border border-rz-error/20 rounded-lg px-4 py-2.5 text-sm text-rz-error">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rz-text-muted" />
        <input type="text" placeholder="Search teams..." value={search} onChange={e => setSearch(e.target.value)} className="input-field w-full pl-10" />
      </div>

      {/* Create Team Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md glass-strong rounded-2xl p-6 animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Create Team</h2>
              <button onClick={() => setShowCreate(false)} className="text-rz-text-muted hover:text-rz-text"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-rz-text-secondary mb-1.5 block">Team Name</label>
                <input type="text" placeholder="e.g. Shadow Strikers" value={newName} onChange={e => setNewName(e.target.value)} className="input-field w-full" />
              </div>
              <div>
                <label className="text-sm text-rz-text-secondary mb-1.5 block">Team Tag (2-4 chars)</label>
                <input type="text" placeholder="e.g. SSK" value={newTag} onChange={e => setNewTag(e.target.value)} maxLength={4} className="input-field w-full uppercase" />
              </div>
              <button onClick={createTeam} disabled={loading || !newName.trim() || !newTag.trim()} className="btn-primary w-full disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Detail Modal */}
      {selectedTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedTeam(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg glass-strong rounded-2xl p-6 animate-fade-up max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">{selectedTeam.name}</h2>
              <button onClick={() => setSelectedTeam(null)} className="text-rz-text-muted hover:text-rz-text"><X className="w-5 h-5" /></button>
            </div>
            {selectedTeam.banner_url && (
              <img src={selectedTeam.banner_url} alt="" className="w-full h-32 object-cover rounded-xl mb-4" />
            )}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="stat-card text-center !p-3">
                <p className="text-lg font-bold text-rz-success">{selectedTeam.wins}</p>
                <p className="text-[10px] text-rz-text-muted">Wins</p>
              </div>
              <div className="stat-card text-center !p-3">
                <p className="text-lg font-bold text-rz-error">{selectedTeam.losses}</p>
                <p className="text-[10px] text-rz-text-muted">Losses</p>
              </div>
              <div className="stat-card text-center !p-3">
                <p className="text-lg font-bold text-rz-text-secondary">{selectedTeam.draws}</p>
                <p className="text-[10px] text-rz-text-muted">Draws</p>
              </div>
            </div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-rz-text-secondary" /> Members ({selectedTeam.members.length})
            </h3>
            <div className="space-y-2 mb-4">
              {selectedTeam.members.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg bg-rz-surface">
                  <div className="w-8 h-8 rounded-full bg-rz-card border border-rz-border flex items-center justify-center overflow-hidden">
                    {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-rz-accent">{m.username.charAt(0).toUpperCase()}</span>}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.username}</p>
                    <p className="text-xs text-rz-text-muted">{m.wins}W/{m.losses}L</p>
                  </div>
                  {m.id === selectedTeam.captain_id && (
                    <span className="badge-warning"><Crown className="w-3 h-3" /> Captain</span>
                  )}
                </div>
              ))}
            </div>
            {profile && !isMemberOfSelectedTeam && !profile.team_id && (
              <button onClick={() => joinTeam(selectedTeam.id)} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                <UserPlus className="w-4 h-4" /> Join Team
              </button>
            )}
            {isMemberOfSelectedTeam && !isCaptainOfSelectedTeam && (
              <button onClick={leaveTeam} disabled={loading} className="btn-secondary w-full flex items-center justify-center gap-2 text-rz-error border-rz-error/30 disabled:opacity-50">
                <LogOut className="w-4 h-4" /> Leave Team
              </button>
            )}
            {isCaptainOfSelectedTeam && (
              <div className="text-center text-xs text-rz-text-muted">
                You are the captain of this team
              </div>
            )}
          </div>
        </div>
      )}

      {/* Teams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center col-span-full">
            <Users className="w-10 h-10 text-rz-text-muted mx-auto mb-3" />
            <p className="text-rz-text-secondary">{search ? 'No teams found' : 'No teams created yet'}</p>
          </div>
        ) : (
          filtered.map(team => {
            const total = team.wins + team.losses + team.draws;
            const winRate = total > 0 ? Math.round((team.wins / total) * 100) : 0;
            const isMyTeam = profile?.team_id === team.id;
            return (
              <button key={team.id} onClick={() => viewTeam(team)} className="glass rounded-xl p-5 card-hover text-left w-full">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-14 h-14 rounded-xl bg-rz-card border border-rz-border flex items-center justify-center overflow-hidden shrink-0">
                    {team.logo_url ? <img src={team.logo_url} alt={team.name} className="w-full h-full object-cover" /> : <span className="text-sm font-bold text-rz-accent">{team.tag}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate">{team.name} {isMyTeam && <span className="text-rz-accent text-xs">(My Team)</span>}</h3>
                    <p className="text-xs text-rz-text-secondary">[{team.tag}]</p>
                  </div>
                  <span className="text-xs text-rz-text-muted">{team.member_count} members</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1 text-rz-success"><Swords className="w-3 h-3" /> {team.wins}W</span>
                  <span className="flex items-center gap-1 text-rz-error"><Swords className="w-3 h-3" /> {team.losses}L</span>
                  <span className="ml-auto font-bold text-rz-accent">{winRate}% WR</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
