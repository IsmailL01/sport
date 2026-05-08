// Real-time WebSocket lifecycle store.
// Phase 8 / A5.

import { create } from 'zustand';

import { getRealtimeAdapter } from '../../realtime';
import type { RealtimeEvent, RealtimeStatus } from '../../realtime/RealtimeAdapter';
import { useChatStore } from './useChatStore';
import { useChatsStore } from './useChatsStore';

type RealtimeStore = {
  status: RealtimeStatus;
  lastEventAt: number | null;
  myUserId: string | null;

  /** Подключиться. Идемпотентен. */
  connect: (myUserId: string, accessToken: string, deviceID: string) => Promise<void>;
  disconnect: () => void;
};

let unsubEvents: (() => void) | null = null;
let unsubStatus: (() => void) | null = null;

export const useRealtimeStore = create<RealtimeStore>((set, get) => ({
  status: 'idle',
  lastEventAt: null,
  myUserId: null,

  connect: async (myUserId, accessToken, deviceID) => {
    const adapter = getRealtimeAdapter();
    // Уже подключены? (idempotency)
    if (adapter.isConnected() && get().myUserId === myUserId) return;

    set({ myUserId });

    if (unsubStatus !== null) unsubStatus();
    unsubStatus = adapter.onStatus((s) => set({ status: s }));

    if (unsubEvents !== null) unsubEvents();
    unsubEvents = adapter.on((e: RealtimeEvent) => {
      set({ lastEventAt: Date.now() });
      switch (e.event) {
        case 'message.new': {
          const ev = e as Extract<RealtimeEvent, { event: 'message.new' }>;
          const createdAt = typeof ev.createdAt === 'string'
            ? Date.parse(ev.createdAt) : Number(ev.createdAt);
          // 1) Apply в активный чат.
          useChatStore.getState().applyIncoming({
            messageId: ev.messageId, clientMsgId: ev.clientMsgId,
            conversationId: ev.conversationId, senderId: ev.senderId,
            kind: ev.kind, body: ev.body, createdAt,
          });
          // 2) Bump в списке чатов + обновить last_message.
          useChatsStore.getState().applyIncomingMessage({
            messageId: ev.messageId, conversationId: ev.conversationId,
            senderId: ev.senderId, body: ev.body, createdAt,
          }, myUserId);
          break;
        }
        case 'message.deleted': {
          const ev = e as Extract<RealtimeEvent, { event: 'message.deleted' }>;
          useChatStore.getState().applyDeleted(ev.messageId, ev.deletedBy);
          break;
        }
        case 'message.edited': {
          const ev = e as { messageId: string; body: string; editedAt: string | number };
          const editedAt = typeof ev.editedAt === 'string' ? Date.parse(ev.editedAt) : Number(ev.editedAt);
          useChatStore.getState().applyEdited(ev.messageId, ev.body, editedAt);
          break;
        }
        case 'reaction.added':
        case 'reaction.removed': {
          const ev = e as { messageId: string; userId: string; emoji: string; event: string };
          useChatStore.getState().applyReaction(
            ev.messageId, ev.userId, ev.emoji,
            ev.event === 'reaction.removed', Date.now(),
          );
          break;
        }
      }
    });

    await adapter.connect(accessToken, deviceID);
  },

  disconnect: () => {
    if (unsubEvents !== null) { unsubEvents(); unsubEvents = null; }
    if (unsubStatus !== null) { unsubStatus(); unsubStatus = null; }
    getRealtimeAdapter().disconnect();
    set({ status: 'idle', myUserId: null });
  },
}));
