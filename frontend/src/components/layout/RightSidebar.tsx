import { useEffect, useState, useCallback } from 'react';
import { useChatStore } from '../../store/chat.store';
import { usePresence } from '../../hooks/usePresence';
import { useAuthStore } from '../../store/auth.store';
import { getRoom, getMembers, sendInvitation } from '../../api/rooms.api';
import type { Room } from '../../store/chat.store';

interface RoomMember {
  _id: string;
  userId: {
    _id: string;
    username: string;
  };
  role: 'owner' | 'admin' | 'member';
}

type PresenceStatus = 'online' | 'afk' | 'offline';

function PresenceDot({ status }: { status: PresenceStatus }) {
  const colors: Record<PresenceStatus, string> = {
    online: 'bg-green-400',
    afk: 'bg-amber-400',
    offline: 'bg-gray-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${colors[status]}`} />;
}

export function RightSidebar() {
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const activeDialogUserId = useChatStore((s) => s.activeDialogUserId);
  const rooms = useChatStore((s) => s.rooms);
  const currentUser = useAuthStore((s) => s.user);
  const { getStatus } = usePresence();

  const [roomDetails, setRoomDetails] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');

  const activeRoom = activeRoomId ? rooms.find((r) => r._id === activeRoomId) : null;

  const loadRoomData = useCallback(async (roomId: string) => {
    setLoadingMembers(true);
    try {
      const [roomRes, membersRes] = await Promise.all([
        getRoom(roomId),
        getMembers(roomId),
      ]);
      setRoomDetails(roomRes.data.room);
      setMembers((membersRes.data.members ?? []) as RoomMember[]);
    } catch {
      setRoomDetails(null);
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    if (activeRoomId) {
      loadRoomData(activeRoomId);
    } else {
      setRoomDetails(null);
      setMembers([]);
    }
  }, [activeRoomId, loadRoomData]);

  const handleInvite = async () => {
    if (!activeRoomId || !inviteUsername.trim()) return;
    setInviting(true);
    setInviteMsg('');
    try {
      await sendInvitation(activeRoomId, inviteUsername.trim());
      setInviteMsg(`Invitation sent to @${inviteUsername}`);
      setInviteUsername('');
    } catch {
      setInviteMsg('Failed to send invitation. Check the username and try again.');
    } finally {
      setInviting(false);
    }
  };

  const safeMembers = members ?? [];
  const currentUserRole = safeMembers.find((m) => m.userId._id === currentUser?._id)?.role;
  const isAdminOrOwner = currentUserRole === 'admin' || currentUserRole === 'owner';

  const owners = safeMembers.filter((m) => m.role === 'owner');
  const admins = safeMembers.filter((m) => m.role === 'admin');
  const regularMembers = safeMembers.filter((m) => m.role === 'member');

  if (activeDialogUserId && !activeRoomId) {
    return (
      <aside className="w-56 bg-gray-900 border-l border-gray-700 flex flex-col shrink-0 p-4 hidden lg:flex">
        <p className="text-xs text-gray-500 text-center">Direct message</p>
      </aside>
    );
  }

  if (!activeRoomId) {
    return (
      <aside className="w-56 bg-gray-900 border-l border-gray-700 hidden lg:flex flex-col shrink-0 items-center justify-center">
        <p className="text-xs text-gray-600 text-center px-4">Select a room or contact to start chatting</p>
      </aside>
    );
  }

  return (
    <aside className="w-56 bg-gray-900 border-l border-gray-700 hidden lg:flex flex-col shrink-0 overflow-hidden">
      {/* Room info */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-gray-400 text-sm">#</span>
          <h2 className="text-sm font-bold text-white truncate">{activeRoom?.name ?? roomDetails?.name}</h2>
        </div>
        {roomDetails?.description && (
          <p className="text-xs text-gray-400 leading-relaxed">{roomDetails.description}</p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className={`text-xs px-1.5 py-0.5 rounded text-white ${roomDetails?.isPrivate ? 'bg-gray-700' : 'bg-blue-700'}`}>
            {roomDetails?.isPrivate ? 'Private' : 'Public'}
          </span>
          <span className="text-xs text-gray-500">{members.length} members</span>
        </div>
      </div>

      {/* Members list */}
      <div className="flex-1 overflow-y-auto p-3">
        {loadingMembers ? (
          <div className="flex justify-center py-4">
            <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {owners.length > 0 && (
              <MemberGroup title="Owner" members={owners} getStatus={getStatus} />
            )}
            {admins.length > 0 && (
              <MemberGroup title="Admins" members={admins} getStatus={getStatus} />
            )}
            {regularMembers.length > 0 && (
              <MemberGroup title="Members" members={regularMembers} getStatus={getStatus} />
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      {isAdminOrOwner && (
        <div className="p-3 border-t border-gray-700 space-y-2">
          <button
            onClick={() => setShowInvite((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors border border-gray-700"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Invite User
          </button>

          {showInvite && (
            <div className="space-y-1.5">
              <input
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="Username"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteUsername.trim()}
                className="w-full py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {inviting ? 'Sending…' : 'Send Invite'}
              </button>
              {inviteMsg && (
                <p className={`text-xs ${inviteMsg.startsWith('Failed') ? 'text-red-400' : 'text-green-400'}`}>
                  {inviteMsg}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function MemberGroup({
  title,
  members,
  getStatus,
}: {
  title: string;
  members: RoomMember[];
  getStatus: (id: string) => PresenceStatus;
}) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1 px-1">{title}</p>
      <div className="space-y-0.5">
        {members.map((m) => (
          <div key={m._id} className="flex items-center gap-2 px-1 py-1 rounded">
            <PresenceDot status={getStatus(m.userId._id)} />
            <span className="text-xs text-gray-300 truncate">{m.userId.username}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
