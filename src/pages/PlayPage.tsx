import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, Gamepad2, LogOut, MessageCircle, Plus, RefreshCw, Send, Swords, Trash2, Trophy, Users } from 'lucide-react';
import { supabase, isSupabaseAvailable, type MatchRoom, type MatchRoomPlayer, type Profile, type RoomMessage } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

type RoomMode = '2v2' | '5v5';
const getMaxPlayers = (mode: RoomMode) => (mode === '2v2' ? 4 : 10);
const halfSlots = (room: MatchRoom) => room.max_players / 2;
const minTeamPlayers = (room: MatchRoom) => room.mode === '5v5' ? 3 : halfSlots(room);

export function PlayPage() {
  const { session, profile } = useAuth();
  const [rooms, setRooms] = useState<MatchRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, RoomMessage[]>>({});
  const [chatTabByRoom, setChatTabByRoom] = useState<Record<string, 'all' | 'team'>>({});
  const messageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [sendingMessageRoom, setSendingMessageRoom] = useState<string | null>(null);

  const activeRooms = useMemo(() => rooms.filter(room => room.status === 'waiting' || room.status === 'full' || room.status === 'live'), [rooms]);
  const matchHistory = useMemo(() => rooms.filter(room => room.status === 'completed'), [rooms]);

  useEffect(() => {
    if (!isSupabaseAvailable || !profile) return;
    fetchRooms();

    const channel = supabase
      .channel('match_rooms_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_rooms' }, fetchRooms)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_room_players' }, fetchRooms)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_messages' }, fetchRooms)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const fetchRooms = async () => {
    setError(null);
    try {
      const { data: roomRows, error: roomError } = await supabase
        .from('match_rooms')
        .select('*')
        .in('status', ['waiting', 'full', 'live', 'completed'])
        .order('created_at', { ascending: false })
        .limit(30);

      if (roomError) throw roomError;
      const baseRooms = (roomRows ?? []) as MatchRoom[];

      if (baseRooms.length === 0) {
        setRooms([]);
        return;
      }

      const roomIds = baseRooms.map(room => room.id);
      const profileIds = Array.from(new Set(baseRooms.map(room => room.host_id)));

      const { data: playerRows, error: playerError } = await supabase
        .from('match_room_players')
        .select('*')
        .in('room_id', roomIds)
        .order('slot', { ascending: true });

      if (playerError) throw playerError;
      const players = (playerRows ?? []) as MatchRoomPlayer[];
      for (const player of players) profileIds.push(player.profile_id);

      const uniqueProfileIds = Array.from(new Set(profileIds));
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', uniqueProfileIds);

      if (profileError) throw profileError;
      const profileMap = new Map((profileRows ?? []).map((p: Profile) => [p.id, p]));

      const mergedRooms = baseRooms.map(room => ({
        ...room,
        host: profileMap.get(room.host_id),
        players: players
          .filter(player => player.room_id === room.id)
          .map(player => ({ ...player, profile: profileMap.get(player.profile_id) })),
      }));

      setRooms(mergedRooms);
      await fetchRoomMessages(roomIds, mergedRooms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rooms уншихад алдаа гарлаа');
    }
  };

  const cleanupEmptyRoom = async (roomId: string) => {
    const { data } = await supabase.from('match_room_players').select('id').eq('room_id', roomId).limit(1);
    if (!data || data.length === 0) {
      await supabase.from('match_rooms').delete().eq('id', roomId);
    }
  };

  const createRoom = async (mode: RoomMode) => {
    if (!session?.user || !profile) {
      setError('Эхлээд login хийнэ үү');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.rpc('rz_create_room', { p_mode: mode });
      if (error) throw error;
      setSuccess(`${mode} room үүслээ. Чи Team A slot 1 дээр орсон.`);
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Room үүсгэхэд алдаа гарлаа');
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (room: MatchRoom, team: 'A' | 'B') => {
    if (!profile) {
      setError('Эхлээд login хийнэ үү');
      return;
    }

    setJoiningId(room.id);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.rpc('rz_join_room', { p_room_id: room.id, p_team: team });
      if (error) throw error;
      setSuccess(`Team ${team}-д амжилттай орлоо`);
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Room-д ороход алдаа гарлаа');
    } finally {
      setJoiningId(null);
    }
  };

  const switchTeam = async (room: MatchRoom, team: 'A' | 'B') => {
    if (!profile) return;

    setJoiningId(room.id);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.rpc('rz_join_room', { p_room_id: room.id, p_team: team });
      if (error) throw error;
      setSuccess(`Team ${team} рүү шилжлээ`);
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Team солиход алдаа гарлаа');
    } finally {
      setJoiningId(null);
    }
  };

  const toggleReady = async (room: MatchRoom) => {
    if (!profile) return;

    setJoiningId(room.id);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.rpc('rz_toggle_ready', { p_room_id: room.id });
      if (error) throw error;
      setSuccess('Ready төлөв шинэчлэгдлээ');
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ready төлөв өөрчлөхөд алдаа гарлаа');
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
      const { error } = await supabase.rpc('rz_leave_room', { p_room_id: room.id });
      if (error) throw error;
      setSuccess('Room-оос гарлаа');
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Room-оос гарахад алдаа гарлаа');
    } finally {
      setJoiningId(null);
    }
  };

  const deleteRoom = async (room: MatchRoom) => {
    if (!profile || room.host_id !== profile.id) return;
    setJoiningId(room.id);
    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabase.rpc('rz_delete_room', { p_room_id: room.id });
      if (error) throw error;
      setSuccess('Room устлаа');
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Room устгахад алдаа гарлаа');
    } finally {
      setJoiningId(null);
    }
  };


  const startMatch = async (room: MatchRoom) => {
    if (!profile || room.host_id !== profile.id) return;
    setJoiningId(room.id);
    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabase.rpc('rz_start_room', { p_room_id: room.id });
      if (error) throw error;
      setSuccess('Match эхэллээ. Одоо result оруулж болно.');
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Match эхлүүлэхэд алдаа гарлаа');
    } finally {
      setJoiningId(null);
    }
  };

  const submitResult = async (room: MatchRoom, winner: 'A' | 'B') => {
    if (!profile || room.host_id !== profile.id) return;
    setJoiningId(room.id);
    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabase.rpc('rz_submit_room_result', { p_room_id: room.id, p_winner_team: winner });
      if (error) throw error;
      setSuccess(`Team ${winner} яллаа. Winner +10, loser -10 оноо шинэчлэгдлээ.`);
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Result оруулахад алдаа гарлаа');
    } finally {
      setJoiningId(null);
    }
  };


  const submitDraw = async (room: MatchRoom) => {
    if (!profile || room.host_id !== profile.id) return;
    setJoiningId(room.id);
    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabase.rpc('rz_submit_room_draw', { p_room_id: room.id });
      if (error) throw error;
      setSuccess('Draw бүртгэгдлээ. Оноо 0, draw +1.');
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Draw result оруулахад алдаа гарлаа');
    } finally {
      setJoiningId(null);
    }
  };


  const getPlayerTeam = (room: MatchRoom, profileId: string) => {
    const half = halfSlots(room);
    const player = room.players?.find(item => item.profile_id === profileId);
    if (!player) return null;
    return player.slot <= half ? 'A' : 'B';
  };

  const fetchRoomMessages = async (roomIds: string[], mergedRooms: MatchRoom[]) => {
    if (roomIds.length === 0 || !profile) {
      setMessagesByRoom({});
      return;
    }

    const { data, error } = await supabase
      .from('room_messages')
      .select('*')
      .in('room_id', roomIds)
      .order('created_at', { ascending: true })
      .limit(300);

    if (error) {
      console.warn('Room messages fetch error', error.message);
      return;
    }

    const next: Record<string, RoomMessage[]> = {};
    for (const room of mergedRooms) {
      const myTeam = getPlayerTeam(room, profile.id);
      next[room.id] = ((data ?? []) as RoomMessage[]).filter(message => {
        if (message.room_id !== room.id) return false;
        if (message.channel === 'all') return true;
        return !!myTeam && message.team === myTeam;
      }).slice(-80);
    }
    setMessagesByRoom(next);
  };

  const sendRoomMessage = async (room: MatchRoom) => {
    if (!profile) {
      setError('Эхлээд login хийнэ үү');
      return;
    }

    const input = messageInputRefs.current[room.id];
    const text = (input?.value ?? '').trim();
    if (!text) return;
    if (text.length > 300) {
      setError('Chat message 300 тэмдэгтээс бага байх ёстой');
      return;
    }

    const channel = chatTabByRoom[room.id] ?? 'all';
    const myTeam = getPlayerTeam(room, profile.id);
    if (channel === 'team' && !myTeam) {
      setError('Team chat бичихийн тулд эхлээд Team A/B-д орно уу');
      return;
    }

    setSendingMessageRoom(room.id);
    setError(null);
    try {
      const { error } = await supabase.rpc('rz_send_room_message', {
        p_room_id: room.id,
        p_message: text,
        p_channel: channel,
      });
      if (error) throw error;
      if (input) input.value = '';
      await fetchRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message илгээхэд алдаа гарлаа');
    } finally {
      setSendingMessageRoom(null);
    }
  };

  const RoomCard = ({ room }: { room: MatchRoom }) => {
    const players = room.players ?? [];
    const currentPlayer = profile ? players.find(player => player.profile_id === profile.id) : undefined;
    const joined = !!currentPlayer;
    const readyCount = players.filter(player => player.is_ready).length;
    const isFull = players.length >= room.max_players;
    const canJoin = room.status === 'waiting' && !joined && !isFull;
    const half = halfSlots(room);
    const teamA = players.filter(player => player.slot <= half);
    const teamB = players.filter(player => player.slot > half);
    const minPerTeam = minTeamPlayers(room);
    const hasEnoughPlayers = teamA.length >= minPerTeam && teamB.length >= minPerTeam;
    const everyoneReady = players.length > 0 && readyCount === players.length;
    const isHost = profile?.id === room.host_id;
    const canStart = isHost && (room.status === 'waiting' || room.status === 'full') && hasEnoughPlayers && everyoneReady;

    return (
      <div className="glass rounded-xl p-4 card-hover">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge-live"><span className="w-1.5 h-1.5 rounded-full bg-rz-accent animate-pulse" />{room.mode}</span>
              <span className={room.status === 'waiting' ? 'badge-info' : room.status === 'full' || room.status === 'live' ? 'badge-success' : 'badge-error'}>{room.status.toUpperCase()}</span>
              {room.winner_team && <span className="badge-success">TEAM {room.winner_team} WIN</span>}
            </div>
            <p className="text-sm text-rz-text-secondary">Host: <span className="text-rz-text font-medium">{room.host?.username ?? 'Unknown'}</span></p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-rz-accent">{players.length}/{room.max_players}</p>
            <p className="text-xs text-rz-text-muted">players</p>
            <p className="text-xs text-rz-success">Ready {readyCount}/{players.length}</p>
            <p className="text-xs text-rz-text-muted">Min {room.mode === '5v5' ? '3v3' : '2v2'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-rz-card/60 border border-rz-border rounded-lg p-3">
            <p className="text-xs text-rz-text-muted mb-2">TEAM A</p>
            <div className="space-y-1.5">
              {Array.from({ length: half }).map((_, index) => {
                const player = teamA[index];
                return <p key={index} className="text-sm truncate">{player?.profile?.username ?? `Empty slot ${index + 1}`} {player?.is_ready ? '✅' : player ? '⏳' : ''}</p>;
              })}
            </div>
          </div>
          <div className="bg-rz-card/60 border border-rz-border rounded-lg p-3">
            <p className="text-xs text-rz-text-muted mb-2">TEAM B</p>
            <div className="space-y-1.5">
              {Array.from({ length: half }).map((_, index) => {
                const player = teamB[index];
                return <p key={index} className="text-sm truncate">{player?.profile?.username ?? `Empty slot ${index + 1}`} {player?.is_ready ? '✅' : player ? '⏳' : ''}</p>;
              })}
            </div>
          </div>
        </div>

        {joined && (
          <div className="bg-rz-card/40 border border-rz-border rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="w-4 h-4 text-rz-accent" /> Room Chat</div>
              <div className="flex items-center gap-1 bg-rz-dark/60 rounded-lg p-1">
                <button
                  onClick={() => setChatTabByRoom(prev => ({ ...prev, [room.id]: 'all' }))}
                  className={`px-2.5 py-1 rounded text-xs ${(chatTabByRoom[room.id] ?? 'all') === 'all' ? 'bg-rz-accent text-white' : 'text-rz-text-secondary hover:text-rz-text'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setChatTabByRoom(prev => ({ ...prev, [room.id]: 'team' }))}
                  className={`px-2.5 py-1 rounded text-xs ${chatTabByRoom[room.id] === 'team' ? 'bg-rz-accent text-white' : 'text-rz-text-secondary hover:text-rz-text'}`}
                >
                  Team
                </button>
              </div>
            </div>

            <div className="h-36 overflow-y-auto bg-rz-dark/50 border border-rz-border rounded-lg p-2 space-y-2 mb-2">
              {(messagesByRoom[room.id] ?? []).filter(message => {
                const tab = chatTabByRoom[room.id] ?? 'all';
                if (tab === 'all') return message.channel === 'all';
                return message.channel === 'team';
              }).length === 0 ? (
                <p className="text-xs text-rz-text-muted text-center py-10">No messages yet</p>
              ) : (
                (messagesByRoom[room.id] ?? []).filter(message => {
                  const tab = chatTabByRoom[room.id] ?? 'all';
                  if (tab === 'all') return message.channel === 'all';
                  return message.channel === 'team';
                }).map(message => (
                  <div key={message.id} className="text-sm">
                    <span className="text-rz-accent font-medium">{message.username}</span>
                    <span className="text-rz-text-muted text-xs ml-1">{message.channel === 'team' ? `Team ${message.team}` : 'All'}</span>
                    <p className="text-rz-text-secondary break-words">{message.message}</p>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={element => { messageInputRefs.current[room.id] = element; }}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendRoomMessage(room);
                  }
                }}
                maxLength={300}
                placeholder={(chatTabByRoom[room.id] ?? 'all') === 'all' ? 'All chat message...' : 'Team chat message...'}
                className="input-field flex-1 text-sm"
              />
              <button onClick={() => sendRoomMessage(room)} disabled={sendingMessageRoom === room.id} className="btn-primary px-3 disabled:opacity-50"><Send className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-rz-text-muted">{new Date(room.created_at).toLocaleString()}</p>
          {joined ? (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => toggleReady(room)} disabled={joiningId === room.id || room.status === 'live' || room.status === 'completed'} className={`flex items-center gap-1 text-sm disabled:opacity-50 ${currentPlayer?.is_ready ? 'btn-primary' : 'btn-ghost'}`}>
                <CheckCircle className="w-4 h-4" /> {currentPlayer?.is_ready ? 'Ready ✓' : 'Ready'}
              </button>
              <button onClick={() => switchTeam(room, 'A')} disabled={joiningId === room.id || room.status === 'live' || room.status === 'completed'} className="btn-ghost flex items-center gap-1 text-sm disabled:opacity-50"><Users className="w-4 h-4" /> Team A</button>
              <button onClick={() => switchTeam(room, 'B')} disabled={joiningId === room.id || room.status === 'live' || room.status === 'completed'} className="btn-ghost flex items-center gap-1 text-sm disabled:opacity-50"><Users className="w-4 h-4" /> Team B</button>
              <button onClick={() => leaveRoom(room)} disabled={joiningId === room.id} className="btn-ghost text-rz-warning flex items-center gap-1 text-sm disabled:opacity-50"><LogOut className="w-4 h-4" /> Leave</button>
              {canStart && <button onClick={() => startMatch(room)} disabled={joiningId === room.id} className="btn-primary flex items-center gap-1 text-sm disabled:opacity-50"><Swords className="w-4 h-4" /> Start Match</button>}
              {isHost && room.status === 'live' && <button onClick={() => submitResult(room, 'A')} disabled={joiningId === room.id} className="btn-primary flex items-center gap-1 text-sm disabled:opacity-50"><Trophy className="w-4 h-4" /> Team A Win</button>}
              {isHost && room.status === 'live' && <button onClick={() => submitResult(room, 'B')} disabled={joiningId === room.id} className="btn-primary flex items-center gap-1 text-sm disabled:opacity-50"><Trophy className="w-4 h-4" /> Team B Win</button>}
              {isHost && room.status === 'live' && <button onClick={() => submitDraw(room)} disabled={joiningId === room.id} className="btn-ghost flex items-center gap-1 text-sm disabled:opacity-50"><Trophy className="w-4 h-4" /> Draw</button>}
              {isHost && room.status !== 'completed' && <button onClick={() => deleteRoom(room)} disabled={joiningId === room.id} className="btn-ghost text-rz-error flex items-center gap-1 text-sm disabled:opacity-50"><Trash2 className="w-4 h-4" /> Delete</button>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => joinRoom(room, 'A')} disabled={!canJoin || joiningId === room.id} className="btn-primary flex items-center gap-1 text-sm disabled:opacity-50"><Users className="w-4 h-4" /> {joiningId === room.id ? 'Joining...' : isFull ? 'Full' : 'Join Team A'}</button>
              <button onClick={() => joinRoom(room, 'B')} disabled={!canJoin || joiningId === room.id} className="btn-primary flex items-center gap-1 text-sm disabled:opacity-50"><Users className="w-4 h-4" /> {joiningId === room.id ? 'Joining...' : isFull ? 'Full' : 'Join Team B'}</button>
              {isHost && <button onClick={() => deleteRoom(room)} disabled={joiningId === room.id} className="btn-ghost text-rz-error flex items-center gap-1 text-sm disabled:opacity-50"><Trash2 className="w-4 h-4" /> Delete</button>}
            </div>
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
        <button onClick={fetchRooms} className="btn-ghost flex items-center gap-2 text-sm self-start sm:self-auto"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>

      {!profile && <div className="bg-rz-warning/10 border border-rz-warning/20 rounded-lg px-4 py-3 text-sm text-rz-warning flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Login хийсний дараа room үүсгэж/орж болно.</div>}
      {error && <div className="bg-rz-error/10 border border-rz-error/20 rounded-lg px-4 py-2.5 text-sm text-rz-error">{error}</div>}
      {success && <div className="bg-rz-success/10 border border-rz-success/20 rounded-lg px-4 py-2.5 text-sm text-rz-success">{success}</div>}

      <section className="grid sm:grid-cols-2 gap-4">
        <button onClick={() => createRoom('2v2')} disabled={loading || !profile} className="glass rounded-xl p-5 text-left card-hover border border-rz-accent/20 disabled:opacity-50">
          <div className="flex items-center justify-between mb-3"><Swords className="w-8 h-8 text-rz-accent" /><Plus className="w-5 h-5 text-rz-text-muted" /></div>
          <h2 className="text-xl font-bold">Create 2v2 Room</h2><p className="text-sm text-rz-text-secondary mt-1">4 players, two teams</p>
        </button>
        <button onClick={() => createRoom('5v5')} disabled={loading || !profile} className="glass rounded-xl p-5 text-left card-hover border border-rz-accent/20 disabled:opacity-50">
          <div className="flex items-center justify-between mb-3"><Gamepad2 className="w-8 h-8 text-rz-accent" /><Plus className="w-5 h-5 text-rz-text-muted" /></div>
          <h2 className="text-xl font-bold">Create 5v5 Room</h2><p className="text-sm text-rz-text-secondary mt-1">Flexible: starts from 3v3, max 5v5</p>
        </button>
      </section>

      <section>
        <h2 className="section-title flex items-center gap-2"><Swords className="w-5 h-5 text-rz-accent" /> Active Rooms</h2>
        {activeRooms.length === 0 ? <div className="glass rounded-xl p-8 text-center"><Gamepad2 className="w-10 h-10 text-rz-text-muted mx-auto mb-3" /><p className="text-rz-text-secondary">No active rooms</p><p className="text-sm text-rz-text-muted mt-1">Create a 2v2 or 5v5 room to get started.</p></div> : <div className="grid lg:grid-cols-2 gap-4">{activeRooms.map(room => <RoomCard key={room.id} room={room} />)}</div>}
      </section>

      <section>
        <h2 className="section-title flex items-center gap-2"><CheckCircle className="w-5 h-5 text-rz-success" /> Match History</h2>
        {matchHistory.length === 0 ? <div className="glass rounded-xl p-6 text-center"><Clock className="w-9 h-9 text-rz-text-muted mx-auto mb-2" /><p className="text-rz-text-secondary">No match history yet</p></div> : <div className="grid lg:grid-cols-2 gap-4">{matchHistory.slice(0, 10).map(room => <RoomCard key={room.id} room={room} />)}</div>}
      </section>
    </div>
  );
}
