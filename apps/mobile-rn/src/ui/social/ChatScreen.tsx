// Один чат — inverted FlatList сообщений + Composer.
// Phase 8 / A5.

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView,
  type NativeScrollEvent, type NativeSyntheticEvent,
  Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { Avatar, MessageBubbleSkeleton } from '../../design';
import { MessageText } from './MessageText';
import type { Chat, Message } from '../../domain/social';
import { canDeleteMessage } from '../../domain/social';
import { getMediaAdapter } from '../../media';
import { fetchMediaURL, uploadImage } from '../../sync/mediaUpload';
import { runMessagesPush } from '../../sync/messageSync';
import { useChatStore } from '../../state/social/useChatStore';
import { useChatsStore } from '../../state/social/useChatsStore';
import { useUsersStore } from '../../state/social/useUsersStore';
import { ReportSheet } from '../../modules/moderation';

// Threshold (px from bottom = contentOffset.y for inverted FlatList) above which
// the scroll-to-bottom FAB becomes visible. 600 ≈ 3-4 message bubbles up.
const SCROLL_FAB_THRESHOLD_PX = 600;

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

type Props = {
  chat: Chat;
  myUserId: string;
  onBack: () => void;
  onOpenSettings?: () => void;
  /** M9.7: tap на DM header → ForeignProfile (для group — onOpenSettings). */
  onPeerPress?: (peerUserId: string) => void;
};

