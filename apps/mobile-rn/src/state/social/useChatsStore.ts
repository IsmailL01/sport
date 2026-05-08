// Список чатов с last_message preview и unread counts.
// Phase 8 / A5.

import { create } from 'zustand';

import { apiClient } from '../../auth/apiClient';
import type { Chat } from '../../domain/social';
import {
  bumpUnread, clearUnread, getChat, listChats, upsertChat, upsertUser,
} from '../../storage/socialRepository';

type ChatsStore = {
  chats: Chat[];
  loading: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  /** Создать или найти DM с peer; возвращает chat. */
  createOrFindDM: (peerUserId: string) => Promise<Chat | null>;
  /** Создать group с title и memberIds (creator = owner). */
  createGroup: (title: string, memberIds: string[]) => Promise<Chat | null>;

  /** Вызов из realtime listener при получении message.new — обновить last_message + bump unread. */
  applyIncomingMessage: (e: {
    messageId: string; conversationId: string; senderId: string;
    body: string | null; createdAt: number;
  }, myUserId: string) => void;

  markRead: (chatId: string, lastReadMessageId: string) => Promise<void>;
};

type ServerChat = {
  id: string;
  type: 'dm' | 'group';
  title?: string | null;
  avatarMediaId?: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  lastMessageAt?: number | null;
  myRole?: string;
  membersCount?: number;
  unreadCount?: number;
  muted?: boolean;
  lastMessage?: {
    id: string; body: string | null; senderId: string; createdAt: number;
  } | null;
};

function fromServer(s: ServerChat, peerUserId: string | null = null): Chat {
  return {
    id: s.id, clientId: s.id,
    type: s.type, title: s.title ?? null, avatarUrl: null,
    myRole: (s.myRole ?? 'member') as Chat['myRole'],
    membersCount: s.membersCount ?? 2,
    peerUserId,
    lastMessage: s.lastMessage ? {
      id: s.lastMessage.id, text: s.lastMessage.body,
      senderId: s.lastMessage.senderId, ts: s.lastMessage.createdAt,
    } : null,
    lastReadMessageId: null,
    unreadCount: s.unreadCount ?? 0, muted: s.muted ?? false,
    createdAt: s.createdAt, updatedAt: s.updatedAt,
  };
}

export const useChatsStore = create<ChatsStore>((set, get) => ({
  chats: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      // 1) Подгружаем кэш из SQLite сразу — UI сразу показывает.
      const cached = listChats();
      set({ chats: cached });

      // 2) Если онлайн — fetch с сервера и пересохраняем.
      if (apiClient.isAuthenticated()) {
        const resp = await apiClient.api('/conversations');
        if (resp.ok) {
          const arr = (await resp.json()) as ServerChat[];
          for (const s of arr) {
            const local = getChat(s.id);
            const peer = local?.peerUserId ?? null;
            const c = fromServer(s, peer);
            upsertChat(c);
          }
          set({ chats: listChats() });
        }
      }
      set({ loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error)?.message ?? String(e) });
    }
  },

  createOrFindDM: async (peerUserId) => {
    if (!apiClient.isAuthenticated()) return null;
    try {
      const resp = await apiClient.api('/conversations', {
        method: 'POST',
        body: JSON.stringify({ type: 'dm', peerId: peerUserId }),
      });
      if (!resp.ok) return null;
      const s = (await resp.json()) as ServerChat;
      const c = fromServer(s, peerUserId);
      upsertChat(c);
      // Подтянем профиль peer-а в кэш если нет.
      try {
        const pResp = await apiClient.api(`/profiles/${peerUserId}`);
        if (pResp.ok) {
          const p = await pResp.json();
          upsertUser({
            id: p.userId, displayName: p.displayName ?? null, username: p.username ?? null,
            avatarUrl: null, bio: p.bio ?? null, isBlocked: false,
            followersCount: p.followersCount ?? 0, followingCount: p.followingCount ?? 0,
          });
        }
      } catch { /* best effort */ }
      set({ chats: listChats() });
      return c;
    } catch (e) {
      console.warn('[chats] createOrFindDM failed', e);
      return null;
    }
  },

  createGroup: async (title, memberIds) => {
    if (!apiClient.isAuthenticated()) return null;
    if (title.trim() === '' || memberIds.length === 0) return null;
    try {
      const resp = await apiClient.api('/conversations', {
        method: 'POST',
        body: JSON.stringify({ type: 'group', title: title.trim(), memberIds }),
      });
      if (!resp.ok) return null;
      const s = (await resp.json()) as ServerChat;
      const c = fromServer(s);
      upsertChat(c);
      set({ chats: listChats() });
      return c;
    } catch (e) {
      console.warn('[chats] createGroup failed', e);
      return null;
    }
  },

  applyIncomingMessage: (e, myUserId) => {
    const chat = getChat(e.conversationId);
    if (!chat) return;
    // Update last_message
    chat.lastMessage = {
      id: e.messageId, text: e.body, senderId: e.senderId, ts: e.createdAt,
    };
    chat.updatedAt = Date.now();
    upsertChat(chat);
    // Bump unread только если sender ≠ я.
    if (e.senderId !== myUserId) bumpUnread(e.conversationId, 1);
    set({ chats: listChats() });
  },

  markRead: async (chatId, lastReadMessageId) => {
    clearUnread(chatId, lastReadMessageId);
    set({ chats: listChats() });
    // Best-effort POST на сервер.
    try {
      await apiClient.api(`/conversations/${chatId}/read`, {
        method: 'POST',
        body: JSON.stringify({ upToMessageId: lastReadMessageId }),
      });
    } catch (e) {
      console.warn('[chats] markRead remote failed', e);
    }
  },
}));
