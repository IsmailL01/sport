// Social domain: User, Chat, Message, Roles.
// Phase 8 / A5.

export type UserId = string;

export type SocialUser = {
  id: UserId;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isBlocked: boolean;
  followersCount: number;
  followingCount: number;
};

export type ChatType = 'dm' | 'group';
export type ChatRole = 'owner' | 'admin' | 'moderator' | 'member' | 'restricted';

export type Chat = {
  /** Server UUID; до первого sync равен clientId. */
  id: string;
  /** Локальный UUID, генерируется на устройстве — для outbox idempotency. */
  clientId: string;
  type: ChatType;
  title: string | null;
  avatarUrl: string | null;
  myRole: ChatRole;
  membersCount: number;
  /** Для DM — id собеседника (для рендера имени и аватарки в списке). */
  peerUserId: UserId | null;
  lastMessage: {
    id: string;
    text: string | null;
    senderId: UserId;
    ts: number;
  } | null;
  lastReadMessageId: string | null;
  unreadCount: number;
  muted: boolean;
  createdAt: number;
  updatedAt: number;
};

export type MessageKind = 'text' | 'image' | 'video' | 'system';

export type DeliveryStatus =
  | 'pending'   // в outbox, ждёт sync
  | 'sent'     // ушло на сервер, server_id получен
  | 'delivered' // доставлено хотя бы одному получателю
  | 'read'     // прочитано хотя бы одним получателем
  | 'failed';  // outbox исчерпал retries

export type Reaction = {
  userId: UserId;
  emoji: string;
  ts: number;
};

export type ReplyPreview = {
  messageId: string;
  senderId: UserId;
  body: string | null;
  kind: string;
  deleted: boolean;
};

export type Message = {
  /** Server UUID; до server-ack равен clientId. */
  id: string;
  clientId: string;
  chatId: string;
  senderId: UserId;
  kind: MessageKind;
  text: string | null;
  /** Локальный URI медиа (file://) до upload — UI рендерит из него optimistically. */
  mediaLocalUri: string | null;
  /** S3 URL после upload через media сервис. */
  mediaRemoteUrl: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaDurationS: number | null;
  replyToMessageId: string | null;
  /** Snapshot reply-target от сервера для bubble preview. */
  replyPreview: ReplyPreview | null;
  reactions: Reaction[];
  status: DeliveryStatus;
  isDeleted: boolean;
  deletedBy: UserId | null;
  createdAt: number;
  editedAt: number | null;
  /** Сколько раз outbox-push пытался — для UI retry-кнопки. */
  attempts: number;
};

export type ChatMember = {
  userId: UserId;
  displayName: string | null;
  avatarUrl: string | null;
  role: ChatRole;
  joinedAt: number;
};

/** UI helper: можно ли actor удалить это сообщение? */
export function canDeleteMessage(actorId: UserId, msg: Message, myRole: ChatRole): boolean {
  if (msg.isDeleted) return false;
  if (msg.senderId === actorId) return true;
  return myRole === 'owner' || myRole === 'admin' || myRole === 'moderator';
}

/** UI helper: text preview для списка чатов (max 80 chars). */
export function lastMessagePreview(msg: Chat['lastMessage']): string {
  if (!msg) return '';
  if (msg.text === null) return '📎 медиа';
  return msg.text.length > 80 ? msg.text.slice(0, 77) + '…' : msg.text;
}
