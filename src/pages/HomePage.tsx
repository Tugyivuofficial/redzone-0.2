import { useEffect, useState } from 'react';
import { Gamepad2, Trophy, Users, Zap, ChevronRight, Flame, Shield, Swords, ExternalLink } from 'lucide-react';
import { supabase, isSupabaseAvailable, type Team, type Tournament, type Match } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { PageId } from '../App';

interface HomePageProps {
  onNavigate: (page: PageId) => void;
  onOpenAuth: (mode: 'signin' | 'signup') => void;
}

export function HomePage({ onNavigate, onOpenAuth }: HomePageProps) {
  const { profile } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [topTeams, setTopTeams] = useState<Team[]>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState({ matches: 0, teams: 0, liveTournaments: 0 });

  useEffect(() => {
    if (!isSupabaseAvailable) return;
    const fetchData = async () => {
      try {
        const [tournRes, teamsRes, matchesRes, matchCount, teamCount, liveTourn] = await Promise.all([
          supabase.from('tournaments').select('*').in('status', ['upcoming', 'live']).order('created_at', { ascending: false }).limit(4),
          supabase.from('teams').select('*').order('wins', { ascending: false }).limit(5),
          supabase.from('matches').select('*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*)').in('status', ['live', 'completed']).order('created_at', { ascending: false }).limit(5),
          supabase.from('matches').select('id', { count: 'exact', head: true }),
          supabase.from('teams').select('id', { count: 'exact', head: true }),
          supabase.from('tournaments').select('id', { count: 'exact', head: true }).eq('status', 'live'),
        ]);
        setTournaments(tournRes.data ?? []);
        setTopTeams(teamsRes.data ?? []);
        setRecentMatches(matchesRes.data ?? []);
        setStats({
          matches: matchCount.count ?? 0,
          teams: teamCount.count ?? 0,
          liveTournaments: liveTourn.count ?? 0,
        });
      } catch { /* data stays as defaults */ }
    };
    fetchData();
  }, []);

  const handleCreateTeam = () => {
    if (!profile) {
      onOpenAuth('signup');
    } else {
      onNavigate('teams');
    }
  };

  return (
    <div className="animate-fade-in space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rz-surface via-rz-bg to-rz-surface border border-rz-border">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-rz-accent rounded-full blur-[128px]" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-rz-accent rounded-full blur-[96px]" />
        </div>
        <div className="relative p-8 md:p-12 lg:p-16">
          <div className="flex items-center gap-2 mb-4">
            <span className="badge-live"><span className="w-1.5 h-1.5 bg-rz-accent rounded-full animate-pulse" /> LIVE ARENA</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4">
            <span className="text-rz-text">REDZONE</span>{' '}
            <span className="text-rz-accent">ARENA</span>
          </h1>
          <p className="text-lg md:text-xl text-rz-text-secondary max-w-lg mb-8 leading-relaxed">
            The premier competitive platform for Standoff 2. Compete in tournaments, climb the ranks, and prove your team is the best.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://discord.gg/redzone"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex items-center gap-2"
            >
              Join Discord <ExternalLink className="w-4 h-4" />
            </a>
            <button onClick={handleCreateTeam} className="btn-primary flex items-center gap-2">
              <Users className="w-4 h-4" /> Create Team
            </button>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="grid grid-cols-3 gap-3 md:gap-4">
        {[
          { icon: Swords, label: 'Total Matches', value: stats.matches, color: 'text-rz-accent' },
          { icon: Users, label: 'Active Teams', value: stats.teams, color: 'text-rz-info' },
          { icon: Flame, label: 'Live Tournaments', value: stats.liveTournaments, color: 'text-rz-warning' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="stat-card text-center">
            <Icon className={`w-5 h-5 mx-auto mb-2 ${color}`} />
            <p className="text-2xl md:text-3xl font-bold">{value}</p>
            <p className="text-xs text-rz-text-secondary mt-1">{label}</p>
          </div>
        ))}
      </section>

      {/* Active Tournaments */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title flex items-center gap-2 mb-0">
            <Flame className="w-5 h-5 text-rz-accent" /> Active Tournaments
          </h2>
          <button onClick={() => onNavigate('play')} className="text-sm text-rz-accent hover:text-rz-accent-hover flex items-center gap-1 transition-colors">
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tournaments.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center col-span-full">
              <Trophy className="w-10 h-10 text-rz-text-muted mx-auto mb-3" />
              <p className="text-rz-text-secondary">No active tournaments right now</p>
              <p className="text-sm text-rz-text-muted mt-1">Check back soon or create one!</p>
            </div>
          ) : (
            tournaments.map((t) => (
              <div key={t.id} className="glass rounded-xl p-5 card-hover cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-base">{t.name}</h3>
                    {t.prize_pool && <p className="text-sm text-rz-warning mt-0.5">Prize: {t.prize_pool}</p>}
                  </div>
                  <span className={t.status === 'live' ? 'badge-live' : 'badge-info'}>
                    {t.status === 'live' && <span className="w-1.5 h-1.5 bg-rz-accent rounded-full animate-pulse" />}
                    {t.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-rz-text-secondary">
                  <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> {t.format.toUpperCase()}</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t.max_teams} slots</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Top Teams */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title flex items-center gap-2 mb-0">
            <Trophy className="w-5 h-5 text-rz-warning" /> Top Teams
          </h2>
          <button onClick={() => onNavigate('leaderboard')} className="text-sm text-rz-accent hover:text-rz-accent-hover flex items-center gap-1 transition-colors">
            Leaderboard <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2">
          {topTeams.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <Users className="w-10 h-10 text-rz-text-muted mx-auto mb-3" />
              <p className="text-rz-text-secondary">No teams yet</p>
            </div>
          ) : (
            topTeams.map((team, i) => {
              const total = team.wins + team.losses + team.draws;
              const winRate = total > 0 ? Math.round((team.wins / total) * 100) : 0;
              return (
                <div key={team.id} className="glass rounded-xl p-4 card-hover flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
                    ${i === 0 ? 'bg-rz-warning/20 text-rz-warning' : i === 1 ? 'bg-rz-text-secondary/20 text-rz-text-secondary' : i === 2 ? 'bg-rz-accent/20 text-rz-accent' : 'bg-rz-card text-rz-text-muted'}`}>
                    {i + 1}
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-rz-card border border-rz-border flex items-center justify-center overflow-hidden">
                    {team.logo_url ? (
                      <img src={team.logo_url} alt={team.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-rz-accent">{team.tag}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{team.name}</p>
                    <p className="text-xs text-rz-text-secondary">{team.wins}W / {team.losses}L / {team.draws}D</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-rz-accent">{winRate}%</p>
                    <p className="text-[10px] text-rz-text-muted">Win Rate</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Recent Matches */}
      <section>
        <h2 className="section-title flex items-center gap-2">
          <Zap className="w-5 h-5 text-rz-info" /> Recent Matches
        </h2>
        <div className="space-y-2">
          {recentMatches.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <Gamepad2 className="w-10 h-10 text-rz-text-muted mx-auto mb-3" />
              <p className="text-rz-text-secondary">No matches yet</p>
            </div>
          ) : (
            recentMatches.map((m) => (
              <div key={m.id} className="glass rounded-xl p-4 card-hover">
                <div className="flex items-center justify-between mb-2">
                  <span className={m.status === 'live' ? 'badge-live' : m.status === 'disputed' ? 'badge-error' : 'badge-success'}>
                    {m.status === 'live' && <span className="w-1.5 h-1.5 bg-rz-accent rounded-full animate-pulse" />}
                    {m.status.toUpperCase()}
                  </span>
                  <span className="text-xs text-rz-text-muted">
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex-1 text-right">
                    <p className="font-semibold">{m.team1?.name ?? 'Team 1'}</p>
                  </div>
                  <div className="flex items-center gap-2 px-4">
                    <span className={`text-xl font-bold ${m.team1_score > m.team2_score ? 'text-rz-success' : 'text-rz-text'}`}>
                      {m.team1_score}
                    </span>
                    <span className="text-xs text-rz-text-muted">vs</span>
                    <span className={`text-xl font-bold ${m.team2_score > m.team1_score ? 'text-rz-success' : 'text-rz-text'}`}>
                      {m.team2_score}
                    </span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold">{m.team2?.name ?? 'Team 2'}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
