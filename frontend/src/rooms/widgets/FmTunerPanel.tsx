import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RoomComponentProps } from '../RoomBlueprint';
import { useAuthStore } from '../../store/auth.store';
import { useChatStore } from '../../store/chat.store';
import { getMembers, normalizeMember } from '../../api/rooms.api';
import {
  listStations,
  proposeStation,
  castVote,
  clearVote,
  takeDeck,
  releaseDeck,
  type FmStation,
} from '../../api/fmTuner.api';
import { useFmRoomState, useFmRoomSubscription, useFmStore } from './fmRoom.store';

type Tab = 'stations' | 'now';

/**
 * Right-sidebar widget for FM Tuner rooms.
 *
 * Layout: two stacked sections on mobile, side-by-side on wider screens.
 *  - Stations: search box, "propose station" form, vote-able station list.
 *  - Now Playing: current station + per-station vote totals.
 *
 * Owner / admin actions ("Take the deck", "Release deck") render inline at
 * the bottom of the Now Playing section.
 */
export function FmTunerPanel({ roomId }: RoomComponentProps) {
  useFmRoomSubscription(roomId);
  const { nowPlaying, totals, myStationId } = useFmRoomState(roomId);
  const setMyStation = useFmStore((s) => s.setMyStation);
  const applyTally = useFmStore((s) => s.applyTally);
  const applyNowPlaying = useFmStore((s) => s.applyNowPlaying);

  const currentUser = useAuthStore((s) => s.user);
  const rooms = useChatStore((s) => s.rooms);
  const activeRoom = useMemo(() => rooms.find((r) => r._id === roomId), [rooms, roomId]);

  const [tab, setTab] = useState<Tab>('stations');
  const [stations, setStations] = useState<FmStation[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingStationId, setPendingStationId] = useState<string | null>(null);

  // Propose-station form
  const [proposeName, setProposeName] = useState('');
  const [proposeUrl, setProposeUrl] = useState('');
  const [proposing, setProposing] = useState(false);
  const [proposeMsg, setProposeMsg] = useState<string | null>(null);

  // Membership / role for current user
  const [callerRole, setCallerRole] = useState<'owner' | 'admin' | 'member' | null>(null);

  // ── Effects ──────────────────────────────────────────────────────────────
  const loadStations = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const res = await listStations(roomId, { q: q.trim() || undefined });
        setStations(res.data.stations);
      } catch {
        setStations([]);
      } finally {
        setLoading(false);
      }
    },
    [roomId],
  );

  useEffect(() => {
    void loadStations('');
  }, [loadStations]);

  // Debounced search
  useEffect(() => {
    const handle = setTimeout(() => {
      void loadStations(search);
    }, 250);
    return () => clearTimeout(handle);
  }, [search, loadStations]);

  // Determine caller's role inside this room. Owner via `activeRoom.owner`,
  // admin via the members API (mirrors the RightSidebar pattern).
  useEffect(() => {
    let cancelled = false;

    if (!currentUser) {
      setCallerRole(null);
      return;
    }
    if (activeRoom?.owner === currentUser._id) {
      setCallerRole('owner');
      return;
    }

    getMembers(roomId)
      .then((res) => {
        if (cancelled) return;
        const members = (res.data.members ?? []).map((m) =>
          normalizeMember(m as Record<string, unknown>),
        );
        const mine = members.find((m) => m.userId._id === currentUser._id);
        setCallerRole(mine?.role ?? 'member');
      })
      .catch(() => {
        if (!cancelled) setCallerRole('member');
      });

    return () => {
      cancelled = true;
    };
  }, [roomId, currentUser, activeRoom?.owner]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const voteCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of totals) map.set(t.stationId, t.votes);
    return map;
  }, [totals]);

  const isAdminOrOwner = callerRole === 'admin' || callerRole === 'owner';
  const deckActive = nowPlaying?.source === 'deck';

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleVote = async (stationId: string) => {
    if (!currentUser) return;
    setPendingStationId(stationId);
    try {
      const isAlreadyMine = myStationId === stationId;
      const res = isAlreadyMine
        ? await clearVote(roomId)
        : await castVote(roomId, stationId);
      applyTally(roomId, res.data.totals);
      applyNowPlaying(roomId, res.data.nowPlaying);
      setMyStation(roomId, isAlreadyMine ? null : stationId);
    } catch {
      // swallow — socket events / next fetch will reconcile
    } finally {
      setPendingStationId(null);
    }
  };

  const handlePropose = async (e: React.FormEvent) => {
    e.preventDefault();
    setProposeMsg(null);

    const name = proposeName.trim();
    const url = proposeUrl.trim();
    if (!name) {
      setProposeMsg('Name is required.');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setProposeMsg('Stream URL must start with http:// or https://');
      return;
    }

    setProposing(true);
    try {
      const res = await proposeStation(roomId, { name, streamUrl: url });
      setStations((prev) => [res.data.station, ...prev]);
      setProposeName('');
      setProposeUrl('');
      setProposeMsg('Added.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setProposeMsg(e.response?.data?.error ?? 'Could not add station.');
    } finally {
      setProposing(false);
    }
  };

  const handleTakeDeck = async (stationId: string) => {
    try {
      const res = await takeDeck(roomId, stationId, 300);
      applyNowPlaying(roomId, res.data.nowPlaying);
    } catch {
      // socket event will reconcile if anything actually changed
    }
  };

  const handleReleaseDeck = async () => {
    try {
      const res = await releaseDeck(roomId);
      applyNowPlaying(roomId, res.data.nowPlaying);
    } catch {
      // swallow
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 p-3 border-t border-gray-800 bg-gray-900 text-xs text-gray-200">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex-1">
          FM Tuner
        </h3>
        <div className="flex rounded-md border border-gray-700 overflow-hidden">
          <TabButton active={tab === 'stations'} onClick={() => setTab('stations')}>
            Stations
          </TabButton>
          <TabButton active={tab === 'now'} onClick={() => setTab('now')}>
            Now
          </TabButton>
        </div>
      </div>

      {tab === 'stations' ? (
        <StationsTab
          search={search}
          onSearchChange={setSearch}
          stations={stations}
          loading={loading}
          voteCounts={voteCounts}
          myStationId={myStationId}
          pendingStationId={pendingStationId}
          deckActive={deckActive}
          isAdminOrOwner={isAdminOrOwner}
          onVote={handleVote}
          onTakeDeck={handleTakeDeck}
          proposeName={proposeName}
          proposeUrl={proposeUrl}
          onProposeName={setProposeName}
          onProposeUrl={setProposeUrl}
          onPropose={handlePropose}
          proposing={proposing}
          proposeMsg={proposeMsg}
        />
      ) : (
        <NowTab
          nowPlaying={nowPlaying}
          totals={totals}
          stations={stations}
          isAdminOrOwner={isAdminOrOwner}
          deckActive={deckActive}
          onReleaseDeck={handleReleaseDeck}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
        active ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

interface StationsTabProps {
  search: string;
  onSearchChange: (v: string) => void;
  stations: FmStation[];
  loading: boolean;
  voteCounts: Map<string, number>;
  myStationId: string | null;
  pendingStationId: string | null;
  deckActive: boolean;
  isAdminOrOwner: boolean;
  onVote: (stationId: string) => void;
  onTakeDeck: (stationId: string) => void;
  proposeName: string;
  proposeUrl: string;
  onProposeName: (v: string) => void;
  onProposeUrl: (v: string) => void;
  onPropose: (e: React.FormEvent) => void;
  proposing: boolean;
  proposeMsg: string | null;
}

function StationsTab(props: StationsTabProps) {
  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={props.search}
        onChange={(e) => props.onSearchChange(e.target.value)}
        placeholder="Search stations or tags"
        className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
      />

      <form onSubmit={props.onPropose} className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Add station
        </p>
        <input
          type="text"
          value={props.proposeName}
          onChange={(e) => props.onProposeName(e.target.value)}
          placeholder="Station name"
          maxLength={80}
          className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        <input
          type="url"
          value={props.proposeUrl}
          onChange={(e) => props.onProposeUrl(e.target.value)}
          placeholder="https://example.com/stream.mp3"
          className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        <button
          type="submit"
          disabled={props.proposing || !props.proposeName.trim() || !props.proposeUrl.trim()}
          className="w-full py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors"
        >
          {props.proposing ? 'Adding…' : 'Add'}
        </button>
        {props.proposeMsg && (
          <p
            className={`text-[10px] ${
              props.proposeMsg === 'Added.' ? 'text-green-400' : 'text-amber-300'
            }`}
          >
            {props.proposeMsg}
          </p>
        )}
      </form>

      <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto pr-0.5">
        {props.loading ? (
          <div className="flex justify-center py-3">
            <span className="w-3.5 h-3.5 border-2 border-gray-600 border-t-purple-400 rounded-full animate-spin" />
          </div>
        ) : props.stations.length === 0 ? (
          <p className="text-[11px] text-gray-500 text-center py-3">No stations found.</p>
        ) : (
          props.stations.map((s) => (
            <StationRow
              key={s.id}
              station={s}
              votes={props.voteCounts.get(s.id) ?? 0}
              isMine={props.myStationId === s.id}
              pending={props.pendingStationId === s.id}
              deckActive={props.deckActive}
              isAdminOrOwner={props.isAdminOrOwner}
              onVote={() => props.onVote(s.id)}
              onTakeDeck={() => props.onTakeDeck(s.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface StationRowProps {
  station: FmStation;
  votes: number;
  isMine: boolean;
  pending: boolean;
  deckActive: boolean;
  isAdminOrOwner: boolean;
  onVote: () => void;
  onTakeDeck: () => void;
}

function StationRow({
  station,
  votes,
  isMine,
  pending,
  deckActive,
  isAdminOrOwner,
  onVote,
  onTakeDeck,
}: StationRowProps) {
  return (
    <div className="bg-gray-800/70 border border-gray-700 rounded-md px-2 py-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white truncate" title={station.name}>
            {station.name}
          </p>
          {station.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {station.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="text-[9px] uppercase tracking-wide bg-gray-900 border border-gray-700 text-gray-400 rounded px-1"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onVote}
          disabled={pending || deckActive}
          aria-pressed={isMine}
          aria-label={isMine ? 'Remove my vote' : `Vote for ${station.name}`}
          className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            isMine
              ? 'bg-purple-500 text-white hover:bg-purple-400'
              : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
          }`}
        >
          {pending ? '…' : isMine ? `${votes} ✓` : votes > 0 ? `Vote · ${votes}` : 'Vote'}
        </button>
      </div>
      {isAdminOrOwner && (
        <button
          type="button"
          onClick={onTakeDeck}
          className="mt-1 w-full text-[10px] font-medium text-amber-300 hover:text-amber-200 text-left"
        >
          {deckActive ? 'Switch deck to this station' : 'Take the deck with this station'}
        </button>
      )}
    </div>
  );
}

interface NowTabProps {
  nowPlaying: ReturnType<typeof useFmRoomState>['nowPlaying'];
  totals: ReturnType<typeof useFmRoomState>['totals'];
  stations: FmStation[];
  isAdminOrOwner: boolean;
  deckActive: boolean;
  onReleaseDeck: () => void;
}

function NowTab({
  nowPlaying,
  totals,
  stations,
  isAdminOrOwner,
  deckActive,
  onReleaseDeck,
}: NowTabProps) {
  const stationById = useMemo(() => {
    const map = new Map<string, FmStation>();
    for (const s of stations) map.set(s.id, s);
    return map;
  }, [stations]);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-gray-800/70 border border-gray-700 rounded-md px-2 py-2">
        {nowPlaying ? (
          <>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Now playing</p>
            <p className="text-sm font-semibold text-white truncate" title={nowPlaying.station.name}>
              {nowPlaying.station.name}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Source: <span className="uppercase">{nowPlaying.source}</span>
              {nowPlaying.source === 'vote' && typeof nowPlaying.voteCount === 'number' && (
                <>
                  {' · '}
                  {nowPlaying.voteCount}
                  {typeof nowPlaying.totalMembers === 'number' ? `/${nowPlaying.totalMembers}` : ''} votes
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-gray-500">Nothing playing yet — cast the first vote.</p>
        )}
      </div>

      {totals.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Tally</p>
          {totals.map((t) => {
            const station = stationById.get(t.stationId);
            return (
              <div
                key={t.stationId}
                className="flex items-center justify-between text-[11px] text-gray-300 bg-gray-900/40 border border-gray-800 rounded px-2 py-1"
              >
                <span className="truncate min-w-0">
                  {station?.name ?? '(unknown station)'}
                </span>
                <span className="text-gray-400 ml-2 shrink-0">{t.votes}</span>
              </div>
            );
          })}
        </div>
      )}

      {isAdminOrOwner && deckActive && (
        <button
          type="button"
          onClick={onReleaseDeck}
          className="w-full py-1.5 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-md transition-colors"
        >
          Release the deck
        </button>
      )}
    </div>
  );
}
