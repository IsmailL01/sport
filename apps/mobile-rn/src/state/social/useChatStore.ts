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
  sendText: (chatId: string, senderId: string, text: string, replyToMessageId?: string | null) => Promise<Message | null>;

  /** Отправить image. Caller сначала зовёт mediaUpload.uploadImage. */
  sendImage: (chatId: string, senderId: string, params: {
    mediaId: string;
    localUri: string;
    mime: string;
    width: number | null;
    height: number | null;
    caption?: string | null;
  }) => Promise<Message | null>;

  /** Применить incoming event от RealtimeAdapter. */
  applyIncoming: (e: {
    messageId: string; clientMsgId: string; conversationId: string;
    senderId: string; kind: string; body: string | null; createdAt: number;
  }) => void;

  applyDeleted: (messageId: string, deletedBy: string) => void;

  /** Применить server event message.edited. */
  applyEdited: (messageId: string, body: string, editedAt: number) => void;

  /** Применить server event reaction.added/removed. */
  applyReaction: (messageId: string, userId: string, emoji: string, removed: boolean, ts: number) => void;

  /** Toggle (add если не было, remove если было) реакцию текущего user. */
  toggleReaction: (messageId: string, myUserId: string, emoji: string) => Promise<void>;

  /** Редактировать своё сообщение. */
  editMessage: (messageId: string, newText: string) => Promise<boolean>;

  /** Удалить сообщение (своё или чужое если admin/moderator). */
  deleteMessage: (messageId: string) => Promise<boolean>;
};

type ServerReaction = { userId: string; emoji: string; createdAt: number };
type ServerReplyPreview = {
  messageId: string; senderId: string;
  body: string | null; kind: string; deleted: boolean;
};

type ServerMessage = {
  id: string; conversationId: string; senderId: string; clientMsgId: string;
  kind: string; body: string | null; replyToId: string | null;
  replyPreview?: ServerReplyPreview | null;
  reactions?: ServerReaction[];
  mediaId?: string | null;
  mediaMime?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  editedAt?: number | null; deletedAt?: number | null; createdAt: number;
};

