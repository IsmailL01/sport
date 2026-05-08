// Один чат — inverted FlatList сообщений + Composer.
// Phase 8 / A5.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';

import type { Chat, Message } from '../../domain/social';
import { canDeleteMessage } from '../../domain/social';
import { runMessagesPush } from '../../sync/messageSync';
import { useChatStore } from '../../state/social/useChatStore';
import { useChatsStore } from '../../state/social/useChatsStore';
import { useUsersStore } from '../../state/social/useUsersStore';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

type Props = {
  chat: Chat;
  myUserId: string;
  onBack: () => void;
  onOpenSettings?: () => void;
};

export function ChatScreen({ chat, myUserId, onBack, onOpenSettings }: Props) {
  const messages = useChatStore((s) => s.messages);
  const open = useChatStore((s) => s.open);
  const close = useChatStore((s) => s.close);
  const sendText = useChatStore((s) => s.sendText);
  const isLoadingOlder = useChatStore((s) => s.isLoadingOlder);
  const loadOlder = useChatStore((s) => s.loadOlder);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const editMessage = useChatStore((s) => s.editMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const markRead = useChatsStore((s) => s.markRead);

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<{ messageId: string; original: string } | null>(null);

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

  useEffect(() => {
    open(chat.id);
    return () => close();
  }, [chat.id, open, close]);

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
    buttons.push({ text: 'Отмена', style: 'cancel' });
    Alert.alert(
      isMine ? 'Сообщение' : 'Сообщение',
      msg.text ?? '(медиа)',
      buttons,
    );
  };

  const cancelReply = () => setReplyTo(null);
  const cancelEdit = () => { setEditing(null); setDraft(''); };

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
          onPress={chat.type === 'group' && onOpenSettings ? onOpenSettings : undefined}
          disabled={!(chat.type === 'group' && onOpenSettings)}
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

      <FlatList
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
        ListFooterComponent={isLoadingOlder ? <ActivityIndicator style={{ margin: 16 }} /> : null}
        ListEmptyComponent={
          <Text style={styles.empty}>Пока нет сообщений. Напиши первое.</Text>
        }
      />

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
        <Text style={styles.bubbleText}>{msg.text}</Text>
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

  messagesList: { paddingHorizontal: 12, paddingVertical: 8, flexGrow: 1 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 100 },
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
