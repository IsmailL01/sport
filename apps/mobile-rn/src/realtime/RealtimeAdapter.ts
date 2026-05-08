// RealtimeAdapter — interface для WebSocket / SSE / mock real-time delivery.
// Phase 8 / A5.

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/** События которые приходят с сервера (NATS payload через realtime-gw). */
export type RealtimeEvent =
  | { event: 'message.new'; messageId: string; conversationId: string;
      senderId: string; clientMsgId: string; kind: string;
      body: string | null; replyToId: string | null; createdAt: string }
  | { event: 'message.deleted'; messageId: string; conversationId: string; deletedBy: string }
  | { event: 'message.edited'; messageId: string; body: string; editedAt: string }
  | { event: 'read.updated'; chatId: string; userId: string; lastReadMessageId: string }
  // Phase D realtime: лайки/комменты к моим постам.
  | { event: 'feed.post.liked'; postId: string; authorId: string; userId: string }
  | { event: 'feed.post.commented';
      postId: string; commentId: string;
      postAuthorId: string; commenterId: string;
      body?: string | null }
  | { event: string; [k: string]: unknown }; // catch-all для будущих типов

export type RealtimeListener = (e: RealtimeEvent) => void;
export type StatusListener = (s: RealtimeStatus) => void;

export interface RealtimeAdapter {
  /** Подключиться. accessToken — JWT, deviceID — стабильный uuid этого устройства. */
  connect(accessToken: string, deviceID: string): Promise<void>;

  /** Закрыть соединение. */
  disconnect(): void;

  isConnected(): boolean;

  /** Отправить frame в обратную сторону (typing / ack). MVP — игнорируется сервером. */
  send(payload: unknown): void;

  /** Подписаться на события. Возвращает unsubscribe. */
  on(listener: RealtimeListener): () => void;

  /** Подписаться на статус. */
  onStatus(listener: StatusListener): () => void;
}
