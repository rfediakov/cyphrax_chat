import { create } from 'zustand';
import type { PendingInvitation } from '../api/rooms.api';
import type { PendingFriendRequest } from '../api/contacts.api';

export interface Message {
  _id: string;
  content: string;
  author: {
    _id: string;
    username: string;
  };
  roomId?: string;
  dialogId?: string;
  replyToId?: string;
  replyTo?: Message | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  _id: string;
  filename: string;
  mimetype: string;
  size: number;
  url: string;
}

export interface Room {
  _id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  owner: string;
  memberCount?: number;
  unreadCount?: number;
}

/** GET /dialogs returns `id` and `otherUser.id`; `participants` may be absent. */
export interface Dialog {
  _id?: string;
  id?: string;
  participants?: string[];
  otherUser: {
    _id?: string;
    id?: string;
    username: string;
  } | null;
  lastMessage?: Message | null;
  updatedAt: string;
}

interface ChatState {
  activeRoomId: string | null;
  activeDialogUserId: string | null;
  rooms: Room[];
  dialogs: Dialog[];
  messages: Record<string, Message[]>;
  unreadCounts: Record<string, number>;
  pendingInvitations: PendingInvitation[];
  pendingFriendRequests: PendingFriendRequest[];
  contactsRefreshToken: number;
  membersRefreshToken: number;

  setActiveRoom: (id: string | null) => void;
  setActiveDialog: (userId: string | null) => void;
  setRooms: (rooms: Room[]) => void;
  setDialogs: (dialogs: Dialog[]) => void;
  setPendingInvitations: (invitations: PendingInvitation[]) => void;
  addPendingInvitation: (inv: PendingInvitation) => void;
  removePendingInvitation: (invitationId: string) => void;
  setPendingFriendRequests: (requests: PendingFriendRequest[]) => void;
  addPendingFriendRequest: (req: PendingFriendRequest) => void;
  removePendingFriendRequest: (requestId: string) => void;
  bumpContactsRefresh: () => void;
  bumpMembersRefresh: () => void;
  appendMessage: (contextId: string, msg: Message) => void;
  prependMessages: (contextId: string, msgs: Message[]) => void;
  updateMessage: (contextId: string, msg: Message) => void;
  softDeleteMessage: (contextId: string, msgId: string) => void;
  incrementUnread: (contextId: string) => void;
  clearUnread: (contextId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeRoomId: null,
  activeDialogUserId: null,
  rooms: [],
  dialogs: [],
  messages: {},
  unreadCounts: {},
  pendingInvitations: [],
  pendingFriendRequests: [],
  contactsRefreshToken: 0,
  membersRefreshToken: 0,

  setActiveRoom: (id) =>
    set({ activeRoomId: id, activeDialogUserId: null }),

  setActiveDialog: (userId) =>
    set({ activeDialogUserId: userId, activeRoomId: null }),

  setRooms: (rooms) => set({ rooms }),

  setDialogs: (dialogs) => set({ dialogs }),

  setPendingInvitations: (invitations) => set({ pendingInvitations: invitations }),

  addPendingInvitation: (inv) =>
    set((state) => {
      if (state.pendingInvitations.some((i) => i.invitationId === inv.invitationId)) {
        return state;
      }
      return { pendingInvitations: [...state.pendingInvitations, inv] };
    }),

  removePendingInvitation: (invitationId) =>
    set((state) => ({
      pendingInvitations: state.pendingInvitations.filter((i) => i.invitationId !== invitationId),
    })),

  setPendingFriendRequests: (requests) => set({ pendingFriendRequests: requests }),

  addPendingFriendRequest: (req) =>
    set((state) => {
      if (state.pendingFriendRequests.some((r) => r.id === req.id)) return state;
      return { pendingFriendRequests: [...state.pendingFriendRequests, req] };
    }),

  removePendingFriendRequest: (requestId) =>
    set((state) => ({
      pendingFriendRequests: state.pendingFriendRequests.filter((r) => r.id !== requestId),
    })),

  bumpContactsRefresh: () =>
    set((state) => ({ contactsRefreshToken: state.contactsRefreshToken + 1 })),

  bumpMembersRefresh: () =>
    set((state) => ({ membersRefreshToken: state.membersRefreshToken + 1 })),

  appendMessage: (contextId, msg) =>
    set((state) => {
      const existing = state.messages[contextId] ?? [];
      if (existing.some((m) => m._id === msg._id)) {
        return state;
      }
      return {
        messages: {
          ...state.messages,
          [contextId]: [...existing, msg],
        },
      };
    }),

  prependMessages: (contextId, msgs) =>
    set((state) => {
      const existing = state.messages[contextId] ?? [];
      const existingIds = new Set(existing.map((m) => m._id));
      const older = msgs.filter((m) => !existingIds.has(m._id));
      if (older.length === 0) {
        return state;
      }
      return {
        messages: {
          ...state.messages,
          [contextId]: [...older, ...existing],
        },
      };
    }),

  updateMessage: (contextId, msg) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [contextId]: (state.messages[contextId] ?? []).map((m) =>
          m._id === msg._id ? msg : m
        ),
      },
    })),

  softDeleteMessage: (contextId, msgId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [contextId]: (state.messages[contextId] ?? []).map((m) =>
          m._id === msgId
            ? { ...m, deletedAt: new Date().toISOString(), content: '[deleted]' }
            : m
        ),
      },
    })),

  incrementUnread: (contextId) =>
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [contextId]: (state.unreadCounts[contextId] ?? 0) + 1,
      },
    })),

  clearUnread: (contextId) =>
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [contextId]: 0,
      },
    })),
}));
