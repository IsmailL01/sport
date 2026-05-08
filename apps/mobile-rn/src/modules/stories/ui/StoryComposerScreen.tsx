// Compose-screen для новой story: pick photo / camera + caption + post.
// Phase 8 / C — нейтральный дизайн.
//
// Flow:
//   1. user открывает screen → автоматически вызывает gallery picker.
//   2. picked → показываем preview + поле overlay.
//   3. tap «Опубликовать» → store.compose() (создаёт draft, кикает push).
//   4. По возврате caller получает callback onPosted; UI закрывается.

import { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getMediaAdapter } from '../../../media';
import type { PickedMedia } from '../../../media/MediaAdapter';
import { useStoriesStore } from '../state/useStoriesStore';
import { STORY_OVERLAY_MAX_LENGTH } from '../domain/types';

type Props = {
  visible: boolean;
  myUserId: string;
  onClose: () => void;
  onPosted?: () => void;
};

export function StoryComposerScreen({
  visible, myUserId, onClose, onPosted,
}: Props) {
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  const [overlay, setOverlay] = useState('');
  const [error, setError] = useState<string | null>(null);
  const compose = useStoriesStore((s) => s.compose);
  const publishing = useStoriesStore((s) => s.publishing);

  // На каждое открытие — заново pick.
  useEffect(() => {
    if (!visible) {
      setPicked(null);
      setOverlay('');
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ok = await getMediaAdapter().requestPermission('gallery');
        if (!ok) {
          if (!cancelled) {
            setError('Нет разрешения на доступ к галерее');
          }
          return;
        }
        const result = await getMediaAdapter().pickFromGallery({ type: 'image' });
        if (cancelled) return;
        if (!result) {
          // user cancelled — закрываем composer
          onClose();
          return;
        }
        setPicked(result);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visible, onClose]);

  const onPost = async () => {
    if (!picked) return;
    setError(null);
    try {
      await compose(picked, overlay.trim() || null, myUserId);
      onPosted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onPickAgain = async () => {
    setError(null);
    try {
      const result = await getMediaAdapter().pickFromGallery({ type: 'image' });
      if (result) setPicked(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onTakePhoto = async () => {
    setError(null);
    try {
      const ok = await getMediaAdapter().requestPermission('camera');
      if (!ok) { setError('Нет разрешения на камеру'); return; }
      const result = await getMediaAdapter().takePhoto();
      if (result) setPicked(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
          <Text style={styles.title}>Новая история</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.preview}>
          {picked ? (
            <Image source={{ uri: picked.uri }} style={styles.image} resizeMode="contain" />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>Выберите фото</Text>
            </View>
          )}
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={styles.actionBtn} onPress={onPickAgain}>
            <Text style={styles.actionText}>Галерея</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={onTakePhoto}>
            <Text style={styles.actionText}>Камера</Text>
          </Pressable>
        </View>

        <View style={styles.captionWrap}>
          <TextInput
            value={overlay}
            onChangeText={(t) =>
              setOverlay(t.slice(0, STORY_OVERLAY_MAX_LENGTH))
            }
            placeholder="Подпись (необязательно)"
            placeholderTextColor="#9CA3AF"
            multiline
            style={styles.caption}
          />
          <Text style={styles.counter}>
            {overlay.length}/{STORY_OVERLAY_MAX_LENGTH}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={onPost}
          disabled={!picked || publishing}
          style={[
            styles.postBtn,
            (!picked || publishing) && styles.postBtnDisabled,
          ]}
        >
          <Text style={styles.postText}>
            {publishing ? 'Публикуем…' : 'Опубликовать'}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 50, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 28, color: '#111827' },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#111827' },
  preview: {
    flex: 1, backgroundColor: '#000000',
    alignItems: 'center', justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    width: '100%',
  },
  placeholderText: { color: '#9CA3AF', fontSize: 14 },
  actionsRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  actionBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 6,
    borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center',
  },
  actionText: { color: '#111827', fontSize: 14, fontWeight: '500' },
  captionWrap: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  caption: {
    color: '#111827',
    fontSize: 14,
    minHeight: 60,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  counter: { fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 4 },
  error: {
    color: '#B91C1C', fontSize: 13, paddingHorizontal: 16, paddingVertical: 4,
  },
  postBtn: {
    margin: 16, paddingVertical: 14, borderRadius: 8,
    backgroundColor: '#111827', alignItems: 'center',
  },
  postBtnDisabled: { backgroundColor: '#9CA3AF' },
  postText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
