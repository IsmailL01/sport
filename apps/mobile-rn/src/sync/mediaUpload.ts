// Media upload pipeline.
// Phase 8 / B3.
//
// Flow (для каждой image/video которую user attach-ит):
//   1. compressImage local (если image)
//   2. POST /uploads → init: server создаёт row status=pending,
//      возвращает presignedPut + mediaId
//   3. PUT bytes напрямую к presignedPut URL (не идёт через наш сервер)
//   4. POST /uploads/{id}/complete + width/height/durationMs →
//      server stat'ит S3, status=ready
//   5. Caller получает mediaId и шлёт message с { kind: 'image', mediaId }
//
// На failures throw Error — caller (chatStore.sendMedia) обрабатывает.

import * as FileSystem from 'expo-file-system/legacy';
import { apiClient } from '../auth/apiClient';
import { getMediaAdapter } from '../media';
import type { PickedMedia } from '../media/MediaAdapter';

export type UploadResult = {
  mediaId: string;
  width: number | null;
  height: number | null;
  durationS: number | null;
  mime: string;
  bytes: number;
};

const IMAGE_MAX_DIM = 1920;
const IMAGE_MAX_BYTES = 9 * 1024 * 1024; // < 10MB server limit

export async function uploadImage(picked: PickedMedia): Promise<UploadResult> {
  if (!apiClient.isAuthenticated()) {
    throw new Error('not authenticated');
  }

  // 1) Compress (если image и больше лимита).
  let final = picked;
  const isImage = picked.mime.startsWith('image/');
  if (isImage && (picked.bytes > IMAGE_MAX_BYTES || (picked.width ?? 0) > IMAGE_MAX_DIM)) {
    final = await getMediaAdapter().compressImage(picked.uri, {
      maxBytes: IMAGE_MAX_BYTES,
      maxDimension: IMAGE_MAX_DIM,
    });
  }

  // 2) Init upload.
  const kind = picked.mime.startsWith('image/') ? 'image'
    : picked.mime.startsWith('video/') ? 'video'
      : picked.mime.startsWith('audio/') ? 'audio'
        : 'image';
  const initResp = await apiClient.api('/uploads', {
    method: 'POST',
    body: JSON.stringify({
      kind,
      mime: final.mime,
      sizeBytes: final.bytes,
    }),
  });
  if (!initResp.ok) {
    const text = await initResp.text();
    throw new Error(`init upload failed: ${initResp.status} ${text}`);
  }
  const init = (await initResp.json()) as {
    mediaId: string; uploadUrl: string; expiresInS: number;
  };

  // 3) Direct PUT bytes к presigned URL.
  const uploadResult = await FileSystem.uploadAsync(init.uploadUrl, final.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': final.mime,
    },
  });
  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`upload PUT failed: HTTP ${uploadResult.status} ${uploadResult.body}`);
  }

  // 4) Confirm complete.
  const completeResp = await apiClient.api(`/uploads/${init.mediaId}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      width: final.width,
      height: final.height,
      durationMs: final.durationS !== null ? Math.round(final.durationS * 1000) : null,
    }),
  });
  if (!completeResp.ok) {
    const text = await completeResp.text();
    throw new Error(`complete failed: ${completeResp.status} ${text}`);
  }

  return {
    mediaId: init.mediaId,
    width: final.width,
    height: final.height,
    durationS: final.durationS,
    mime: final.mime,
    bytes: final.bytes,
  };
}

/** Получить presigned download URL для отображения media в bubble. */
export async function fetchMediaURL(mediaId: string): Promise<string | null> {
  if (!apiClient.isAuthenticated()) return null;
  try {
    const resp = await apiClient.api(`/media/${mediaId}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { downloadUrl?: string };
    return data.downloadUrl ?? null;
  } catch (e) {
    console.warn('[media] fetchMediaURL failed', e);
    return null;
  }
}
