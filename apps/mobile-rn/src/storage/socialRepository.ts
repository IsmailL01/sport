// Repositories для social (chats, messages, users-cache).
// Phase 8 / A5.

import type {
  Chat, ChatRole, ChatType, DeliveryStatus, Message, MessageKind, SocialUser, UserId,
} from '../domain/social';
import { getDatabase } from './database';

// ============================================================================
// social_users (cache profiles)
// ============================================================================

type UserRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_blocked: number;
  followers_count: number;
  following_count: number;
};

function rowToUser(r: UserRow): SocialUser {
  return {
    id: r.id,
    displayName: r.display_name,
    username: r.username,
    avatarUrl: r.avatar_url,
    bio: r.bio,
    isBlocked: r.is_blocked === 1,
    followersCount: r.followers_count,
    followingCount: r.following_count,
  };
}

export function upsertUser(u: SocialUser): void {
  const db = getDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO social_users
     (id, display_name, username, avatar_url, bio, is_blocked,
      followers_count, following_count, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      u.id, u.displayName, u.username, u.avatarUrl, u.bio,
      u.isBlocked ? 1 : 0, u.followersCount, u.followingCount, Date.now(),
    ],
  );
}

export function getUser(userId: UserId): SocialUser | null {
  const db = getDatabase();
  const row = db.getFirstSync<UserRow>(
    `SELECT id, display_name, username, avatar_url, bio, is_blocked,
            followers_count, following_count
     FROM social_users WHERE id = ?`,
    [userId],
  );
  return row ? rowToUser(row) : null;
}

export function bulkGetUsers(ids: UserId[]): SocialUser[] {
  if (ids.length === 0) return [];
  const db = getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.getAllSync<UserRow>(
    `SELECT id, display_name, username, avatar_url, bio, is_blocked,
            followers_count, following_count
     FROM social_users WHERE id IN (${placeholders})`,
    ids,
  );
  return rows.map(rowToUser);
}

// ============================================================================
// chats
// ============================================================================

type ChatRow = {
  id: string;
  client_id: string;
  type: string;
  title: string | null;
  avatar_url: string | null;
  my_role: string;
  members_count: number;
  peer_user_id: string | null;
  last_message_id: string | null;
  last_message_text: string | null;
  last_message_sender_id: string | null;
  last_message_ts: number | null;
  last_read_message_id: string | null;
  unread_count: number;
  muted: number;
  created_at: number;
  updated_at: number;
};

function rowToChat(r: ChatRow): Chat {
  let lastMessage: Chat['lastMessage'] = null;
  if (r.last_message_id !== null && r.last_message_ts !== null && r.last_message_sender_id !== null) {
    lastMessage = {
      id: r.last_message_id,
      text: r.last_message_text,
      senderId: r.last_message_sender_id,
      ts: r.last_message_ts,
    };
  }
  return {
    id: r.id, clientId: r.client_id,
    type: r.type as ChatType, title: r.title, avatarUrl: r.avatar_url,
    myRole: r.my_role as ChatRole, membersCount: r.members_count,
    peerUserId: r.peer_user_id,
    lastMessage,
    lastReadMessageId: r.last_read_message_id,
    unreadCount: r.unread_count, muted: r.muted === 1,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function upsertChat(c: Chat): void {
  const db = getDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO chats
     (id, client_id, type, title, avatar_url, my_role, members_count,
      peer_user_id,
      last_message_id, last_message_text, last_message_sender_id, last_message_ts,
      last_read_message_id, unread_count, muted,
      created_at, updated_at, synced_at, server_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.id, c.clientId, c.type, c.title, c.avatarUrl, c.myRole, c.membersCount,
      c.peerUserId,
      c.lastMessage?.id ?? null,
      c.lastMessage?.text ?? null,
      c.lastMessage?.senderId ?? null,
      c.lastMessage?.ts ?? null,
      c.lastReadMessageId,
      c.unreadCount, c.muted ? 1 : 0,
      c.createdAt, c.updatedAt, Date.now(), c.id, // synced_at = now, server_id = c.id
    ],
  );
}

export function listChats(): Chat[] {
  const db = getDatabase();
  const rows = db.getAllSync<ChatRow>(
    `SELECT id, client_id, type, title, avatar_url, my_role, members_count,
            peer_user_id, last_message_id, last_message_text, last_message_sender_id,
            last_message_ts, last_read_message_id, unread_count, muted,
            created_at, updated_at
     FROM chats ORDER BY last_message_ts DESC NULLS LAST`,
  );
  return rows.map(rowToChat);
}

export function getChat(chatId: string): Chat | null {
  const db = getDatabase();
  const row = db.getFirstSync<ChatRow>(
    `SELECT id, client_id, type, title, avatar_url, my_role, members_count,
            peer_user_id, last_message_id, last_message_text, last_message_sender_id,
            last_message_ts, last_read_message_id, unread_count, muted,
            created_at, updated_at
     FROM chats WHERE id = ?`,
    [chatId],
  );
  return row ? rowToChat(row) : null;
}

export function updateChatLastMessage(chatId: string, msg: NonNullable<Chat['lastMessage']>): void {
  const db = getDatabase();
  db.runSync(
    `UPDATE chats SET last_message_id=?, last_message_text=?,
       last_message_sender_id=?, last_message_ts=?,
       updated_at=?
     WHERE id=?`,
    [msg.id, msg.text, msg.senderId, msg.ts, Date.now(), chatId],
  );
}

export function bumpUnread(chatId: string, by = 1): void {
  const db = getDatabase();
  db.runSync(`UPDATE chats SET unread_count = unread_count + ? WHERE id = ?`, [by, chatId]);
}

export function clearUnread(chatId: string, lastReadMessageId: string): void {
  const db = getDatabase();
  db.runSync(
    `UPDATE chats SET unread_count=0, last_read_message_id=? WHERE id=?`,
    [lastReadMessageId, chatId],
  );
}

// ============================================================================
// messages
// ============================================================================

type MessageRow = {
  id: string;
  client_id: string;
  chat_id: string;
  sender_id: string;
  kind: string;
  text: string | null;
  media_local_uri: string | null;
  media_remote_url: string | null;
  media_width: number | null;
  media_height: number | null;
  media_duration_s: number | null;
  reply_to_message_id: string | null;
  status: string;
  is_deleted: number;
  deleted_by: string | null;
  reactions_json: string | null;
  created_at: number;
  edited_at: number | null;
  attempts: number;
};

function rowToMessage(r: MessageRow): Message {
  let reactions: Message['reactions'] = [];
  if (r.reactions_json) {
    try { reactions = JSON.parse(r.reactions_json); } catch { /* malformed, ignore */ }
  }
  return {
    id: r.id, clientId: r.client_id, chatId: r.chat_id, senderId: r.sender_id,
    kind: r.kind as MessageKind, text: r.text,
    mediaLocalUri: r.media_local_uri, mediaRemoteUrl: r.media_remote_url,
    mediaWidth: r.media_width, mediaHeight: r.media_height,
    mediaDurationS: r.media_duration_s,
    replyToMessageId: r.reply_to_message_id,
    reactions,
    status: r.status as DeliveryStatus,
    isDeleted: r.is_deleted === 1, deletedBy: r.deleted_by,
    createdAt: r.created_at, editedAt: r.edited_at,
    attempts: r.attempts,
  };
}

export function upsertMessage(m: Message): void {
  const db = getDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO messages
     (id, client_id, chat_id, sender_id, kind, text,
      media_local_uri, media_remote_url, media_width, media_height, media_duration_s,
      reply_to_message_id, status, is_deleted, deleted_by, reactions_json,
      created_at, edited_at, attempts, synced_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.id, m.clientId, m.chatId, m.senderId, m.kind, m.text,
      m.mediaLocalUri, m.mediaRemoteUrl, m.mediaWidth, m.mediaHeight, m.mediaDurationS,
      m.replyToMessageId, m.status, m.isDeleted ? 1 : 0, m.deletedBy,
      JSON.stringify(m.reactions), m.createdAt, m.editedAt, m.attempts,
      m.status === 'pending' || m.status === 'failed' ? null : Date.now(), Date.now(),
    ],
  );
}

