import { useEffect, useMemo, useState } from 'react';
import { Trophy, Search, Medal, Users, UserRound } from 'lucide-react';
import { supabase, isSupabaseAvailable, type Team, type Profile } from '../lib/supabase';

type Tab = 'players' | 'teams';

export function LeaderboardPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [tab, setTab] = useState<Tab>('players');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseAvailable) { setLoading(false); return; }
    (async () => {
      try {
        const [teamRes, playerRes] = await Promise.all([
          supabase.from('teams').select('*').order('points', { ascending: false }).order('wins', { ascending: false }),
          supabase.from('profiles').select('*').order('points', { ascending: false }).order('wins', { ascending: false }),
        ]);
        setTeams((teamRes.data ?? []) as Team[]);
        setPlayers((playerRes.data ?? []) as Profile[]);
      } catch { /* use default */ }
      setLoading(false);
    })();
  }, []);

  const filteredTeams = useMemo(() => teams.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.tag.toLowerCase().includes(search.toLowerCase())
  ), [teams, search]);

  const filteredPlayers = useMemo(() => players.filter(p =>
    p.username.toLowerCase().includes(search.toLowerCase()) ||
    (p.discord_username ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.standoff2_id ?? '').toLowerCase().includes(search.toLowerCase())
  ), [players, search]);

  const getRankStyle = (i: number) => {
    if (i === 0) return 'bg-rz-warning/15 border-rz-warning/30 text-rz-warning';
    if (i === 1) return 'bg-rz-text-secondary/10 border-rz-text-secondary/20 text-rz-text-secondary';
    if (i === 2) return 'bg-rz-accent/15 border-rz-accent/30 text-rz-accent';
    return 'bg-rz-card border-rz-border text-rz-text-muted';
  };

  const renderTeamRow = (team: Team, i: number) => {
    const total = team.wins + team.losses + team.draws;
    const winRate = total > 0 ? Math.round((team.wins / total) * 100) : 0;
    return (
      <div key={team.id} className="glass rounded-xl p-4 card-hover flex items-center gap-4">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border ${getRankStyle(i)}`}>{i + 1}</div>
        <div className="w-10 h-10 rounded-lg bg-rz-card border border-rz-border flex items-center justify-center overflow-hidden shrink-0">
          {team.logo_url ? <img src={team.logo_url} alt={team.name} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-rz-accent">{team.tag}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{team.name}</p>
          <p className="text-xs text-rz-text-secondary">{team.wins}W / {team.losses}L / {team.draws}D</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-rz-accent">{team.points ?? 0} pts</p>
          <p className="text-[10px] text-rz-text-muted">{winRate}% WR</p>
        </div>
      </div>
    );
  };

  const renderPlayerRow = (player: Profile, i: number) => {
    const total = player.wins + player.losses + player.draws;
    const winRate = total > 0 ? Math.round((player.wins / total) * 100) : 0;
    return (
      <div key={player.id} className="glass rounded-xl p-4 card-hover flex items-center gap-4">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border ${getRankStyle(i)}`}>{i + 1}</div>
        <div className="w-10 h-10 rounded-lg bg-rz-card border border-rz-border flex items-center justify-center overflow-hidden shrink-0">
          {player.avatar_url ? <img src={player.avatar_url} alt={player.username} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-rz-accent">{player.username.slice(0, 2).toUpperCase()}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{player.username}</p>
          <p className="text-xs text-rz-text-secondary">{player.wins}W / {player.losses}L / {player.draws}D</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-rz-accent">{player.points ?? 0} pts</p>
          <p className="text-[10px] text-rz-text-muted">{winRate}% WR</p>
        </div>
      </div>
    );
  };

  const activeList = tab === 'players' ? filteredPlayers : filteredTeams;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="w-6 h-6 text-rz-warning" /> Leaderboard
        </h1>
        <p className="text-sm text-rz-text-secondary mt-1">Win +10 points, loss -10 points</p>
      </div>

      <div className="grid grid-cols-2 gap-2 bg-rz-card/60 border border-rz-border rounded-xl p-1">
        <button onClick={() => setTab('players')} className={`rounded-lg px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 ${tab === 'players' ? 'bg-rz-accent text-white' : 'text-rz-text-secondary hover:text-rz-text'}`}>
          <UserRound className="w-4 h-4" /> Player Leaderboard
        </button>
        <button onClick={() => setTab('teams')} className={`rounded-lg px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 ${tab === 'teams' ? 'bg-rz-accent text-white' : 'text-rz-text-secondary hover:text-rz-text'}`}>
          <Users className="w-4 h-4" /> Team Leaderboard
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rz-text-muted" />
        <input
          type="text"
          placeholder={tab === 'players' ? 'Search players...' : 'Search teams...'}
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
      ) : activeList.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center">
          <Medal className="w-10 h-10 text-rz-text-muted mx-auto mb-3" />
          <p className="text-rz-text-secondary">{search ? 'No results found' : 'No rankings yet'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tab === 'players'
            ? filteredPlayers.map((player, i) => renderPlayerRow(player, i))
            : filteredTeams.map((team, i) => renderTeamRow(team, i))}
        </div>
      )}
    </div>
  );
}
