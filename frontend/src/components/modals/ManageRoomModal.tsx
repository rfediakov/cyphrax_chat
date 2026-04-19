import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePresence } from '../../hooks/usePresence';
import { useAuthStore } from '../../store/auth.store';
import { useChatStore } from '../../store/chat.store';
import {
  getMembers,
  getBans,
  promoteAdmin,
  demoteAdmin,
  banMember,
  unbanMember,
  sendInvitation,
  updateRoom,
  deleteRoom,
  normalizeMember,
  normalizeBan,
} from '../../api/rooms.api';

type Tab = 'members' | 'admins' | 'banned' | 'invitations' | 'settings';

interface RoomMember {
  _id: string;
  userId: { _id: string; username: string };
  role: 'owner' | 'admin' | 'member';
}

interface BannedEntry {
  _id: string;
  userId: { _id: string; username: string };
  bannedBy?: { _id: string; username: string };
  createdAt: string;
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

interface Props {
  roomId: string;
  roomName: string;
  roomDescription?: string;
  roomIsPrivate: boolean;
  currentUserRole: 'owner' | 'admin' | 'member';
  onClose: () => void;
  onRoomDeleted: () => void;
  onRoomUpdated: (updates: { name?: string; description?: string; isPrivate?: boolean }) => void;
}

export function ManageRoomModal({
  roomId,
  roomName,
  roomDescription = '',
  roomIsPrivate,
  currentUserRole,
  onClose,
  onRoomDeleted,
  onRoomUpdated,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('members');
  const navigate = useNavigate();
  const { getStatus } = usePresence();
  const currentUser = useAuthStore((s) => s.user);
  const { setActiveRoom, setRooms, rooms } = useChatStore();

  const [members, setMembers] = useState<RoomMember[]>([]);
  const [bans, setBans] = useState<BannedEntry[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingBans, setLoadingBans] = useState(false);
  const [actionError, setActionError] = useState('');

  // Invitations tab
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');

  // Settings tab
  const [editName, setEditName] = useState(roomName);
  const [editDescription, setEditDescription] = useState(roomDescription);
  const [editIsPrivate, setEditIsPrivate] = useState(roomIsPrivate);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    setActionError('');
    try {
      const res = await getMembers(roomId);
      setMembers((res.data.members ?? []).map((m) => normalizeMember(m as Record<string, unknown>)));
    } catch {
      setActionError('Failed to load members.');
    } finally {
      setLoadingMembers(false);
    }
  }, [roomId]);

  const loadBans = useCallback(async () => {
    setLoadingBans(true);
    setActionError('');
    try {
      const res = await getBans(roomId);
      setBans((res.data.bans ?? []).map((b) => normalizeBan(b as Record<string, unknown>)));
    } catch {
      setActionError('Failed to load bans.');
    } finally {
      setLoadingBans(false);
    }
  }, [roomId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (activeTab === 'banned') loadBans();
  }, [activeTab, loadBans]);

  const handlePromote = async (userId: string) => {
    setActionError('');
    try {
      await promoteAdmin(roomId, userId);
      await loadMembers();
    } catch {
      setActionError('Failed to promote member.');
    }
  };

  const handleDemote = async (userId: string) => {
    setActionError('');
    try {
      await demoteAdmin(roomId, userId);
      await loadMembers();
    } catch {
      setActionError('Failed to demote admin.');
    }
  };

  const handleBan = async (userId: string) => {
    setActionError('');
    try {
      await banMember(roomId, userId);
      await loadMembers();
      if (activeTab === 'banned') await loadBans();
    } catch {
      setActionError('Failed to ban member.');
    }
  };

  const handleUnban = async (userId: string) => {
    setActionError('');
    try {
      await unbanMember(roomId, userId);
      await loadBans();
    } catch {
      setActionError('Failed to unban user.');
    }
  };