function fromServer(s: ServerMessage): Message {
  return {
    id: s.id, clientId: s.clientMsgId, chatId: s.conversationId,
    senderId: s.senderId, kind: s.kind as Message['kind'],
    text: s.body,
    mediaLocalUri: null,
    // mediaRemoteUrl на момент fromServer не известен — fetch отдельно
    // через fetchMediaURL(mediaId) когда bubble рендерит media (TTL 1h).
    mediaRemoteUrl: null,
    mediaId: s.mediaId ?? null,
    mediaMime: s.mediaMime ?? null,
    mediaWidth: s.mediaWidth ?? null,
    mediaHeight: s.mediaHeight ?? null,
    mediaDurationS: null,
    replyToMessageId: s.replyToId,
    replyPreview: s.replyPreview ? {
      messageId: s.replyPreview.messageId,
      senderId: s.replyPreview.senderId,
      body: s.replyPreview.body,
      kind: s.replyPreview.kind,
      deleted: s.replyPreview.deleted,
    } : null,
    reactions: (s.reactions ?? []).map((r) => ({
      userId: r.userId, emoji: r.emoji, ts: r.createdAt,
    })),
    status: 'sent',
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

  sendText: async (chatId, senderId, text, replyToMessageId) => {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    const clientId = uuid();
    const now = Date.now();
    // Если есть replyTo — снэпшот reply target из текущего messages.
    let replyPreview: Message['replyPreview'] = null;
    if (replyToMessageId) {
      const target = get().messages.find((m) => m.id === replyToMessageId);
      if (target !== undefined) {
        const body = target.text ?? null;
        replyPreview = {
          messageId: target.id,
          senderId: target.senderId,
          body: body !== null && body.length > 80 ? body.slice(0, 77) + '...' : body,
          kind: target.kind,
          deleted: target.isDeleted,
        };
      }
    }
    const optimistic: Message = {
      id: clientId, clientId, chatId, senderId,
      kind: 'text', text: trimmed,
      mediaLocalUri: null, mediaRemoteUrl: null,
      mediaId: null, mediaMime: null,
      mediaWidth: null, mediaHeight: null, mediaDurationS: null,
      replyToMessageId: replyToMessageId ?? null, replyPreview,
      reactions: [],
      status: 'pending', isDeleted: false, deletedBy: null,
      createdAt: now, editedAt: null, attempts: 0,
    };
    upsertMessage(optimistic);
    set((s) => s.activeChatId === chatId
      ? { messages: [optimistic, ...s.messages] }
      : {});
    return optimistic;
  },

  sendImage: async (chatId, senderId, params) => {
    const clientId = uuid();
    const now = Date.now();
    const kind: Message['kind'] = params.mime.startsWith('video/') ? 'video' : 'image';
    const optimistic: Message = {
      id: clientId, clientId, chatId, senderId,
      kind, text: params.caption ?? null,
      mediaLocalUri: params.localUri,
      mediaRemoteUrl: null,
      mediaId: params.mediaId, mediaMime: params.mime,
      mediaWidth: params.width, mediaHeight: params.height,
      mediaDurationS: null,
      replyToMessageId: null, replyPreview: null,
      reactions: [],
      status: 'pending', isDeleted: false, deletedBy: null,
      createdAt: now, editedAt: null, attempts: 0,
    };
    upsertMessage(optimistic);
    set((s) => s.activeChatId === chatId
      ? { messages: [optimistic, ...s.messages] }
      : {});

    // POST на server. mediaId уже uploaded.
    try {
      const resp = await apiClient.api(`/conversations/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          clientMsgId: clientId,
          kind,
          mediaId: params.mediaId,
          body: params.caption ?? null,
        }),
      });
      if (!resp.ok) {
        // Failed — пометить optimistic как failed.
        set((s) => ({
          messages: s.messages.map((m) => m.clientId === clientId
            ? { ...m, status: 'failed' as const } : m),
        }));
        return null;
      }
      const data = (await resp.json()) as { id: string };
      // Update optimistic с server id.
      const updated: Message = {
        ...optimistic, id: data.id, status: 'sent',
      };
      upsertMessage(updated);
      set((s) => ({
        messages: s.messages.map((m) => m.clientId === clientId ? updated : m),
      }));
      return updated;
    } catch (e) {
      console.warn('[chat] sendImage failed', e);
      set((s) => ({
        messages: s.messages.map((m) => m.clientId === clientId
          ? { ...m, status: 'failed' as const } : m),
      }));
      return null;
    }
  },

  applyEdited: (messageId, body, editedAt) => {
    const cur = listMessagesByChat(get().activeChatId ?? '', null, 200);
    const found = cur.find((m) => m.id === messageId);
    if (found !== undefined) {
      const updated: Message = { ...found, text: body, editedAt };
      upsertMessage(updated);
    }
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, text: body, editedAt } : m,
      ),
    }));
  },

  applyReaction: (messageId, userId, emoji, removed, ts) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId) return m;
        let next = m.reactions;
        if (removed) {
          next = next.filter((r) => !(r.userId === userId && r.emoji === emoji));
        } else {
          if (!next.some((r) => r.userId === userId && r.emoji === emoji)) {
            next = [...next, { userId, emoji, ts }];
          }
        }
        const updated = { ...m, reactions: next };
        upsertMessage(updated);
        return updated;
      }),
    }));
  },

  toggleReaction: async (messageId, myUserId, emoji) => {
    const msg = get().messages.find((m) => m.id === messageId);
    const haveIt = msg?.reactions.some((r) => r.userId === myUserId && r.emoji === emoji) ?? false;

    // Optimistic update.
    get().applyReaction(messageId, myUserId, emoji, haveIt, Date.now());

    try {
      const resp = haveIt
        ? await apiClient.api(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' })
        : await apiClient.api(`/messages/${messageId}/reactions`, {
            method: 'POST',
            body: JSON.stringify({ emoji }),
          });
      if (!resp.ok) {
        // Откат если сервер отверг.
        get().applyReaction(messageId, myUserId, emoji, !haveIt, Date.now());
      }
    } catch (e) {
      console.warn('[chat] toggleReaction failed', e);
      get().applyReaction(messageId, myUserId, emoji, !haveIt, Date.now());
    }
  },

  editMessage: async (messageId, newText) => {
    const trimmed = newText.trim();
    if (trimmed === '') return false;
    try {
      const resp = await apiClient.api(`/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: trimmed }),
      });
      if (!resp.ok) return false;
      const data = (await resp.json()) as { editedAt: number };
      get().applyEdited(messageId, trimmed, data.editedAt);
      return true;
    } catch (e) {
      console.warn('[chat] edit failed', e);
      return false;
    }
  },

  deleteMessage: async (messageId) => {
    try {
      const resp = await apiClient.api(`/messages/${messageId}`, { method: 'DELETE' });
      if (resp.ok) {
        // Local mark deleted.
        set((s) => ({
          messages: s.messages.map((m) => m.id === messageId
            ? { ...m, isDeleted: true } : m),
        }));
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[chat] delete failed', e);
      return false;
    }
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
        mediaId: null, mediaMime: null,
        mediaWidth: null, mediaHeight: null, mediaDurationS: null,
        replyToMessageId: null, replyPreview: null, reactions: [],
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
