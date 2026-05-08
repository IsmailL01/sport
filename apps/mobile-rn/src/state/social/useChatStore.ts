// Активный чат: messages + send/loadOlder.
// Phase 8 / A5.

import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { create } from 'zustand';

import { apiClient } from '../../auth/apiClient';
import type { Message } from '../../domain/social';
import {
  getMessageByClientId, listMessagesByChat, upsertMessage,
} from '../../storage/socialRepository';

type ChatStore = {
  activeChatId: string | null;
  messages: Message[];          // descending by createdAt (для inverted FlatList)
  oldestLoadedTs: number | null;
  isLoadingOlder: boolean;

  open: (chatId: string) => Promise<void>;
  close: () => void;
  loadOlder: () => Promise<void>;

  /** Отправить текст. Создаёт оптимистичный message в outbox.  */
  sendText: (chatId: string, senderId: string, text: string) => Promise<Message | null>;

  /** Применить incoming event от RealtimeAdapter. */
  applyIncoming: (e: {
    messageId: string; clientMsgId: string; conversationId: string;
    senderId: string; kind: string; body: string | null; createdAt: number;
  }) => void;

  applyDeleted: (messageId: string, deletedBy: string) => void;
};

type ServerMessage = {
  id: string; conversationId: string; senderId: string; clientMsgId: string;
  kind: string; body: string | null; replyToId: string | null;
  editedAt?: number | null; deletedAt?: number | null; createdAt: number;
};

function fromServer(s: ServerMessage): Message {
  return {
    id: s.id, clientId: s.clientMsgId, chatId: s.conversationId,
    senderId: s.senderId, kind: s.kind as Message['kind'],
    text: s.body, mediaLocalUri: null, mediaRemoteUrl: null,
    mediaWidth: null, mediaHeight: null, mediaDurationS: null,
    replyToMessageId: s.replyToId,
    reactions: [], status: 'sent',
    isDeleted: s.deletedAt != null, deletedBy: null,
    createdAt: s.createdAt, editedAt: s.editedAt ?? null,
    attempts: 0,
  };
}

export const useChatStore = create<ChatStore>((set, get) => ({
  activeChatId: null,
  messages: [],
  oldestLoadedTs: null,
  isLoadingOlder: false,

  open: async (chatId) => {
    set({ activeChatId: chatId, messages: [], oldestLoadedTs: null });

    // 1) Local cache.
    const cached = listMessagesByChat(chatId, null, 50);
    if (cached.length > 0) {
      set({
        messages: cached,
        oldestLoadedTs: cached[cached.length - 1].createdAt,
      });
    }

    // 2) Pull свежие с сервера.
    if (!apiClient.isAuthenticated()) return;
    try {
      const resp = await apiClient.api(`/conversations/${chatId}/messages?limit=50`);
      if (!resp.ok) return;
      const arr = (await resp.json()) as ServerMessage[];
      for (const s of arr) {
        upsertMessage(fromServer(s));
      }
      const fresh = listMessagesByChat(chatId, null, 50);
      set({
        messages: fresh,
        oldestLoadedTs: fresh.length > 0 ? fresh[fresh.length - 1].createdAt : null,
      });
    } catch (e) {
      console.warn('[chat] open pull failed', e);
    }
  },

  close: () => {
    set({ activeChatId: null, messages: [], oldestLoadedTs: null });
  },

  loadOlder: async () => {
    const { activeChatId, oldestLoadedTs, isLoadingOlder } = get();
    if (activeChatId === null || isLoadingOlder) return;
    set({ isLoadingOlder: true });
    try {
      // Local first.
      const localOlder = oldestLoadedTs !== null
        ? listMessagesByChat(activeChatId, oldestLoadedTs, 50)
        : [];
      if (localOlder.length >= 50) {
        const merged = [...get().messages, ...localOlder];
        set({
          messages: merged,
          oldestLoadedTs: merged[merged.length - 1].createdAt,
        });
        return;
      }
      // Remote.
      if (oldestLoadedTs !== null && apiClient.isAuthenticated()) {
        const resp = await apiClient.api(
          `/conversations/${activeChatId}/messages?limit=50&beforeMs=${oldestLoadedTs}`,
        );
        if (resp.ok) {
          const arr = (await resp.json()) as ServerMessage[];
          for (const s of arr) upsertMessage(fromServer(s));
        }
      }
      const fresh = listMessagesByChat(activeChatId, null, 200);
      set({
        messages: fresh,
        oldestLoadedTs: fresh.length > 0 ? fresh[fresh.length - 1].createdAt : oldestLoadedTs,
      });
    } finally {
      set({ isLoadingOlder: false });
    }
  },

  sendText: async (chatId, senderId, text) => {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    const clientId = uuid();
    const now = Date.now();
    const optimistic: Message = {
      id: clientId, clientId, chatId, senderId,
      kind: 'text', text: trimmed,
      mediaLocalUri: null, mediaRemoteUrl: null,
      mediaWidth: null, mediaHeight: null, mediaDurationS: null,
      replyToMessageId: null, reactions: [],
      status: 'pending', isDeleted: false, deletedBy: null,
      createdAt: now, editedAt: null, attempts: 0,
    };
    upsertMessage(optimistic);
    // Update store сразу — UI увидит optimistic bubble.
    set((s) => s.activeChatId === chatId
      ? { messages: [optimistic, ...s.messages] }
      : {});
    return optimistic;
  },

  applyIncoming: (e) => {
    // Идемпотентно: если message с client_id уже есть — это echo нашего же
    // оптимистичного, обновляем server_id.
    const existing = getMessageByClientId(e.clientMsgId);
    if (existing !== null) {
      const updated: Message = {
        ...existing,
        id: e.messageId,
        status: existing.senderId === e.senderId ? 'sent' : 'delivered',
      };
      upsertMessage(updated);
    } else {
      const msg: Message = {
        id: e.messageId, clientId: e.clientMsgId, chatId: e.conversationId,
        senderId: e.senderId, kind: e.kind as Message['kind'],
        text: e.body, mediaLocalUri: null, mediaRemoteUrl: null,
        mediaWidth: null, mediaHeight: null, mediaDurationS: null,
        replyToMessageId: null, reactions: [],
        status: 'delivered', isDeleted: false, deletedBy: null,
        createdAt: e.createdAt, editedAt: null, attempts: 0,
      };
      upsertMessage(msg);
    }
    // Refresh active chat если открыт.
    const { activeChatId } = get();
    if (activeChatId === e.conversationId) {
      const fresh = listMessagesByChat(activeChatId, null, 200);
      set({ messages: fresh });
    }
  },

  applyDeleted: (messageId, deletedBy) => {
    const { activeChatId } = get();
    if (activeChatId === null) return;
    set({
      messages: get().messages.map((m) =>
        m.id === messageId
          ? { ...m, isDeleted: true, deletedBy }
          : m
      ),
    });
  },
}));