  const handleInvite = async () => {
    if (!inviteUsername.trim()) return;
    setInviting(true);
    setInviteMsg('');
    try {
      await sendInvitation(roomId, inviteUsername.trim());
      setInviteMsg(`Invitation sent to @${inviteUsername.trim()}`);
      setInviteUsername('');
    } catch {
      setInviteMsg('Failed to send invitation. Check the username and try again.');
    } finally {
      setInviting(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await updateRoom(roomId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        visibility: editIsPrivate ? 'private' : 'public',
      });
      onRoomUpdated({ name: editName.trim(), description: editDescription.trim(), isPrivate: editIsPrivate });
      setSaveMsg('Settings saved.');
    } catch {
      setSaveMsg('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoom = async () => {
    setDeleting(true);
    try {
      await deleteRoom(roomId);
      setRooms(rooms.filter((r) => r._id !== roomId));
      setActiveRoom(null);
      onRoomDeleted();
      onClose();
      navigate('/');
    } catch {
      setActionError('Failed to delete room.');
      setDeleting(false);
    }
  };

  const admins = members.filter((m) => m.role === 'admin');
  const regularMembers = members.filter((m) => m.role === 'member');

  const TABS: { key: Tab; label: string }[] = [
    { key: 'members', label: 'Members' },
    { key: 'admins', label: 'Admins' },
    { key: 'banned', label: 'Banned' },
    { key: 'invitations', label: 'Invitations' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <h2 className="text-sm font-bold text-white">Manage Room — #{roomName}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 shrink-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setActionError(''); }}
              className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {actionError && (
          <div className="mx-5 mt-3 text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
            {actionError}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* MEMBERS TAB */}
          {activeTab === 'members' && (
            <div className="space-y-2">
              {loadingMembers ? (
                <Spinner />
              ) : (
                <>
                  {members.map((m) => {
                    const isSelf = m.userId._id === currentUser?._id;
                    const isOwnerRow = m.role === 'owner';
                    return (
                      <div key={m._id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-800">
                        <PresenceDot status={getStatus(m.userId._id)} />
                        <span className="text-sm text-gray-200 flex-1 truncate">
                          {m.userId.username}
                          {isSelf && <span className="text-gray-500 ml-1">(you)</span>}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          isOwnerRow ? 'bg-amber-600/30 text-amber-400' :
                          m.role === 'admin' ? 'bg-blue-600/30 text-blue-400' :
                          'bg-gray-700 text-gray-400'
                        }`}>
                          {m.role}
                        </span>
                        {!isOwnerRow && !isSelf && (
                          <div className="flex gap-1.5">
                            {m.role === 'member' && currentUserRole === 'owner' && (
                              <ActionButton onClick={() => handlePromote(m.userId._id)} label="Make admin" variant="blue" />
                            )}
                            {m.role === 'admin' && currentUserRole === 'owner' && (
                              <ActionButton onClick={() => handleDemote(m.userId._id)} label="Remove admin" variant="gray" />
                            )}
                            {(currentUserRole === 'admin' || currentUserRole === 'owner') && (
                              <ActionButton onClick={() => handleBan(m.userId._id)} label="Ban" variant="red" />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {members.length === 0 && <EmptyState text="No members found." />}
                </>
              )}
            </div>
          )}

          {/* ADMINS TAB */}
          {activeTab === 'admins' && (
            <div className="space-y-2">
              {loadingMembers ? (
                <Spinner />
              ) : (
                <>
                  {admins.map((m) => (
                    <div key={m._id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-800">
                      <PresenceDot status={getStatus(m.userId._id)} />
                      <span className="text-sm text-gray-200 flex-1 truncate">{m.userId.username}</span>
                      {currentUserRole === 'owner' && (
                        <ActionButton onClick={() => handleDemote(m.userId._id)} label="Remove admin" variant="gray" />
                      )}
                    </div>
                  ))}
                  {regularMembers.length > 0 && (
                    <>
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider pt-2">Members (not admin)</p>
                      {regularMembers.map((m) => (
                        <div key={m._id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-800">
                          <PresenceDot status={getStatus(m.userId._id)} />
                          <span className="text-sm text-gray-200 flex-1 truncate">{m.userId.username}</span>
                          {currentUserRole === 'owner' && (
                            <ActionButton onClick={() => handlePromote(m.userId._id)} label="Make admin" variant="blue" />
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  {admins.length === 0 && regularMembers.length === 0 && <EmptyState text="No members yet." />}
                </>
              )}
            </div>
          )}

          {/* BANNED TAB */}
          {activeTab === 'banned' && (
            <div className="space-y-2">
              {loadingBans ? (
                <Spinner />
              ) : (
                <>
                  {bans.map((ban) => (
                    <div key={ban._id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-800">
                      <span className="text-sm text-gray-200 flex-1 truncate">{ban.userId?.username ?? 'Unknown'}</span>
                      {ban.bannedBy && (
                        <span className="text-xs text-gray-500 truncate">by @{ban.bannedBy.username}</span>
                      )}
                      <span className="text-xs text-gray-500 shrink-0">
                        {new Date(ban.createdAt).toLocaleDateString()}
                      </span>
                      <ActionButton onClick={() => handleUnban(ban.userId._id)} label="Unban" variant="green" />
                    </div>
                  ))}
                  {bans.length === 0 && <EmptyState text="No banned users." />}
                </>
              )}
            </div>
          )}

          {/* INVITATIONS TAB */}
          {activeTab === 'invitations' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">Send an invitation to a user by their username.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  placeholder="Enter username"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteUsername.trim()}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors shrink-0"
                >
                  {inviting ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
              {inviteMsg && (
                <p className={`text-sm ${inviteMsg.startsWith('Failed') ? 'text-red-400' : 'text-green-400'}`}>
                  {inviteMsg}
                </p>
              )}
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="space-y-5">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white">Room settings</h3>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Room name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Description</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsPrivate}
                    onChange={(e) => setEditIsPrivate(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-300">Private room</span>
                </label>
                <button
                  onClick={handleSaveSettings}
                  disabled={saving || !editName.trim()}
                  className="w-full py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {saveMsg && (
                  <p className={`text-xs ${saveMsg.startsWith('Failed') ? 'text-red-400' : 'text-green-400'}`}>
                    {saveMsg}
                  </p>
                )}
              </div>

              {/* Danger zone */}
              <div className="border-t border-gray-700 pt-5 space-y-3">
                <h3 className="text-sm font-semibold text-red-400">Danger zone</h3>
                <p className="text-xs text-gray-400">
                  Deleting the room is permanent. All messages and members will be removed.
                </p>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2 text-sm border border-red-600 text-red-400 hover:bg-red-600 hover:text-white rounded-lg transition-colors"
                  >
                    Delete room
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-red-300 font-medium">Are you sure? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteRoom}
                        disabled={deleting}
                        className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                      >
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-4 py-2 text-sm text-gray-400 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-6">
      <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-gray-500 text-center py-6">{text}</p>;
}

function ActionButton({
  onClick,
  label,
  variant,
}: {
  onClick: () => void;
  label: string;
  variant: 'blue' | 'red' | 'gray' | 'green';
}) {
  const styles = {
    blue: 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/40',
    red: 'bg-red-600/20 text-red-400 hover:bg-red-600/40',
    gray: 'bg-gray-700 text-gray-300 hover:bg-gray-600',
    green: 'bg-green-600/20 text-green-400 hover:bg-green-600/40',
  };
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded transition-colors shrink-0 ${styles[variant]}`}
    >
      {label}
    </button>
  );
}
