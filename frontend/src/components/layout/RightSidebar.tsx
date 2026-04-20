import { useEffect, useState, useCallback } from 'react';
import { useChatStore } from '../../store/chat.store';
import { usePresence } from '../../hooks/usePresence';
import { useAuthStore } from '../../store/auth.store';
import { getRoom, getMembers, normalizeMember, sendInvitation } from '../../api/rooms.api';
import { getContacts, normalizeContact } from '../../api/contacts.api';
import { findDialogWithUser } from '../../lib/dialogs';
import { ManageRoomModal } from '../modals/ManageRoomModal';
import type { Room } from '../../store/chat.store';
import type { Contact } from '../../api/contacts.api';

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

interface RightSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function RightSidebar({ isOpen = false, onClose }: RightSidebarProps) {
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
  const [showManageModal, setShowManageModal] = useState(false);

  const membersRefreshToken = useChatStore((s) => s.membersRefreshToken);
  const activeRoom = activeRoomId ? rooms.find((r) => r._id === activeRoomId) : null;

  const loadRoomData = useCallback(async (roomId: string) => {
    setLoadingMembers(true);
    try {
      const [roomRes, membersRes] = await Promise.all([
        getRoom(roomId),
        getMembers(roomId),
      ]);
      setRoomDetails(roomRes.data.room);
      setMembers((membersRes.data.members ?? []).map((m) => normalizeMember(m as Record<string, unknown>)));
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
  }, [activeRoomId, loadRoomData, membersRefreshToken]);

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

  const safeMembers = (members ?? []).filter((m) => m?.userId?._id);
  const currentUserRole = safeMembers.find((m) => m.userId._id === currentUser?._id)?.role;
  const isAdminOrOwner = currentUserRole === 'admin' || currentUserRole === 'owner';

  const owners = safeMembers.filter((m) => m.role === 'owner');
  const admins = safeMembers.filter((m) => m.role === 'admin');
  const regularMembers = safeMembers.filter((m) => m.role === 'member');

  if (activeDialogUserId && !activeRoomId) {
    return <DMUserPanel userId={activeDialogUserId} />;
  }

  if (!activeRoomId) {
    return (
      <aside className="w-56 bg-gray-900 border-l border-gray-700 hidden lg:flex flex-col shrink-0 items-center justify-center">
        <p className="text-xs text-gray-600 text-center px-4">Select a room or contact to start chatting</p>
      </aside>
    );
  }

  const panelBody = (
    <>
      {/* Room info */}
      <div className="p-4 border-b border-gray-700 shrink-0">
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
        <div className="p-3 border-t border-gray-700 space-y-2 shrink-0">
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

          <button
            onClick={() => setShowManageModal(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors border border-gray-700"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Manage Room
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Backdrop — mobile only */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      {/* Mobile drawer + desktop sidebar share the same element.
          On mobile: fixed right-side sheet when open, hidden when closed.
          On desktop (lg+): always visible static column. */}
      <aside
        className={`bg-gray-900 border-l border-gray-700 flex-col shrink-0 overflow-hidden
          ${isOpen ? 'fixed inset-y-0 right-0 z-40 w-72 flex' : 'hidden'}
          lg:static lg:flex lg:w-56 lg:z-auto`}
      >
        {/* Mobile-only header with close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0 lg:hidden">
          <span className="text-sm font-semibold text-white">Members</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            aria-label="Close panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {panelBody}
      </aside>

      {showManageModal && activeRoomId && roomDetails && (
        <ManageRoomModal
          roomId={activeRoomId}
          roomName={roomDetails.name}
          roomDescription={roomDetails.description}
          roomIsPrivate={roomDetails.isPrivate}
          currentUserRole={currentUserRole ?? 'member'}
          onClose={() => setShowManageModal(false)}
          onRoomDeleted={() => setRoomDetails(null)}
          onRoomUpdated={(updates) => {
            if (roomDetails) {
              setRoomDetails({ ...roomDetails, ...updates } as typeof roomDetails);
            }
          }}
        />
      )}
    </>
  );
}

/** Derive a deterministic hue from a string for the avatar background. */
function avatarHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function UserAvatar({ username, size = 'lg' }: { username: string; size?: 'sm' | 'lg' }) {
  const hue = avatarHue(username);
  const initials = username.slice(0, 2).toUpperCase();
  const dim = size === 'lg' ? 'w-16 h-16 text-xl' : 'w-8 h-8 text-xs';
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-bold text-white select-none shrink-0`}
      style={{ backgroundColor: `hsl(${hue} 55% 38%)` }}
    >
      {initials}
    </div>
  );
}

const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: 'Online',
  afk: 'Away',
  offline: 'Offline',
};

const STATUS_COLOR: Record<PresenceStatus, string> = {
  online: 'text-green-400',
  afk: 'text-amber-400',
  offline: 'text-gray-500',
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function DMUserPanel({ userId }: { userId: string }) {
  const { getStatus } = usePresence();
  const dialogs = useChatStore((s) => s.dialogs);
  const [contact, setContact] = useState<Contact | null>(null);

  const dialog = findDialogWithUser(dialogs, userId);
  const username = dialog?.otherUser?.username ?? userId;
  const status = getStatus(userId);

  useEffect(() => {
    let cancelled = false;
    getContacts().then((res) => {
      if (cancelled) return;
      const found = (res.data.contacts ?? [])
        .map(normalizeContact)
        .find((c) => c && (c._id === userId));
      setContact(found ?? null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <aside className="w-56 bg-gray-900 border-l border-gray-700 hidden lg:flex flex-col shrink-0 overflow-hidden">
      {/* Header band */}
      <div className="px-4 py-3 border-b border-gray-700 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Direct Message</p>
      </div>

      {/* Profile section */}
      <div className="flex flex-col items-center gap-3 px-4 py-6 border-b border-gray-700 shrink-0">
        {/* Avatar + presence ring */}
        <div className="relative">
          <UserAvatar username={username} size="lg" />
          <span
            className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-gray-900 ${
              status === 'online' ? 'bg-green-400' : status === 'afk' ? 'bg-amber-400' : 'bg-gray-500'
            }`}
          />
        </div>

        {/* Name + status */}
        <div className="flex flex-col items-center gap-1 w-full min-w-0">
          <span className="text-sm font-bold text-white truncate max-w-full">@{username}</span>
          <span className={`text-xs font-medium ${STATUS_COLOR[status]}`}>
            ● {STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      {/* Info rows */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Contact details */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Contact info</p>
          <div className="space-y-2">
            {/* Username row */}
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs text-gray-300 truncate">{username}</span>
            </div>

            {/* Email row — shown only when available */}
            {contact?.email && (
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-xs text-gray-300 truncate">{contact.email}</span>
              </div>
            )}
          </div>
        </div>

        {/* Conversation details */}
        {dialog && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Conversation</p>
            <div className="space-y-2">
              {/* Last active */}
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs text-gray-400">
                  Active {formatRelativeTime(dialog.updatedAt)}
                </span>
              </div>

              {/* Last message preview */}
              {dialog.lastMessage && !dialog.lastMessage.deletedAt && (
                <div className="mt-1 p-2 bg-gray-800 rounded-lg border border-gray-700">
                  <p className="text-xs text-gray-500 mb-0.5">Last message</p>
                  <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed">
                    {dialog.lastMessage.content}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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
