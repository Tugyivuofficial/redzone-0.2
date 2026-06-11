import { useEffect, useState } from 'react';
import { Gamepad2, Plus, Swords, CheckCircle, AlertTriangle, Clock, Send, X } from 'lucide-react';
import { supabase, isSupabaseAvailable, type Match, type Team } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export function PlayPage() {
  const { profile } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showResult, setShowResult] = useState<string | null>(null);
  const [showDispute, setShowDispute] = useState<string | null>(null);
  const [team1Id, setTeam1Id] = useState('');
  const [team2Id, setTeam2Id] = useState('');
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [disputeReason, setDisputeReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseAvailable) return;
    fetchMatches();
    (async () => {
      try {
        const { data } = await supabase.from('teams').select('*').order('name');
        setTeams(data ?? []);
      } catch { /* use default */ }
    })();
  }, []);

  const fetchMatches = async () => {
    try {
      const { data } = await supabase
        .from('matches')
        .select('*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*)')
        .order('created_at', { ascending: false })
        .limit(20);
      setMatches(data ?? []);
    } catch { /* use default empty */ }
  };

  const createMatch = async () => {
    if (!team1Id || !team2Id || team1Id === team2Id) return;
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.from('matches').insert({
        team1_id: team1Id,
        team2_id: team2Id,
        status: 'pending',
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setShowCreate(false);
      setTeam1Id('');
      setTeam2Id('');
      setLoading(false);
      fetchMatches();
    } catch { setError('Network error'); setLoading(false); }
  };

  const submitResult = async (matchId: string) => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
      if (!match) { setLoading(false); return; }
      const winnerId = score1 > score2 ? match.team1_id : score2 > score1 ? match.team2_id : null;
      const { error } = await supabase.from('matches').update({
        team1_score: score1,
        team2_score: score2,
        status: 'completed',
        winner_id: winnerId,
        submitted_by: profile.id,
      }).eq('id', matchId);
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setShowResult(null);
      setScore1(0);
      setScore2(0);
      setLoading(false);
      fetchMatches();
    } catch { setError('Network error'); setLoading(false); }
  };

  const disputeMatch = async (matchId: string) => {
    if (!profile || !disputeReason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.from('matches').update({
        status: 'disputed',
        disputed_by: profile.id,
        dispute_reason: disputeReason.trim(),
      }).eq('id', matchId);
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setShowDispute(null);
      setDisputeReason('');
      setLoading(false);
      fetchMatches();
    } catch { setError('Network error'); setLoading(false); }
  };

  const isCaptainOfTeamInMatch = (match: Match) => {
    if (!profile) return false;
    const teamIds = [match.team1_id, match.team2_id];
    return teamIds.includes(profile.team_id ?? '') && profile.role === 'captain';
  };

  const liveMatches = matches.filter(m => m.status === 'live' || m.status === 'pending');
  const completedMatches = matches.filter(m => m.status === 'completed' || m.status === 'disputed');

  const MatchCard = ({ match }: { match: Match }) => (
    <div className="glass rounded-xl p-4 card-hover">
      <div className="flex items-center justify-between mb-3">
        <span className={
          match.status === 'live' ? 'badge-live' :
          match.status === 'pending' ? 'badge-info' :
          match.status === 'disputed' ? 'badge-error' : 'badge-success'
        }>
          {(match.status === 'live' || match.status === 'pending') && (
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${match.status === 'live' ? 'bg-rz-accent' : 'bg-rz-info'}`} />
          )}
          {match.status.toUpperCase()}
        </span>
        <span className="text-xs text-rz-text-muted">
          {new Date(match.created_at).toLocaleDateString()}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-1 text-right">
          <p className="font-semibold text-sm">{match.team1?.name ?? 'T1'}</p>
        </div>
        <div className="flex items-center gap-2 px-3">
          <span className={`text-lg font-bold ${match.team1_score > match.team2_score ? 'text-rz-success' : ''}`}>
            {match.team1_score}
          </span>
          <span className="text-[10px] text-rz-text-muted font-mono">VS</span>
          <span className={`text-lg font-bold ${match.team2_score > match.team1_score ? 'text-rz-success' : ''}`}>
            {match.team2_score}
          </span>
        </div>
        <div className="flex-1 text-left">
          <p className="font-semibold text-sm">{match.team2?.name ?? 'T2'}</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mt-3">
        {match.status === 'pending' && isCaptainOfTeamInMatch(match) && (
          <>
            <button
              onClick={() => { setShowResult(match.id); setScore1(0); setScore2(0); }}
              className="text-xs btn-ghost flex items-center gap-1 text-rz-success"
            >
              <Send className="w-3 h-3" /> Submit Result
            </button>
            <button
              onClick={() => setShowDispute(match.id)}
              className="text-xs btn-ghost flex items-center gap-1 text-rz-warning"
            >
              <AlertTriangle className="w-3 h-3" /> Dispute
            </button>
          </>
        )}
        {match.status === 'disputed' && (
          <span className="text-xs text-rz-error flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {match.dispute_reason}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Play</h1>
          <p className="text-sm text-rz-text-secondary mt-1">Create matches and track results</p>
        </div>
        {profile && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Create Match
          </button>
        )}
      </div>

      {error && (
        <div className="bg-rz-error/10 border border-rz-error/20 rounded-lg px-4 py-2.5 text-sm text-rz-error">
          {error}
        </div>
      )}

      {/* Create Match Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md glass-strong rounded-2xl p-6 animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Create Match</h2>
              <button onClick={() => setShowCreate(false)} className="text-rz-text-muted hover:text-rz-text"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-rz-text-secondary mb-1.5 block">Team 1</label>
                <select value={team1Id} onChange={e => setTeam1Id(e.target.value)} className="input-field w-full">
                  <option value="">Select team...</option>
                  {teams.filter(t => t.id !== team2Id).map(t => <option key={t.id} value={t.id}>{t.name} [{t.tag}]</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-rz-text-secondary mb-1.5 block">Team 2</label>
                <select value={team2Id} onChange={e => setTeam2Id(e.target.value)} className="input-field w-full">
                  <option value="">Select team...</option>
                  {teams.filter(t => t.id !== team1Id).map(t => <option key={t.id} value={t.id}>{t.name} [{t.tag}]</option>)}
                </select>
              </div>
              <button onClick={createMatch} disabled={loading || !team1Id || !team2Id} className="btn-primary w-full disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Match'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Result Modal */}
      {showResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowResult(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md glass-strong rounded-2xl p-6 animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Submit Result</h2>
              <button onClick={() => setShowResult(null)} className="text-rz-text-muted hover:text-rz-text"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex items-center justify-center gap-6 mb-6">
              <div className="text-center">
                <p className="text-sm text-rz-text-secondary mb-2">Team 1</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setScore1(Math.max(0, score1 - 1))} className="w-8 h-8 rounded-lg bg-rz-card border border-rz-border flex items-center justify-center text-rz-text">-</button>
                  <span className="text-3xl font-bold w-10 text-center">{score1}</span>
                  <button onClick={() => setScore1(score1 + 1)} className="w-8 h-8 rounded-lg bg-rz-card border border-rz-border flex items-center justify-center text-rz-text">+</button>
                </div>
              </div>
              <span className="text-xs text-rz-text-muted font-mono">VS</span>
              <div className="text-center">
                <p className="text-sm text-rz-text-secondary mb-2">Team 2</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setScore2(Math.max(0, score2 - 1))} className="w-8 h-8 rounded-lg bg-rz-card border border-rz-border flex items-center justify-center text-rz-text">-</button>
                  <span className="text-3xl font-bold w-10 text-center">{score2}</span>
                  <button onClick={() => setScore2(score2 + 1)} className="w-8 h-8 rounded-lg bg-rz-card border border-rz-border flex items-center justify-center text-rz-text">+</button>
                </div>
              </div>
            </div>
            <button onClick={() => submitResult(showResult)} disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? 'Submitting...' : 'Submit Result'}
            </button>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {showDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowDispute(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md glass-strong rounded-2xl p-6 animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-rz-warning">Dispute Match</h2>
              <button onClick={() => setShowDispute(null)} className="text-rz-text-muted hover:text-rz-text"><X className="w-5 h-5" /></button>
            </div>
            <textarea
              value={disputeReason}
              onChange={e => setDisputeReason(e.target.value)}
              placeholder="Describe the issue..."
              className="input-field w-full h-28 resize-none"
            />
            <button onClick={() => disputeMatch(showDispute)} disabled={loading || !disputeReason.trim()} className="btn-primary w-full mt-4 disabled:opacity-50 bg-rz-warning hover:bg-rz-warning/90">
              {loading ? 'Submitting...' : 'File Dispute'}
            </button>
          </div>
        </div>
      )}

      {/* Active Matches */}
      <section>
        <h2 className="section-title flex items-center gap-2">
          <Swords className="w-5 h-5 text-rz-accent" /> Active Matches
        </h2>
        {liveMatches.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center">
            <Gamepad2 className="w-10 h-10 text-rz-text-muted mx-auto mb-3" />
            <p className="text-rz-text-secondary">No active matches</p>
            <p className="text-sm text-rz-text-muted mt-1">Create a match to get started!</p>
          </div>
        ) : (
          <div className="space-y-3">{liveMatches.map(m => <MatchCard key={m.id} match={m} />)}</div>
        )}
      </section>

      {/* Completed Matches */}
      <section>
        <h2 className="section-title flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-rz-success" /> Completed Matches
        </h2>
        {completedMatches.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center">
            <Clock className="w-10 h-10 text-rz-text-muted mx-auto mb-3" />
            <p className="text-rz-text-secondary">No completed matches yet</p>
          </div>
        ) : (
          <div className="space-y-3">{completedMatches.map(m => <MatchCard key={m.id} match={m} />)}</div>
        )}
      </section>
    </div>
  );
}