export function ChatScreen({ chat, myUserId, onBack, onOpenSettings, onPeerPress }: Props) {
  const messages = useChatStore((s) => s.messages);
  const open = useChatStore((s) => s.open);
  const close = useChatStore((s) => s.close);
  const sendText = useChatStore((s) => s.sendText);
  const isLoadingOlder = useChatStore((s) => s.isLoadingOlder);
  const loadOlder = useChatStore((s) => s.loadOlder);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const editMessage = useChatStore((s) => s.editMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const sendImage = useChatStore((s) => s.sendImage);
  const markRead = useChatsStore((s) => s.markRead);
  const [uploading, setUploading] = useState(false);

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<{ messageId: string; original: string } | null>(null);
  const [reportTarget, setReportTarget] = useState<{ id: string; label: string } | null>(null);

  const peer = useUsersStore((s) => (chat.peerUserId !== null ? s.byId[chat.peerUserId] : undefined));
  const getOrFetch = useUsersStore((s) => s.getOrFetch);
  useEffect(() => {
    if (chat.peerUserId !== null && peer === undefined) {
      getOrFetch(chat.peerUserId);
    }
  }, [chat.peerUserId, peer, getOrFetch]);

  const title = chat.title
    ?? peer?.displayName
    ?? peer?.username
    ?? 'Чат';

  const [draft, setDraft] = useState('');

  // Initial-load tracking — true on mount, flips false after the first
  // messages state update (whether empty or populated). Lets us show a
  // skeleton on cold open without false-flashing the "empty chat" state.
  const [initialLoad, setInitialLoad] = useState(true);

  // Scroll-to-bottom FAB visibility. Inverted FlatList: contentOffset.y > 0
  // means user has scrolled UP from the most-recent message.
  const listRef = useRef<FlatList<Message>>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const next = y > SCROLL_FAB_THRESHOLD_PX;
    if (next !== showScrollDown) setShowScrollDown(next);
  };
  const scrollToBottom = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  useEffect(() => {
    open(chat.id);
    return () => close();
  }, [chat.id, open, close]);

  // Flip initialLoad off as soon as we've received the first state push from
  // useChatStore (open() either resolves to messages[] or to []). Single-shot.
  useEffect(() => {
    if (initialLoad) {
      const id = setTimeout(() => setInitialLoad(false), 350);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [initialLoad, messages.length]);

  // Mark read когда новое сообщение приходит и мы внизу.
  useEffect(() => {
    if (messages.length > 0 && messages[0].senderId !== myUserId) {
      markRead(chat.id, messages[0].id);
    }
  }, [messages, myUserId, chat.id, markRead]);

  const handleSend = async () => {
    const text = draft.trim();
    if (text === '') return;
    setDraft('');
    if (editing !== null) {
      const ok = await editMessage(editing.messageId, text);
      if (!ok) Alert.alert('Не удалось отредактировать');
      setEditing(null);
      return;
    }
    await sendText(chat.id, myUserId, text, replyTo?.id ?? null);
    setReplyTo(null);
    runMessagesPush().catch((e) => console.warn('[chat] push failed', e));
  };

  const handleLongPress = (msg: Message) => {
    if (msg.isDeleted) return;
    const isMine = msg.senderId === myUserId;
    const canEdit = isMine && Date.now() - msg.createdAt < EDIT_WINDOW_MS;
    const canDelete = canDeleteMessage(myUserId, msg, chat.myRole);

    const buttons: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> = [
      { text: '↩ Ответить', onPress: () => { setReplyTo(msg); setEditing(null); } },
    ];
    // Quick reactions in one row — Alert не поддерживает, добавим как отдельные кнопки.
    for (const emoji of QUICK_REACTIONS) {
      buttons.push({
        text: `${emoji} реакция`,
        onPress: () => toggleReaction(msg.id, myUserId, emoji),
      });
    }
    if (canEdit && msg.text !== null) {
      buttons.push({
        text: '✎ Изменить',
        onPress: () => {
          setEditing({ messageId: msg.id, original: msg.text ?? '' });
          setDraft(msg.text ?? '');
          setReplyTo(null);
        },
      });
    }
    if (canDelete) {
      buttons.push({
        text: '🗑 Удалить',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteMessage(msg.id);
          if (!ok) Alert.alert('Не удалось удалить');
        },
      });
    }
    // Phase E: пожаловаться (только на чужие).
    if (!isMine) {
      buttons.push({
        text: '⚠ Пожаловаться',
        style: 'destructive',
        onPress: () => setReportTarget({ id: msg.id, label: msg.text ?? '(медиа)' }),
      });
    }
    buttons.push({ text: 'Отмена', style: 'cancel' });
    Alert.alert(
      isMine ? 'Сообщение' : 'Сообщение',
      msg.text ?? '(медиа)',
      buttons,
    );
  };

  const cancelReply = () => setReplyTo(null);
  const cancelEdit = () => { setEditing(null); setDraft(''); };

  const handleAttach = async () => {
    if (uploading || editing !== null) return;
    const adapter = getMediaAdapter();
    const granted = await adapter.requestPermission('gallery');
    if (!granted) {
      Alert.alert('Доступ к галерее', 'Разрешите доступ в настройках приложения.');
      return;
    }
    const picked = await adapter.pickFromGallery({ type: 'image' });
    if (picked === null) return;
    setUploading(true);
    try {
      const result = await uploadImage(picked);
      await sendImage(chat.id, myUserId, {
        mediaId: result.mediaId,
        localUri: picked.uri,
        mime: result.mime,
        width: result.width,
        height: result.height,
        caption: null,
      });
    } catch (e) {
      Alert.alert('Не удалось загрузить', String((e as Error)?.message ?? e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Pressable
          style={styles.headerTitleBtn}
          onPress={
            chat.type === 'group' && onOpenSettings
              ? onOpenSettings
              : chat.type === 'dm' && chat.peerUserId !== null && onPeerPress
                ? () => onPeerPress(chat.peerUserId as string)
                : undefined
          }
          disabled={
            !(chat.type === 'group' && onOpenSettings) &&
            !(chat.type === 'dm' && chat.peerUserId !== null && onPeerPress)
          }
        >
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {chat.type === 'group' && (
            <Text style={styles.headerSubtitle}>
              {chat.membersCount} участник{chat.membersCount === 1 ? '' : chat.membersCount < 5 ? 'а' : 'ов'}
            </Text>
          )}
        </Pressable>
        {chat.type === 'group' && onOpenSettings ? (
          <Pressable onPress={onOpenSettings} style={styles.settingsBtn}>
            <Text style={styles.settingsBtnText}>⚙</Text>
          </Pressable>
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      {initialLoad && messages.length === 0 ? (
        // First-load skeleton: 5 alternating bubble shapes. Replaces the
        // brief blank-screen flash between open() and first render.
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 8 }}>
          <MessageBubbleSkeleton side="left" />
          <MessageBubbleSkeleton side="right" />
          <MessageBubbleSkeleton side="left" />
          <MessageBubbleSkeleton side="right" />
          <MessageBubbleSkeleton side="left" />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={messages}
            inverted
            keyExtractor={(m) => m.clientId}
            renderItem={({ item }) => (
              <Bubble
                msg={item}
                mine={item.senderId === myUserId}
                showSender={chat.type === 'group' && item.senderId !== myUserId}
                myUserId={myUserId}
                onLongPress={() => handleLongPress(item)}
                onReactionPress={(emoji) => toggleReaction(item.id, myUserId, emoji)}
              />
            )}
            contentContainerStyle={styles.messagesList}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.5}
            onScroll={handleScroll}
            scrollEventThrottle={64}
            ListFooterComponent={isLoadingOlder ? <ActivityIndicator style={{ margin: 16 }} /> : null}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Avatar
                  size={72}
                  src={peer?.avatarUrl ?? null}
                  name={title}
                />
                <Text style={styles.emptyTitle}>{title}</Text>
                <Text style={styles.emptyBody}>
                  Это начало вашей беседы.{'\n'}Напишите первое сообщение.
                </Text>
              </View>
            }
          />
          {showScrollDown ? (
            <Pressable onPress={scrollToBottom} style={styles.scrollDownFab}>
              <Text style={styles.scrollDownFabText}>↓</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {(replyTo !== null || editing !== null) && (
        <View style={styles.replyChip}>
          <View style={styles.replyChipBar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replyChipLabel}>
              {editing !== null ? 'Изменение сообщения' : `Ответ ${replyTo!.senderId === myUserId ? 'себе' : 'на сообщение'}`}
            </Text>
            <Text style={styles.replyChipBody} numberOfLines={1}>
              {editing !== null ? editing.original : (replyTo?.text ?? '(медиа)')}
            </Text>
          </View>
          <Pressable
            onPress={editing !== null ? cancelEdit : cancelReply}
            style={styles.replyChipClose}
          >
            <Text style={styles.replyChipCloseText}>✕</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.composer}>
        <Pressable
          onPress={handleAttach}
          disabled={uploading || editing !== null}
          style={[styles.attachBtn, (uploading || editing !== null) && styles.attachBtnDisabled]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#6B7280" />
          ) : (
            <Text style={styles.attachText}>+</Text>
          )}
        </Pressable>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={editing !== null ? 'Изменить...' : 'Сообщение...'}
          placeholderTextColor="#9CA3AF"
          multiline
          maxLength={4000}
        />
        <Pressable
          onPress={handleSend}
          disabled={draft.trim() === ''}
          style={[styles.sendBtn, draft.trim() === '' && styles.sendBtnDisabled]}
        >
          <Text style={styles.sendText}>{editing !== null ? '✓' : '↑'}</Text>
        </Pressable>
      </View>
      <ReportSheet
        visible={reportTarget !== null}
        targetKind="message"
        targetId={reportTarget?.id ?? ''}
        targetLabel={reportTarget?.label}
        onClose={() => setReportTarget(null)}
      />
    </KeyboardAvoidingView>
  );
}

function Bubble({
  msg, mine, showSender, myUserId, onLongPress, onReactionPress,
}: {
  msg: Message; mine: boolean; showSender: boolean; myUserId: string;
  onLongPress: () => void; onReactionPress: (emoji: string) => void;
}) {
  const sender = useUsersStore((s) => s.byId[msg.senderId]);
  const replyTargetSender = useUsersStore((s) =>
    msg.replyPreview !== null ? s.byId[msg.replyPreview.senderId] : undefined,
  );
  const getOrFetch = useUsersStore((s) => s.getOrFetch);
  // Lazy-load sender profile если показываем имя.
  if (showSender && sender === undefined) getOrFetch(msg.senderId);
  if (msg.replyPreview !== null && replyTargetSender === undefined) {
    getOrFetch(msg.replyPreview.senderId);
  }

  // Lazy-fetch presigned media URL для bubble (TTL 1h).
  const [mediaURL, setMediaURL] = useState<string | null>(msg.mediaLocalUri);
  useEffect(() => {
    let cancelled = false;
    if (msg.kind === 'image' || msg.kind === 'video') {
      // Если есть локальный URI (свежий optimistic upload) — используем его.
      if (msg.mediaLocalUri !== null) {
        setMediaURL(msg.mediaLocalUri);
        return;
      }
      // Иначе fetchPresigned для server-acked media.
      if (msg.mediaId !== null) {
        fetchMediaURL(msg.mediaId).then((url) => {
          if (!cancelled) setMediaURL(url);
        });
      }
    }
    return () => { cancelled = true; };
  }, [msg.kind, msg.mediaId, msg.mediaLocalUri]);

  const isImage = msg.kind === 'image';
  // Aspect ratio для image bubble.
  const aspect = (msg.mediaWidth && msg.mediaHeight && msg.mediaHeight > 0)
    ? msg.mediaWidth / msg.mediaHeight
    : 1;

  // Aggregate reactions: emoji → count + my-included flag.
  const reactionsByEmoji = msg.reactions.reduce<Record<string, { count: number; mine: boolean }>>(
    (acc, r) => {
      const cur = acc[r.emoji] ?? { count: 0, mine: false };
      cur.count += 1;
      if (r.userId === myUserId) cur.mine = true;
      acc[r.emoji] = cur;
      return acc;
    },
    {},
  );

  const tickGlyph = (() => {
    if (msg.status === 'pending') return '⏳';
    if (msg.status === 'failed') return '⚠';
    if (msg.status === 'read') return '✓✓';
    if (msg.status === 'delivered') return '✓✓';
    if (msg.status === 'sent') return '✓';
    return '';
  })();

  if (msg.isDeleted) {
    return (
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheir, styles.bubbleDeleted]}>
        <Text style={styles.bubbleDeletedText}>сообщение удалено</Text>
      </View>
    );
  }

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={300}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheir]}>
        {showSender && (
          <Text style={styles.bubbleSender}>
            {sender?.displayName ?? sender?.username ?? msg.senderId.slice(0, 8)}
          </Text>
        )}
        {msg.replyPreview !== null && (
          <View style={styles.replyQuote}>
            <View style={styles.replyQuoteBar} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.replyQuoteSender}>
                {replyTargetSender?.displayName ?? replyTargetSender?.username
                  ?? msg.replyPreview.senderId.slice(0, 8)}
              </Text>
              <Text style={styles.replyQuoteBody} numberOfLines={1}>
                {msg.replyPreview.deleted
                  ? '(удалено)'
                  : msg.replyPreview.body ?? '(медиа)'}
              </Text>
            </View>
          </View>
        )}
        {isImage && (
          <View style={[styles.imageBox, { aspectRatio: aspect }]}>
            {mediaURL !== null ? (
              <Image source={{ uri: mediaURL }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <ActivityIndicator color="#6B7280" />
              </View>
            )}
            {msg.status === 'pending' && (
              <View style={styles.imageOverlay}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            )}
          </View>
        )}
        {msg.text !== null && msg.text !== '' && (
          // Phase 11 session 3 chat polish — URLs + @mentions tappable.
          <MessageText
            body={msg.text}
            color={mine ? '#FFFFFF' : '#111827'}
            linkColor={mine ? '#C6F560' : '#2563EB'}
            fontSize={15}
          />
        )}
        <View style={styles.bubbleMeta}>
          {msg.editedAt !== null && (
            <Text style={styles.editedTag}>изменено</Text>
          )}
          <Text style={styles.bubbleTime}>{formatHM(msg.createdAt)}</Text>
          {mine && <Text style={[
            styles.bubbleTick,
            msg.status === 'failed' && styles.bubbleTickFailed,
            msg.status === 'read' && styles.bubbleTickRead,
          ]}>{tickGlyph}</Text>}
        </View>
        {Object.keys(reactionsByEmoji).length > 0 && (
          <View style={styles.reactionsRow}>
            {Object.entries(reactionsByEmoji).map(([emoji, info]) => (
              <Pressable
                key={emoji}
                onPress={() => onReactionPress(emoji)}
                style={[styles.reactionChip, info.mine && styles.reactionChipMine]}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {info.count > 1 && <Text style={styles.reactionCount}>{info.count}</Text>}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

function formatHM(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: '#111827', marginTop: -4 },
  headerTitleBtn: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  headerSubtitle: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  settingsBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  settingsBtnText: { fontSize: 18, color: '#6B7280' },
  bubbleSender: { fontSize: 11, fontWeight: '700', color: '#6366F1', marginBottom: 2 },
  editedTag: { fontSize: 9, color: '#9CA3AF', fontStyle: 'italic', marginRight: 4 },
  replyQuote: {
    flexDirection: 'row', gap: 8, marginBottom: 4,
    paddingLeft: 4, paddingVertical: 2,
  },
  replyQuoteBar: { width: 2, backgroundColor: '#6366F1', borderRadius: 1 },
  replyQuoteSender: { fontSize: 11, fontWeight: '700', color: '#6366F1' },
  replyQuoteBody: { fontSize: 12, color: '#6B7280' },
  reactionsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 4,
    marginTop: 4,
  },
  reactionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  reactionChipMine: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 10, color: '#6B7280', fontWeight: '600' },
  replyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  replyChipBar: { width: 2, height: '80%', backgroundColor: '#6366F1', borderRadius: 1 },
  replyChipLabel: { fontSize: 11, color: '#6366F1', fontWeight: '700' },
  replyChipBody: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  replyChipClose: {
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  replyChipCloseText: { fontSize: 14, color: '#9CA3AF' },
  imageBox: {
    width: 240, maxWidth: 280, borderRadius: 8, overflow: 'hidden',
    backgroundColor: '#F3F4F6', marginBottom: 6,
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  imageOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  attachBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center', justifyContent: 'center',
  },
  attachBtnDisabled: { opacity: 0.5 },
  attachText: { fontSize: 24, color: '#6B7280', marginTop: -3, fontWeight: '300' },

  messagesList: { paddingHorizontal: 12, paddingVertical: 8, flexGrow: 1 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 100 },
  // ListEmptyComponent renders on inverted FlatList already in flex column-reverse;
  // we counter-flip the inner View so peer-avatar/title/body still read top-to-bottom.
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    transform: [{ scaleY: -1 }],
    minHeight: 280,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: '#0A0A0A',
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollDownFab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  scrollDownFabText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  bubble: {
    maxWidth: '78%', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, marginVertical: 3,
  },
  bubbleMine: {
    alignSelf: 'flex-end', backgroundColor: '#F3F4F6',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  bubbleTheir: {
    alignSelf: 'flex-start', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  bubbleDeleted: { opacity: 0.6 },
  bubbleDeletedText: { color: '#9CA3AF', fontStyle: 'italic', fontSize: 13 },
  bubbleText: { color: '#111827', fontSize: 15, lineHeight: 20 },
  bubbleMeta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    marginTop: 2, gap: 4,
  },
  bubbleTime: { fontSize: 10, color: '#9CA3AF' },
  bubbleTick: { fontSize: 10, color: '#9CA3AF' },
  bubbleTickRead: { color: '#6366F1' },
  bubbleTickFailed: { color: '#EF4444' },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#E5E7EB', gap: 8,
  },
  input: {
    flex: 1, maxHeight: 120, minHeight: 40,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 20, fontSize: 15, color: '#111827',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#111827',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#D1D5DB' },
  sendText: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', marginTop: -3 },
});
