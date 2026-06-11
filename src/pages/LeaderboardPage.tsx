import { useEffect, useState } from 'react';
import { Trophy, Search, Medal } from 'lucide-react';
import { supabase, isSupabaseAvailable, type Team } from '../lib/supabase';

export function LeaderboardPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseAvailable) { setLoading(false); return; }
    (async () => {
      try {
        const { data } = await supabase.from('teams').select('*').order('wins', { ascending: false });
        setTeams(data ?? []);
      } catch { /* use default */ }
      setLoading(false);
    })();
  }, []);

  const filtered = teams.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.tag.toLowerCase().includes(search.toLowerCase())
  );

  const getRankStyle = (i: number) => {
    if (i === 0) return 'bg-rz-warning/15 border-rz-warning/30 text-rz-warning';
    if (i === 1) return 'bg-rz-text-secondary/10 border-rz-text-secondary/20 text-rz-text-secondary';
    if (i === 2) return 'bg-rz-accent/15 border-rz-accent/30 text-rz-accent';
    return 'bg-rz-card border-rz-border text-rz-text-muted';
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="w-6 h-6 text-rz-warning" /> Leaderboard
        </h1>
        <p className="text-sm text-rz-text-secondary mt-1">Team rankings based on performance</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rz-text-muted" />
        <input
          type="text"
          placeholder="Search teams..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field w-full pl-10"
        />
      </div>

      {loading ? (
        <div className="glass rounded-xl p-8 text-center">
          <div className="w-6 h-6 border-2 border-rz-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-rz-text-secondary mt-3">Loading rankings...</p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {filtered.length >= 3 && !search && (
            <div className="grid grid-cols-3 gap-3">
              {[1, 0, 2].map((rankIdx) => {
                const team = filtered[rankIdx];
                if (!team) return null;
                const total = team.wins + team.losses + team.draws;
                const winRate = total > 0 ? Math.round((team.wins / total) * 100) : 0;
                const rank = rankIdx + 1;
                return (
                  <div key={team.id} className={`rounded-2xl p-4 border text-center card-hover ${getRankStyle(rankIdx)} ${rank === 1 ? 'md:-mt-4' : ''}`}>
                    <div className={`w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-lg font-bold border ${getRankStyle(rankIdx)}`}>
                      {rank}
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-rz-card border border-rz-border mx-auto mb-2 flex items-center justify-center overflow-hidden">
                      {team.logo_url ? <img src={team.logo_url} alt={team.name} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-rz-accent">{team.tag}</span>}
                    </div>
                    <p className="font-bold text-sm truncate">{team.name}</p>
                    <p className="text-xs opacity-70 mt-1">{winRate}% WR</p>
                    <p className="text-xs opacity-50">{team.wins}W/{team.losses}L</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full rankings */}
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="glass rounded-xl p-8 text-center">
                <Medal className="w-10 h-10 text-rz-text-muted mx-auto mb-3" />
                <p className="text-rz-text-secondary">{search ? 'No teams found' : 'No teams ranked yet'}</p>
              </div>
            ) : (
              filtered.map((team, i) => {
                const total = team.wins + team.losses + team.draws;
                const winRate = total > 0 ? Math.round((team.wins / total) * 100) : 0;
                return (
                  <div key={team.id} className="glass rounded-xl p-4 card-hover flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border ${getRankStyle(i)}`}>
                      {i + 1}
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-rz-card border border-rz-border flex items-center justify-center overflow-hidden shrink-0">
                      {team.logo_url ? <img src={team.logo_url} alt={team.name} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-rz-accent">{team.tag}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{team.name}</p>
                      <p className="text-xs text-rz-text-secondary">{team.wins}W / {team.losses}L / {team.draws}D</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-rz-accent">{winRate}%</p>
                      <p className="text-[10px] text-rz-text-muted">Win Rate</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
