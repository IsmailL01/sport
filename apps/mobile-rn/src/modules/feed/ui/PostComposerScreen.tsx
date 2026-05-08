// PostComposerScreen — создать пост (text / photo).
// session-share отдельным flow в App.tsx (после Save пробежки).

import { useState } from 'react';
import {
  Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { POST_BODY_MAX_LENGTH } from '../domain/types';
import { useFeedStore } from '../state/useFeedStore';
import { getMediaAdapter } from '../../../media';
import type { PickedMedia } from '../../../media/MediaAdapter';

type Props = {
  visible: boolean;
  myUserId: string;
  onClose: () => void;
  onPosted?: () => void;
};

export function PostComposerScreen({ visible, myUserId, onClose, onPosted }: Props) {
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const composeText = useFeedStore((s) => s.composeText);
  const composePhoto = useFeedStore((s) => s.composePhoto);
  const publishing = useFeedStore((s) => s.publishing);

  const reset = () => {
    setBody('');
    setPicked(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onPickPhoto = async () => {
    setError(null);
    try {
      const ok = await getMediaAdapter().requestPermission('gallery');
      if (!ok) { setError('Нет разрешения на галерею'); return; }
      const result = await getMediaAdapter().pickFromGallery({ type: 'image' });
      if (result) setPicked(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onPost = async () => {
    setError(null);
    try {
      if (picked) {
        await composePhoto(myUserId, {
          caption: body.trim() || null,
          localUri: picked.uri,
          mime: picked.mime,
          width: picked.width,
          height: picked.height,
        });
      } else {
        if (body.trim() === '') {
          setError('Введите текст поста');
          return;
        }
        await composeText(myUserId, body.trim());
      }
      reset();
      onPosted?.();
      onClose();
    } catch (e) {
      // Phase I: rate limit message.
      if (e instanceof Error && e.name === 'RateLimitedError') {
        const retry = (e as Error & { retryAfterS?: number }).retryAfterS ?? 60;
        setError(`Слишком много постов. Попробуйте через ${retry} сек.`);
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={10} style={styles.btn}>
            <Text style={styles.btnText}>×</Text>
          </Pressable>
          <Text style={styles.title}>Новый пост</Text>
          <Pressable
            onPress={onPost}
            disabled={publishing || (body.trim() === '' && !picked)}
            style={[
              styles.postBtn,
              (publishing || (body.trim() === '' && !picked)) && styles.postBtnDisabled,
            ]}
          >
            <Text style={styles.postText}>{publishing ? '…' : 'Опубл.'}</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <TextInput
            value={body}
            onChangeText={(t) => setBody(t.slice(0, POST_BODY_MAX_LENGTH))}
            placeholder="Что нового? (текст или подпись к фото)"
            placeholderTextColor="#9CA3AF"
            multiline
            style={styles.input}
          />
          <Text style={styles.counter}>
            {body.length}/{POST_BODY_MAX_LENGTH}
          </Text>

          {picked ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: picked.uri }} style={styles.preview} resizeMode="cover" />
              <Pressable onPress={() => setPicked(null)} style={styles.removeBtn}>
                <Text style={styles.removeText}>× Убрать</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable onPress={onPickPhoto} style={styles.attachBtn}>
            <Text style={styles.attachText}>📷 Прикрепить фото</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingTop: 50, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  btn: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 24, color: '#111827' },
  title: { fontSize: 16, fontWeight: '600', color: '#111827' },
  postBtn: {
    paddingHorizontal: 12, height: 32, borderRadius: 6,
    backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center',
  },
  postBtnDisabled: { backgroundColor: '#9CA3AF' },
  postText: { color: '#FFFFFF', fontWeight: '600' },
  input: {
    color: '#111827', fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    padding: 0,
  },
  counter: { color: '#9CA3AF', fontSize: 11, textAlign: 'right', marginTop: 4 },
  previewWrap: {
    marginTop: 16, borderRadius: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  preview: { width: '100%', aspectRatio: 1 },
  removeBtn: {
    paddingVertical: 8, alignItems: 'center', backgroundColor: '#F9FAFB',
  },
  removeText: { color: '#6B7280' },
  attachBtn: {
    marginTop: 16,
    paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6,
    alignItems: 'center',
  },
  attachText: { color: '#111827', fontSize: 14, fontWeight: '500' },
  error: { color: '#B91C1C', fontSize: 13, marginTop: 12 },
});
