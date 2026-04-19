import { useState, useEffect, useCallback } from 'react';
import { useChatStore } from '../../store/chat.store';
import { usePresence } from '../../hooks/usePresence';
import { useAuthStore } from '../../store/auth.store';
import { getContacts } from '../../api/contacts.api';
import { getPublicRooms, createRoom } from '../../api/rooms.api';
import { getDialogs } from '../../api/messages.api';
import type { Contact } from '../../api/contacts.api';
import type { Room, Dialog } from '../../store/chat.store';

type PresenceStatus = 'online' | 'afk' | 'offline';

function PresenceDot({ status }: { status: PresenceStatus }) {
  const colors: Record<PresenceStatus, string> = {
    online: 'bg-green-400',
    afk: 'bg-amber-400',
    offline: 'bg-gray-500',
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${colors[status]}`}
      title={status}
    />
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto shrink-0 bg-amber-500 text-black text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
      {count > 99 ? '99+' : count}
    </span>
  );
}

interface CreateRoomModalProps {
  onClose: () => void;
  onCreated: (room: Room) => void;
}

function CreateRoomModal({ onClose, onCreated }: CreateRoomModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await createRoom({ name: name.trim(), description: description.trim() || undefined, isPrivate });
      onCreated(data.room);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create room';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-white">Create Room</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && <p className="text-xs text-red-400 bg-red-900/30 rounded px-2 py-1">{error}</p>}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Room name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="general"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Optional description"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-300">Private room</span>
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm text-gray-400 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function LeftSidebar() {
  const { activeRoomId, activeDialogUserId, rooms, dialogs, unreadCounts, setRooms, setDialogs, setActiveRoom, setActiveDialog } = useChatStore();
  const currentUser = useAuthStore((s) => s.user);
  const { getStatus } = usePresence();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [publicExpanded, setPublicExpanded] = useState(true);
  const [privateExpanded, setPrivateExpanded] = useState(true);
  const [contactsExpanded, setContactsExpanded] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [roomsRes, dialogsRes, contactsRes] = await Promise.all([
        getPublicRooms({ page: 1 }),
        getDialogs(),
        getContacts(),
      ]);
      setRooms(roomsRes.data.rooms ?? []);
      setDialogs(dialogsRes.data.dialogs ?? []);
      setContacts(contactsRes.data.contacts ?? []);
    } catch {
      // Silently fail — user might not be fully loaded yet
    }
  }, [setRooms, setDialogs]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const safeRooms = rooms ?? [];
  const safeContacts = contacts ?? [];
  const publicRooms = safeRooms.filter((r) => !r.isPrivate && r.name.toLowerCase().includes(search.toLowerCase()));
  const privateRooms = safeRooms.filter((r) => r.isPrivate && r.name.toLowerCase().includes(search.toLowerCase()));
  const filteredContacts = safeContacts.filter((c) => c.username.toLowerCase().includes(search.toLowerCase()));

  const getDialogForContact = (contact: Contact): Dialog | undefined =>
    dialogs.find((d) => d.participants.includes(contact._id));

  const handleRoomClick = (room: Room) => {
    setActiveRoom(room._id);
  };

  const handleContactClick = (contact: Contact) => {
    setActiveDialog(contact._id);
  };

  const handleRoomCreated = (room: Room) => {
    setRooms([...(rooms ?? []), room]);
    setShowCreateModal(false);
    setActiveRoom(room._id);
  };

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-700 flex flex-col shrink-0 overflow-hidden">
      {/* Search */}
      <div className="p-3 border-b border-gray-700">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* ROOMS section */}
        <Section
          title="Public Rooms"
          expanded={publicExpanded}
          onToggle={() => setPublicExpanded((v) => !v)}
        >
          {publicRooms.map((room) => (
            <RoomRow
              key={room._id}
              room={room}
              active={activeRoomId === room._id}
              unread={unreadCounts[room._id] ?? 0}
              onClick={() => handleRoomClick(room)}
            />
          ))}
          {publicRooms.length === 0 && (
            <p className="px-3 py-1 text-xs text-gray-600">No rooms</p>
          )}
        </Section>

        <Section
          title="Private Rooms"
          expanded={privateExpanded}
          onToggle={() => setPrivateExpanded((v) => !v)}
        >
          {privateRooms.map((room) => (
            <RoomRow
              key={room._id}
              room={room}
              active={activeRoomId === room._id}
              unread={unreadCounts[room._id] ?? 0}
              onClick={() => handleRoomClick(room)}
            />
          ))}
          {privateRooms.length === 0 && (
            <p className="px-3 py-1 text-xs text-gray-600">No private rooms</p>
          )}
        </Section>

        {/* CONTACTS section */}
        <Section
          title="Contacts"
          expanded={contactsExpanded}
          onToggle={() => setContactsExpanded((v) => !v)}
        >
          {filteredContacts.map((contact) => {
            const dialog = getDialogForContact(contact);
            const dialogId = dialog?._id;
            const unread = dialogId ? (unreadCounts[dialogId] ?? 0) : 0;
            return (
              <button
                key={contact._id}
                onClick={() => handleContactClick(contact)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-lg mx-1 transition-colors ${
                  activeDialogUserId === contact._id
                    ? 'bg-blue-600/20 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <PresenceDot status={getStatus(contact._id)} />
                <span className="text-sm truncate flex-1">{contact.username}</span>
                {unread > 0 && <UnreadBadge count={unread} />}
              </button>
            );
          })}
          {filteredContacts.length === 0 && (
            <p className="px-3 py-1 text-xs text-gray-600">No contacts</p>
          )}
          {currentUser && (
            <p className="px-3 py-1 text-xs text-gray-600">You: {currentUser.username}</p>
          )}
        </Section>
      </div>

      {/* Create room button */}
      <div className="p-3 border-t border-gray-700">
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Room
        </button>
      </div>

      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleRoomCreated}
        />
      )}
    </aside>
  );
}

function Section({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-200 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {title}
      </button>
      {expanded && <div className="mt-0.5 space-y-0.5 px-1">{children}</div>}
    </div>
  );
}

function RoomRow({
  room,
  active,
  unread,
  onClick,
}: {
  room: Room;
  active: boolean;
  unread: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-lg transition-colors ${
        active ? 'bg-blue-600/20 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <span className="text-gray-500 text-sm shrink-0">#</span>
      <span className="text-sm truncate flex-1">{room.name}</span>
      {unread > 0 && <UnreadBadge count={unread} />}
    </button>
  );
}
