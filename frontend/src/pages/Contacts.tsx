import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useChatStore } from '../store/chat.store';
import { usePresence } from '../hooks/usePresence';
import {
  getContacts,
  sendFriendRequest,
  getPendingRequests,
  respondToRequest,
  removeFriend,
  banUser,
  unbanUser,
} from '../api/contacts.api';
import { normalizeContact, type Contact, type PendingFriendRequest } from '../api/contacts.api';
import { findDialogWithUser, getDialogRecordId } from '../lib/dialogs';
import { PresenceDot } from '../components/ui/PresenceDot';

interface BannedUser {
  _id: string;
  username: string;
  email: string;
}

export default function Contacts() {
  const { getStatus } = usePresence();
  const setActiveDialog = useChatStore((s) => s.setActiveDialog);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const dialogs = useChatStore((s) => s.dialogs);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingFriendRequest[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add contact
  const [addQuery, setAddQuery] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addMsg, setAddMsg] = useState('');

  // Action states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [contactsRes, requestsRes] = await Promise.all([
        getContacts(),
        getPendingRequests(),
      ]);
      setContacts(
        (contactsRes.data.contacts ?? [])
          .map(normalizeContact)
          .filter((c): c is Contact => c !== null)
      );
      setPendingRequests(requestsRes.data.requests ?? []);
    } catch {
      setError('Failed to load contacts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const setActionState = (id: string, state: boolean) => {
    setActionLoading((prev) => ({ ...prev, [id]: state }));
  };

  const handleSendRequest = async () => {
    if (!addQuery.trim()) return;
    setAddLoading(true);
    setAddMsg('');
    try {
      await sendFriendRequest(addQuery.trim());
      setAddMsg(`Friend request sent to @${addQuery.trim()}.`);
      setAddQuery('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to send friend request.';
      setAddMsg(msg);
    } finally {
      setAddLoading(false);
    }
  };

  const handleRespond = async (requestId: string, action: 'accept' | 'reject') => {
    setActionState(requestId, true);
    try {
      await respondToRequest(requestId, action);
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (action === 'accept') {
        await loadData();
      }
    } catch {
      setError('Failed to respond to request.');
    } finally {
      setActionState(requestId, false);
    }
  };

  const handleRemoveFriend = async (userId: string) => {
    setActionState(userId, true);
    try {
      await removeFriend(userId);
      setContacts((prev) => prev.filter((c) => c._id !== userId));
    } catch {
      setError('Failed to remove friend.');
    } finally {
      setActionState(userId, false);
    }
  };

  const handleBanUser = async (contact: Contact) => {
    setActionState(contact._id, true);
    try {
      await banUser(contact._id);
      setContacts((prev) => prev.filter((c) => c._id !== contact._id));
      setBannedUsers((prev) => [...prev, contact]);
    } catch {
      setError('Failed to ban user.');
    } finally {
      setActionState(contact._id, false);
    }
  };

  const handleUnban = async (userId: string) => {
    setActionState(userId, true);
    try {
      await unbanUser(userId);
      setBannedUsers((prev) => prev.filter((u) => u._id !== userId));
    } catch {
      setError('Failed to unban user.');
    } finally {
      setActionState(userId, false);
    }
  };

  const getDialogUnread = (contact: Contact): number => {
    const dialog = findDialogWithUser(dialogs, contact._id);
    if (!dialog) return 0;
    const dialogId = getDialogRecordId(dialog);
    return unreadCounts[dialogId] ?? 0;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <header className="h-14 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z" />
            </svg>
          </div>
          <span className="font-bold text-white text-sm">Cyphrax</span>
        </Link>
        <span className="text-gray-500 text-sm">/</span>
        <span className="text-sm text-gray-300">Contacts</span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {error && (
          <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Add contact */}
        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-3">Add contact</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendRequest()}
              placeholder="Search by username"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleSendRequest}
              disabled={addLoading || !addQuery.trim()}
              className="shrink-0 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {addLoading ? 'Sending…' : 'Send request'}
            </button>
          </div>
          {addMsg && (
            <p className={`text-xs mt-2 ${addMsg.startsWith('Failed') || addMsg.includes('error') ? 'text-red-400' : 'text-green-400'}`}>
              {addMsg}
            </p>
          )}
        </section>

        {/* Pending requests */}
        {pendingRequests.length > 0 && (
          <section className="bg-gray-900 border border-amber-700/40 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-white mb-3">
              Pending requests
              <span className="ml-2 text-xs bg-amber-600/30 text-amber-400 px-1.5 py-0.5 rounded">
                {pendingRequests.length}
              </span>
            </h2>
            <div className="space-y-2">
              {pendingRequests.map((req) => (
                <div key={req.id} className="flex items-center gap-3 py-2 px-3 bg-gray-800 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">@{req.fromUser.username}</p>
                    {req.message && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">"{req.message}"</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => handleRespond(req.id, 'accept')}
                      disabled={actionLoading[req.id]}
                      className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleRespond(req.id, 'reject')}
                      disabled={actionLoading[req.id]}
                      className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 rounded-lg transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Friends list */}
        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-3">
            Friends
            {contacts.length > 0 && (
              <span className="ml-2 text-xs text-gray-500">({contacts.length})</span>
            )}
          </h2>
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No friends yet. Send a request above.</p>
          ) : (
            <div className="space-y-1">
              {contacts.map((contact) => {
                const unread = getDialogUnread(contact);
                return (
                  <div
                    key={contact._id}
                    className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-gray-800 transition-colors"
                  >
                    <PresenceDot status={getStatus(contact._id)} />
                    <span className="text-sm text-gray-200 flex-1 truncate">@{contact.username}</span>
                    {unread > 0 && (
                      <span className="shrink-0 bg-amber-500 text-black text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                    <div className="flex gap-1.5">
                      <Link
                        to="/"
                        onClick={() => setActiveDialog(contact._id)}
                        className="text-xs px-2 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 transition-colors"
                      >
                        Message
                      </Link>
                      <button
                        onClick={() => handleRemoveFriend(contact._id)}
                        disabled={actionLoading[contact._id]}
                        className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 transition-colors"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => handleBanUser(contact)}
                        disabled={actionLoading[contact._id]}
                        className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 disabled:opacity-50 transition-colors"
                      >
                        Ban
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Banned users */}
        {bannedUsers.length > 0 && (
          <section className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-white mb-3">Banned users</h2>
            <div className="space-y-1">
              {bannedUsers.map((user) => (
                <div key={user._id} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-gray-800 transition-colors">
                  <span className="text-sm text-gray-400 flex-1 truncate">@{user.username}</span>
                  <button
                    onClick={() => handleUnban(user._id)}
                    disabled={actionLoading[user._id]}
                    className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading[user._id] ? '…' : 'Unban'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div>
          <Link to="/" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to chat
          </Link>
        </div>
      </main>
    </div>
  );
}
