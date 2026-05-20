import { useEffect, useState } from 'react';
import type { RoomComponentProps } from '../RoomBlueprint';
import { useAuthStore } from '../../store/auth.store';
import { useChatStore } from '../../store/chat.store';
import { getMembers, normalizeMember } from '../../api/rooms.api';
import {
  enqueueTrack,
  removeTrack,
  castVoteNext,
  reorderTrack,
  type JukeboxTrack,
} from '../../api/jukebox.api';
import {
  useJukeboxRoomState,
  useJukeboxRoomSubscription,
} from './jukeboxRoom.store';

/**
 * Right-sidebar widget for Music Jukebox rooms.
 *
 * Sections:
 *  - "Now playing" header (mirrors the strip but lives in the panel too).
 *  - "Up next" — ordered queue with vote-next, remove (track owner/admin),
 *    and reorder up/down (DJ/admin/owner).
 *  - "Add a track" inline form — title + external URL. The attachment-id
 *    picker is intentionally a TODO for v1 since the backend accepts both.
 *
 * Skip-vote ratio + Skip button are owned by `JukeboxNowStrip` so they stay
 * visible while the panel is closed.
 */
export function JukeboxPanel({ roomId }: RoomComponentProps) {
  useJukeboxRoomSubscription(roomId);
  const { playing, queue, memberCount } = useJukeboxRoomState(roomId);

  const currentUser = useAuthStore((s) => s.user);
  const rooms = useChatStore((s) => s.rooms);
  const activeRoom = rooms.find((r) => r._id === roomId);

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);

  const [callerRole, setCallerRole] = useState<'owner' | 'admin' | 'member' | null>(null);

  // Determine caller's role inside this room. Owner via `activeRoom.owner`,
  // admin via the members API (mirrors the FmTunerPanel / RightSidebar
  // pattern so the role probe behaviour is identical for both room types).
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

  const isAdminOrOwner = callerRole === 'admin' || callerRole === 'owner';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);
    const t = title.trim();
    const url = externalUrl.trim();
    if (!t) {
      setFormMsg('Title is required.');
      return;
    }
    if (!url) {
      setFormMsg('A URL is required for v1. Attachment upload coming soon.');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setFormMsg('URL must start with http:// or https://');
      return;
    }
    setSubmitting(true);
    try {
      await enqueueTrack(roomId, {
        title: t,
        artist: artist.trim() || undefined,
        externalUrl: url,
      });
      setTitle('');
      setArtist('');
      setExternalUrl('');
      setFormMsg('Added.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormMsg(e.response?.data?.error ?? 'Could not add track.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoteNext = async (track: JukeboxTrack) => {
    setBusyTrackId(track.id);
    try {
      await castVoteNext(roomId, track.id);
    } catch {
      // swallow — socket reconciles
    } finally {
      setBusyTrackId(null);
    }
  };

  const handleRemove = async (track: JukeboxTrack) => {
    setBusyTrackId(track.id);
    try {
      await removeTrack(roomId, track.id);
    } catch {
      // swallow
    } finally {
      setBusyTrackId(null);
    }
  };

  const handleReorder = async (track: JukeboxTrack, direction: 'up' | 'down') => {
    const idx = queue.findIndex((t) => t.id === track.id);
    if (idx === -1) return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= queue.length) return;
    setBusyTrackId(track.id);
    try {
      await reorderTrack(roomId, track.id, target);
    } catch {
      // swallow
    } finally {
      setBusyTrackId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3 border-t border-gray-800 bg-gray-900 text-xs text-gray-200">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        Music Jukebox
      </h3>

      {/* Now playing */}
      <div className="bg-gray-800/70 border border-gray-700 rounded-md px-2 py-2">
        {playing ? (
          <>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Now playing</p>
            <p className="text-sm font-semibold text-white truncate" title={playing.title}>
              {playing.title}
            </p>
            {playing.artist && (
              <p className="text-[11px] text-gray-300 truncate" title={playing.artist}>
                {playing.artist}
              </p>
            )}
            <p className="text-[10px] text-gray-500 mt-0.5">
              {playing.skipVotes.length} of {memberCount || '?'} voted to skip
            </p>
          </>
        ) : (
          <p className="text-[11px] text-gray-500">Queue is empty. Add a track below.</p>
        )}
      </div>

      {/* Queue */}
      <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-0.5">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">Up next</p>
        {queue.length === 0 ? (
          <p className="text-[11px] text-gray-500 text-center py-2">Nothing queued.</p>
        ) : (
          queue.map((track, idx) => (
            <QueueRow
              key={track.id}
              track={track}
              index={idx}
              total={queue.length}
              currentUserId={currentUser?._id ?? null}
              isAdminOrOwner={isAdminOrOwner}
              busy={busyTrackId === track.id}
              onVoteNext={() => handleVoteNext(track)}
              onRemove={() => handleRemove(track)}
              onReorder={(direction) => handleReorder(track, direction)}
            />
          ))
        )}
      </div>

      {/* Add a track */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Add a track
        </p>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Track title"
          maxLength={200}
          className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
        <input
          type="text"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Artist (optional)"
          maxLength={200}
          className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
        <input
          type="url"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          placeholder="https://example.com/track.mp3"
          className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
        <button
          type="submit"
          disabled={submitting || !title.trim() || !externalUrl.trim()}
          className="w-full py-1.5 text-xs font-medium bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors"
        >
          {submitting ? 'Adding…' : 'Add to queue'}
        </button>
        {formMsg && (
          <p
            className={`text-[10px] ${formMsg === 'Added.' ? 'text-green-400' : 'text-amber-300'}`}
          >
            {formMsg}
          </p>
        )}
        <p className="text-[10px] text-gray-500 leading-snug">
          TODO: attachment picker for uploaded MP3s. URL works today.
        </p>
      </form>
    </div>
  );
}

interface QueueRowProps {
  track: JukeboxTrack;
  index: number;
  total: number;
  currentUserId: string | null;
  isAdminOrOwner: boolean;
  busy: boolean;
  onVoteNext: () => void;
  onRemove: () => void;
  onReorder: (direction: 'up' | 'down') => void;
}

function QueueRow({
  track,
  index,
  total,
  currentUserId,
  isAdminOrOwner,
  busy,
  onVoteNext,
  onRemove,
  onReorder,
}: QueueRowProps) {
  const isOwner = currentUserId !== null && track.addedBy === currentUserId;
  const canRemove = isOwner || isAdminOrOwner;
  const alreadyVotedNext =
    currentUserId !== null && track.voteNextBy.includes(currentUserId);

  return (
    <div className="bg-gray-800/70 border border-gray-700 rounded-md px-2 py-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white truncate" title={track.title}>
            {index + 1}. {track.title}
          </p>
          {track.artist && (
            <p className="text-[10px] text-gray-400 truncate">{track.artist}</p>
          )}
          {track.voteNextBy.length > 0 && (
            <p className="text-[9px] text-pink-300/80">
              {track.voteNextBy.length} vote{track.voteNextBy.length === 1 ? '' : 's'} next
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isAdminOrOwner && (
            <>
              <ReorderButton
                direction="up"
                disabled={index === 0 || busy}
                onClick={() => onReorder('up')}
              />
              <ReorderButton
                direction="down"
                disabled={index === total - 1 || busy}
                onClick={() => onReorder('down')}
              />
            </>
          )}
          <button
            type="button"
            onClick={onVoteNext}
            disabled={busy || alreadyVotedNext}
            aria-label="Vote to play this next"
            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-pink-200"
          >
            {alreadyVotedNext ? 'Voted' : 'Next'}
          </button>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              aria-label="Remove this track from the queue"
              className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReorderButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'up' | 'down';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'up' ? 'Move up' : 'Move down'}
      className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        {direction === 'up' ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        )}
      </svg>
    </button>
  );
}
