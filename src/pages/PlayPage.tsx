import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, Gamepad2, LogOut, Plus, RefreshCw, Swords, Users } from 'lucide-react';
import { supabase, isSupabaseAvailable, type MatchRoom } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

type RoomMode = '2v2' | '5v5';

const getMaxPlayers = (mode: RoomMode) => (mode === '2v2' ? 4 : 10);

export function PlayPage() {
  const { user, profile } = useAuth();
  const [rooms, setRooms] = useState<MatchRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const waitingRooms = useMemo(() => rooms.filter(room => room.status === 'waiting'), [rooms]);
  const closedRooms = useMemo(() => rooms.filter(room => room.status !== 'waiting'), [rooms]);

  useEffect(() => {
    if (!isSupabaseAvailable || !profile) return;
    fetchRooms();

    const channel = supabase
      .channel('match_rooms_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_rooms' }, fetchRooms)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_room_players' }, fetchRooms)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const fetchRooms = async () => {
    setError(null);
    try {
      const { data, error } = await supabase
        .from('match_rooms')
        .select('*, host:profiles!match_rooms_host_id_fkey(*), players:match_room_players(*, profile:profiles!match_room_players_profile_id_fkey(*))')
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setRooms((data ?? []) as MatchRoom[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rooms уншихад алдаа гарлаа');
    }
  };

  const createRoom = async (mode: RoomMode) => {
    if (!user || !profile) {
      setError('Эхлээд login хийнэ үү');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: room, error: roomError } = await supabase
        .from('match_rooms')
        .insert({
          mode,
          host_id: profile.id,
          status: 'waiting',
          max_players: getMaxPlayers(mode),
        })
        .select()
        .single();

      if (roomError) throw roomError;

      const { error: playerError } = await supabase.from('match_room_players').insert({
        room_id: room.id,
        profile_id: profile.id,
        slot: 1,
      });

      if (playerError) throw playerError;

      setSuccess(`${mode} room үүслээ`);
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Room үүсгэхэд алдаа гарлаа');
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (room: MatchRoom) => {
    if (!profile) {
      setError('Эхлээд login хийнэ үү');
      return;
    }

    const players = room.players ?? [];
    const alreadyJoined = players.some(player => player.profile_id === profile.id);
    if (alreadyJoined) {
      setError('Чи энэ room-д аль хэдийн орсон байна');
      return;
    }

    if (players.length >= room.max_players) {
      setError('Энэ room дүүрсэн байна');
      return;
    }

    setJoiningId(room.id);
    setError(null);
    setSuccess(null);

    try {
      const usedSlots = new Set(players.map(player => player.slot));
      let slot = 1;
      while (usedSlots.has(slot)) slot += 1;

      const { error } = await supabase.from('match_room_players').insert({
        room_id: room.id,
        profile_id: profile.id,
        slot,
      });

      if (error) throw error;

      const newCount = players.length + 1;
      if (newCount >= room.max_players) {
        await supabase.from('match_rooms').update({ status: 'full' }).eq('id', room.id);
      }

      setSuccess('Room-д амжилттай орлоо');
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Room-д ороход алдаа гарлаа');
    } finally {
      setJoiningId(null);
    }
  };

  const leaveRoom = async (room: MatchRoom) => {
    if (!profile) return;
    setJoiningId(room.id);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase
        .from('match_room_players')
        .delete()
        .eq('room_id', room.id)
        .eq('profile_id', profile.id);

      if (error) throw error;

      if (room.host_id === profile.id) {
        await supabase.from('match_rooms').update({ status: 'cancelled' }).eq('id', room.id);
      } else if (room.status === 'full') {
        await supabase.from('match_rooms').update({ status: 'waiting' }).eq('id', room.id);
      }

      setSuccess('Room-оос гарлаа');
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Room-оос гарахад алдаа гарлаа');
    } finally {
      setJoiningId(null);
    }
  };

  const RoomCard = ({ room }: { room: MatchRoom }) => {
    const players = room.players ?? [];
    const joined = !!profile && players.some(player => player.profile_id === profile.id);
    const isFull = players.length >= room.max_players;
    const canJoin = room.status === 'waiting' && !joined && !isFull;
    const teamA = players.filter(player => player.slot <= room.max_players / 2);
    const teamB = players.filter(player => player.slot > room.max_players / 2);

    return (
      <div className="glass rounded-xl p-4 card-hover">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge-live">
                <span className="w-1.5 h-1.5 rounded-full bg-rz-accent animate-pulse" />
                {room.mode}
              </span>
              <span className={room.status === 'waiting' ? 'badge-info' : room.status === 'full' ? 'badge-success' : 'badge-error'}>
                {room.status.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-rz-text-secondary">
              Host: <span className="text-rz-text font-medium">{room.host?.username ?? 'Unknown'}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-rz-accent">{players.length}/{room.max_players}</p>
            <p className="text-xs text-rz-text-muted">players</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-rz-card/60 border border-rz-border rounded-lg p-3">
            <p className="text-xs text-rz-text-muted mb-2">TEAM A</p>
            <div className="space-y-1.5">
              {Array.from({ length: room.max_players / 2 }).map((_, index) => {
                const player = teamA[index];
                return <p key={index} className="text-sm truncate">{player?.profile?.username ?? `Empty slot ${index + 1}`}</p>;
              })}
            </div>
          </div>
          <div className="bg-rz-card/60 border border-rz-border rounded-lg p-3">
            <p className="text-xs text-rz-text-muted mb-2">TEAM B</p>
            <div className="space-y-1.5">
              {Array.from({ length: room.max_players / 2 }).map((_, index) => {
                const player = teamB[index];
                return <p key={index} className="text-sm truncate">{player?.profile?.username ?? `Empty slot ${index + 1}`}</p>;
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-rz-text-muted">{new Date(room.created_at).toLocaleString()}</p>
          {joined ? (
            <button onClick={() => leaveRoom(room)} disabled={joiningId === room.id} className="btn-ghost text-rz-warning flex items-center gap-1 text-sm disabled:opacity-50">
              <LogOut className="w-4 h-4" /> Leave
            </button>
          ) : (
            <button onClick={() => joinRoom(room)} disabled={!canJoin || joiningId === room.id} className="btn-primary flex items-center gap-1 text-sm disabled:opacity-50">
              <Users className="w-4 h-4" /> {joiningId === room.id ? 'Joining...' : isFull ? 'Full' : 'Join'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Play</h1>
          <p className="text-sm text-rz-text-secondary mt-1">Create 2v2 / 5v5 rooms and join active matches</p>
        </div>
        <button onClick={fetchRooms} className="btn-ghost flex items-center gap-2 text-sm self-start sm:self-auto">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {!profile && (
        <div className="bg-rz-warning/10 border border-rz-warning/20 rounded-lg px-4 py-3 text-sm text-rz-warning flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Login хийсний дараа room үүсгэж/орж болно.
        </div>
      )}

      {error && <div className="bg-rz-error/10 border border-rz-error/20 rounded-lg px-4 py-2.5 text-sm text-rz-error">{error}</div>}
      {success && <div className="bg-rz-success/10 border border-rz-success/20 rounded-lg px-4 py-2.5 text-sm text-rz-success">{success}</div>}

      <section className="grid sm:grid-cols-2 gap-4">
        <button onClick={() => createRoom('2v2')} disabled={loading || !profile} className="glass rounded-xl p-5 text-left card-hover border border-rz-accent/20 disabled:opacity-50">
          <div className="flex items-center justify-between mb-3">
            <Swords className="w-8 h-8 text-rz-accent" />
            <Plus className="w-5 h-5 text-rz-text-muted" />
          </div>
          <h2 className="text-xl font-bold">Create 2v2 Room</h2>
          <p className="text-sm text-rz-text-secondary mt-1">4 players, two teams</p>
        </button>
        <button onClick={() => createRoom('5v5')} disabled={loading || !profile} className="glass rounded-xl p-5 text-left card-hover border border-rz-accent/20 disabled:opacity-50">
          <div className="flex items-center justify-between mb-3">
            <Gamepad2 className="w-8 h-8 text-rz-accent" />
            <Plus className="w-5 h-5 text-rz-text-muted" />
          </div>
          <h2 className="text-xl font-bold">Create 5v5 Room</h2>
          <p className="text-sm text-rz-text-secondary mt-1">10 players, full match</p>
        </button>
      </section>

      <section>
        <h2 className="section-title flex items-center gap-2">
          <Swords className="w-5 h-5 text-rz-accent" /> Active Rooms
        </h2>
        {waitingRooms.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center">
            <Gamepad2 className="w-10 h-10 text-rz-text-muted mx-auto mb-3" />
            <p className="text-rz-text-secondary">No active rooms</p>
            <p className="text-sm text-rz-text-muted mt-1">Create a 2v2 or 5v5 room to get started.</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">{waitingRooms.map(room => <RoomCard key={room.id} room={room} />)}</div>
        )}
      </section>

      <section>
        <h2 className="section-title flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-rz-success" /> Recent Full / Cancelled Rooms
        </h2>
        {closedRooms.length === 0 ? (
          <div className="glass rounded-xl p-6 text-center">
            <Clock className="w-9 h-9 text-rz-text-muted mx-auto mb-2" />
            <p className="text-rz-text-secondary">No recent closed rooms</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">{closedRooms.slice(0, 6).map(room => <RoomCard key={room.id} room={room} />)}</div>
        )}
      </section>
    </div>
  );
}
