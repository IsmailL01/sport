// expo-image-picker + expo-image-manipulator + expo-file-system.
// Phase 8 / B3.

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import type { MediaAdapter, MediaScope, PickedMedia } from '../MediaAdapter';

export class ExpoMediaAdapter implements MediaAdapter {
  async requestPermission(scope: MediaScope): Promise<boolean> {
    if (scope === 'camera') {
      const r = await ImagePicker.requestCameraPermissionsAsync();
      return r.granted;
    }
    const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return r.granted;
  }

  async pickFromGallery(opts?: { type?: 'image' | 'video' | 'mixed' }): Promise<PickedMedia | null> {
    const t = opts?.type ?? 'image';
    const mediaTypes = t === 'image'
      ? ImagePicker.MediaTypeOptions.Images
      : t === 'video'
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.All;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 1,                // не сжимаем здесь — compressImage отдельно
      allowsEditing: false,
      exif: false,
    });
    if (result.canceled || result.assets.length === 0) return null;
    return assetToPicked(result.assets[0]);
  }

  async takePhoto(): Promise<PickedMedia | null> {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      exif: false,
    });
    if (result.canceled || result.assets.length === 0) return null;
    return assetToPicked(result.assets[0]);
  }

  async compressImage(uri: string, opts: { maxBytes: number; maxDimension: number }): Promise<PickedMedia> {
    // Two-pass: первый — resize до maxDimension; если file всё ещё большой,
    // второй — снижаем JPEG quality.
    let currentUri = uri;
    let result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: opts.maxDimension } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );
    currentUri = result.uri;

    let info = await FileSystem.getInfoAsync(currentUri);
    let bytes = (info.exists && 'size' in info && typeof info.size === 'number') ? info.size : 0;

    // Второй pass если всё ещё больше maxBytes.
    if (bytes > opts.maxBytes) {
      const quality = Math.max(0.4, opts.maxBytes / bytes * 0.85);
      result = await ImageManipulator.manipulateAsync(
        currentUri, [],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
      );
      currentUri = result.uri;
      info = await FileSystem.getInfoAsync(currentUri);
      bytes = (info.exists && 'size' in info && typeof info.size === 'number') ? info.size : 0;
    }

    return {
      uri: currentUri,
      mime: 'image/jpeg',
      width: result.width ?? null,
      height: result.height ?? null,
      durationS: null,
      bytes,
    };
  }
}

function assetToPicked(a: ImagePicker.ImagePickerAsset): PickedMedia {
  return {
    uri: a.uri,
    mime: a.mimeType ?? guessMimeFromUri(a.uri),
    width: a.width ?? null,
    height: a.height ?? null,
    durationS: a.duration ? a.duration / 1000 : null,
    bytes: a.fileSize ?? 0,
  };
}

function guessMimeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return 'application/octet-stream';
}
