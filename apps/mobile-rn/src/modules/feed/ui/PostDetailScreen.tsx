// PostDetailScreen — пост + comments + composer.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Comment, Post } from '../domain/types';
import { COMMENT_BODY_MAX_LENGTH } from '../domain/types';
import { useFeedStore } from '../state/useFeedStore';
import { useUsersStore } from '../../../state/social/useUsersStore';
import { PostCard } from './PostCard';

type Props = {
  post: Post;
  myUserId: string;
  onBack: () => void;
  /** M9.7: tap на author header → ForeignProfile modal. */
  onAuthorPress?: (authorId: string) => void;
};

export function PostDetailScreen({ post, myUserId, onBack, onAuthorPress }: Props) {
  const comments = useFeedStore((s) => s.commentsByPost[post.id] ?? []);
  const loadComments = useFeedStore((s) => s.loadComments);
  const commentAction = useFeedStore((s) => s.comment);
  const deleteCommentAction = useFeedStore((s) => s.deleteComment);
  const liveCount = useFeedStore(
    (s) => s.posts.find((p) => p.id === post.id)?.commentCount ?? post.commentCount,
  );

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void loadComments(post.id);
  }, [post.id, loadComments]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await commentAction(post.id, body);
      setDraft('');
    } catch (e) {
      console.warn('[feed] comment failed', e);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Пост</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={{ flex: 1 }}>
          <PostCard post={post} myUserId={myUserId} expanded onAuthorPress={onAuthorPress} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Комментарии {liveCount > 0 ? `· ${liveCount}` : ''}
            </Text>
          </View>
          {comments.length === 0 ? (
            <Text style={styles.empty}>Пока нет комментариев</Text>
          ) : (
            comments.map((c) => (
              <CommentRow
                key={c.id}
                c={c}
                canDelete={c.authorId === myUserId || post.authorId === myUserId}
                onDelete={() => {
                  void deleteCommentAction(post.id, c.id);
                }}
              />
            ))
          )}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={(t) => setDraft(t.slice(0, COMMENT_BODY_MAX_LENGTH))}
            placeholder="Написать комментарий…"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            multiline
          />
          <Pressable
            onPress={send}
            disabled={sending || draft.trim() === ''}
            style={[
              styles.sendBtn,
              (sending || draft.trim() === '') && styles.sendBtnDisabled,
            ]}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.sendText}>Отпр.</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function CommentRow({
  c, canDelete, onDelete,
}: {
  c: Comment; canDelete: boolean; onDelete: () => void;
}) {
  const author = useUsersStore((s) => s.byId[c.authorId]);
  const getOrFetch = useUsersStore((s) => s.getOrFetch);
  useEffect(() => {
    if (author === undefined) getOrFetch(c.authorId);
  }, [c.authorId, author, getOrFetch]);
  const name = author?.displayName ?? author?.username ?? c.authorId.slice(0, 6);
  return (
    <View style={styles.commentRow}>
      <View style={styles.commentAvatar}>
        <Text style={styles.commentAvatarText}>{name[0]?.toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.commentTop}>
          <Text style={styles.commentName}>{name}</Text>
          {canDelete && (
            <Pressable onPress={onDelete} hitSlop={8}>
              <Text style={styles.commentDelete}>×</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.commentBody}>{c.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: '#111827', marginTop: -4 },
  title: { fontSize: 16, fontWeight: '600', color: '#111827' },
  section: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  sectionTitle: { fontSize: 14, color: '#374151', fontWeight: '600' },
  empty: { color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
  commentRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F3F4F6',
  },
  commentAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  commentAvatarText: { color: '#374151', fontSize: 12, fontWeight: '700' },
  commentTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  commentName: { color: '#111827', fontSize: 13, fontWeight: '600' },
  commentDelete: { color: '#9CA3AF', fontSize: 18, paddingHorizontal: 6, marginTop: -4 },
  commentBody: { color: '#374151', fontSize: 13, marginTop: 2, lineHeight: 18 },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1, color: '#111827', fontSize: 14,
    backgroundColor: '#F9FAFB',
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    maxHeight: 100, minHeight: 40,
  },
  sendBtn: {
    backgroundColor: '#111827', paddingHorizontal: 14,
    height: 40, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#9CA3AF' },
  sendText: { color: '#FFFFFF', fontWeight: '600' },
});
