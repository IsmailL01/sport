// StoryCreatorScreen — minimal story composer (session 3 scope).
// Phase 11 / STORIES-REVIVAL.
//
// Flow:
//   1. Pick image — gallery or camera (uses existing MediaAdapter)
//   2. Optional overlay text (up to STORY_OVERLAY_MAX_LENGTH chars)
//   3. Publish → uploadImage → publishStory → nav.goBack + refresh
//
// LocalStoryDraft offline persistence deferred to v1.0.1 — in-memory only
// for this session. If upload fails, user sees Alert and can retry.

import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Icon, useTheme } from '../../../design';
import { getMediaAdapter } from '../../../media';
import type { PickedMedia } from '../../../media/MediaAdapter';
import { uploadImage } from '../../../sync/mediaUpload';
import type { RootStackParamList } from '../../../navigation/types';
import { STORY_OVERLAY_MAX_LENGTH } from '../domain/types';
import { useStoriesStore } from '../state/useStoriesStore';
import { publishStory } from '../sync/storiesApi';

type Nav = NativeStackNavigationProp<RootStackParamList, 'StoryCreator'>;

export function StoryCreatorScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const refreshStories = useStoriesStore((s) => s.refresh);

  const [picked, setPicked] = useState<PickedMedia | null>(null);
  const [overlayText, setOverlayText] = useState('');
  const [publishing, setPublishing] = useState(false);

  const pickFromGallery = async () => {
    try {
      const result = await getMediaAdapter().pickFromGallery({ type: 'image' });
      if (result !== null) setPicked(result);
    } catch (e) {
      Alert.alert('Не удалось выбрать фото', e instanceof Error ? e.message : '');
    }
  };

  const takePhoto = async () => {
    try {
      const result = await getMediaAdapter().takePhoto();
      if (result !== null) setPicked(result);
    } catch (e) {
      Alert.alert('Не удалось снять фото', e instanceof Error ? e.message : '');
    }
  };

  const handlePublish = async () => {
    if (picked === null || publishing) return;
    setPublishing(true);
    try {
      const uploaded = await uploadImage(picked);
      const clientId = `story_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const trimmedOverlay = overlayText.trim();
      await publishStory({
        clientId,
        mediaId: uploaded.mediaId,
        overlayText: trimmedOverlay === '' ? null : trimmedOverlay,
      });
      // Background refresh so tray + ring update immediately on return.
      void refreshStories();
      nav.goBack();
    } catch (e) {
      Alert.alert(
        'Не удалось опубликовать',
        e instanceof Error ? e.message : 'Попробуй ещё раз',
      );
      setPublishing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View
        style={{
          paddingTop: 56,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Pressable onPress={() => nav.goBack()} hitSlop={12} disabled={publishing}>
          <Icon name="back" size={28} color={t.text} />
        </Pressable>
        <Text
          style={{
            color: t.text,
            fontSize: 22 * t.fontScale,
            fontWeight: '800',
            fontFamily: t.fontDisplay,
            letterSpacing: -0.5,
            flex: 1,
          }}
        >
          Новая история
        </Text>
        <Pressable
          onPress={handlePublish}
          disabled={picked === null || publishing}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 18,
            backgroundColor: t.lime,
            opacity: picked === null || publishing ? 0.4 : pressed ? 0.85 : 1,
          })}
        >
          {publishing ? (
            <ActivityIndicator color="#0A0A0A" />
          ) : (
            <Text
              style={{
                color: '#0A0A0A',
                fontSize: 13 * t.fontScale,
                fontWeight: '800',
                fontFamily: t.font,
              }}
            >
              ОПУБЛИКОВАТЬ
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Media preview / picker */}
        {picked === null ? (
          <View style={{ gap: 12 }}>
            <Pressable
              onPress={pickFromGallery}
              style={({ pressed }) => ({
                padding: 18,
                borderRadius: 16,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.divider,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Icon name="image" size={24} color={t.text} />
              <Text
                style={{
                  color: t.text,
                  fontSize: 16 * t.fontScale,
                  fontWeight: '600',
                  fontFamily: t.font,
                }}
              >
                Выбрать из галереи
              </Text>
            </Pressable>
            <Pressable
              onPress={takePhoto}
              style={({ pressed }) => ({
                padding: 18,
                borderRadius: 16,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.divider,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Icon name="camera" size={24} color={t.text} />
              <Text
                style={{
                  color: t.text,
                  fontSize: 16 * t.fontScale,
                  fontWeight: '600',
                  fontFamily: t.font,
                }}
              >
                Снять фото
              </Text>
            </Pressable>
            <Text
              style={{
                color: t.text3,
                fontSize: 12 * t.fontScale,
                fontFamily: t.font,
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              История исчезнет через 24 часа
            </Text>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <View
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: '#000',
                aspectRatio: 9 / 16,
              }}
            >
              <Image
                source={{ uri: picked.uri }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
              {overlayText.trim() !== '' ? (
                <View style={styles.overlayPreview}>
                  <Text style={styles.overlayPreviewText}>{overlayText}</Text>
                </View>
              ) : null}
            </View>
            <View>
              <Text
                style={{
                  color: t.text3,
                  fontSize: 11 * t.fontScale,
                  fontWeight: '700',
                  fontFamily: t.font,
                  letterSpacing: 0.6,
                  marginBottom: 8,
                }}
              >
                ТЕКСТ ПОВЕРХ (НЕОБЯЗАТЕЛЬНО)
              </Text>
              <TextInput
                value={overlayText}
                onChangeText={(v) =>
                  setOverlayText(v.slice(0, STORY_OVERLAY_MAX_LENGTH))
                }
                placeholder="Что хочешь сказать?"
                placeholderTextColor={t.text3}
                multiline
                editable={!publishing}
                style={{
                  backgroundColor: t.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: t.divider,
                  padding: 12,
                  color: t.text,
                  fontSize: 15 * t.fontScale,
                  fontFamily: t.font,
                  minHeight: 64,
                  maxHeight: 120,
                }}
              />
              <Text
                style={{
                  color: t.text3,
                  fontSize: 11 * t.fontScale,
                  fontFamily: t.font,
                  textAlign: 'right',
                  marginTop: 4,
                }}
              >
                {overlayText.length} / {STORY_OVERLAY_MAX_LENGTH}
              </Text>
            </View>
            <Pressable
              onPress={() => setPicked(null)}
              disabled={publishing}
              style={({ pressed }) => ({
                paddingVertical: 12,
                alignItems: 'center',
                opacity: publishing ? 0.4 : pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  color: t.text2,
                  fontSize: 13 * t.fontScale,
                  fontFamily: t.font,
                }}
              >
                Выбрать другое фото
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlayPreview: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    padding: 10,
  },
  overlayPreviewText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
});