export function listMessagesByChat(chatId: string, before: number | null, limit = 50): Message[] {
  const db = getDatabase();
  const rows = before !== null
    ? db.getAllSync<MessageRow>(
        `SELECT * FROM messages WHERE chat_id=? AND created_at < ?
         ORDER BY created_at DESC LIMIT ?`,
        [chatId, before, limit])
    : db.getAllSync<MessageRow>(
        `SELECT * FROM messages WHERE chat_id=? ORDER BY created_at DESC LIMIT ?`,
        [chatId, limit]);
  return rows.map(rowToMessage);
}

export function getMessageByClientId(clientId: string): Message | null {
  const db = getDatabase();
  const row = db.getFirstSync<MessageRow>(
    `SELECT * FROM messages WHERE client_id = ?`, [clientId],
  );
  return row ? rowToMessage(row) : null;
}

export function getMessageById(id: string): Message | null {
  const db = getDatabase();
  const row = db.getFirstSync<MessageRow>(
    `SELECT * FROM messages WHERE id = ?`, [id],
  );
  return row ? rowToMessage(row) : null;
}

/** Pending-в-outbox сообщения, для runMessagesPush(). */
export function listPendingMessages(): Message[] {
  const db = getDatabase();
  const rows = db.getAllSync<MessageRow>(
    `SELECT * FROM messages
     WHERE status IN ('pending','failed') AND attempts < 5
     ORDER BY created_at ASC LIMIT 100`,
  );
  return rows.map(rowToMessage);
}

export function markMessageSent(clientId: string, serverID: string, status: DeliveryStatus = 'sent'): void {
  const db = getDatabase();
  db.runSync(
    `UPDATE messages SET id=?, status=?, synced_at=?, updated_at=? WHERE client_id=?`,
    [serverID, status, Date.now(), Date.now(), clientId],
  );
}

export function markMessageFailed(clientId: string): void {
  const db = getDatabase();
  db.runSync(
    `UPDATE messages SET status='failed', attempts=attempts+1, updated_at=? WHERE client_id=?`,
    [Date.now(), clientId],
  );
}

export function softDeleteMessage(messageId: string, by: UserId): void {
  const db = getDatabase();
  db.runSync(
    `UPDATE messages SET is_deleted=1, deleted_by=?, updated_at=? WHERE id=?`,
    [by, Date.now(), messageId],
  );
}

// ============================================================================
// sync_cursors
// ============================================================================

export function getSyncCursor(key: string): string | null {
  const db = getDatabase();
  const row = db.getFirstSync<{ cursor: string }>(
    `SELECT cursor FROM sync_cursors WHERE key = ?`, [key],
  );
  return row?.cursor ?? null;
}

export function setSyncCursor(key: string, cursor: string): void {
  const db = getDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO sync_cursors (key, cursor, updated_at) VALUES (?, ?, ?)`,
    [key, cursor, Date.now()],
  );
}
