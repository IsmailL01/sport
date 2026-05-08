// Один чат — inverted FlatList сообщений + Composer.
// Phase 8 / A5.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';

import type { Chat, Message } from '../../domain/social';
import { runMessagesPush } from '../../sync/messageSync';
import { useChatStore } from '../../state/social/useChatStore';
import { useChatsStore } from '../../state/social/useChatsStore';
import { useUsersStore } from '../../state/social/useUsersStore';

type Props = {
  chat: Chat;
  myUserId: string;
  onBack: () => void;
};

export function ChatScreen({ chat, myUserId, onBack }: Props) {
  const messages = useChatStore((s) => s.messages);
  const open = useChatStore((s) => s.open);
  const close = useChatStore((s) => s.close);
  const sendText = useChatStore((s) => s.sendText);
  const isLoadingOlder = useChatStore((s) => s.isLoadingOlder);
  const loadOlder = useChatStore((s) => s.loadOlder);
  const markRead = useChatsStore((s) => s.markRead);

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
    await sendText(chat.id, myUserId, text);
    // Push в outbox best-effort (fire-and-forget).
    runMessagesPush().catch((e) => console.warn('[chat] push failed', e));
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
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 32 }} />
      </View>

      <FlatList
        data={messages}
        inverted
        keyExtractor={(m) => m.clientId}
        renderItem={({ item }) => (
          <Bubble msg={item} mine={item.senderId === myUserId} />
        )}
        contentContainerStyle={styles.messagesList}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.5}
        ListFooterComponent={isLoadingOlder ? <ActivityIndicator style={{ margin: 16 }} /> : null}
        ListEmptyComponent={
          <Text style={styles.empty}>Пока нет сообщений. Напиши первое.</Text>
        }
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Сообщение..."
          placeholderTextColor="#9CA3AF"
          multiline
          maxLength={4000}
        />
        <Pressable
          onPress={handleSend}
          disabled={draft.trim() === ''}
          style={[styles.sendBtn, draft.trim() === '' && styles.sendBtnDisabled]}
        >
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg, mine }: { msg: Message; mine: boolean }) {
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
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheir]}>
      <Text style={styles.bubbleText}>{msg.text}</Text>
      <View style={styles.bubbleMeta}>
        <Text style={styles.bubbleTime}>{formatHM(msg.createdAt)}</Text>
        {mine && <Text style={[
          styles.bubbleTick,
          msg.status === 'failed' && styles.bubbleTickFailed,
          msg.status === 'read' && styles.bubbleTickRead,
        ]}>{tickGlyph}</Text>}
      </View>
    </View>
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
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827', textAlign: 'center' },

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
