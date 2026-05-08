// Outbox sync для исходящих сообщений мессенджера.
// Phase 8 / A5.
//
// Алгоритм (как в src/sync/syncEngine.ts:43–90):
//   1. SELECT messages WHERE status IN ('pending','failed') AND attempts < 5
//   2. Для каждого: POST /conversations/{chatId}/messages с client_msg_id
//   3. Success → markSent(client_id, server_id)
//   4. 4xx → markFailed (server отверг — больше не пробуем)
//   5. 5xx/network → markFailed (attempt++) — попробуем на следующий sync
//
// Идемпотентен: server enforces UNIQUE(conversation_id, client_msg_id).
// На повторе server вернёт 200 (existing) вместо 201 — это OK.

import { apiClient } from '../auth/apiClient';
import {
  listPendingMessages,
  markMessageFailed,
  markMessageSent,
  upsertMessage,
} from '../storage/socialRepository';

export type MessageSyncResult = {
  ok: boolean;
  pushed: number;
  failed: number;
};

export async function runMessagesPush(): Promise<MessageSyncResult> {
  if (!apiClient.isAuthenticated()) {
    return { ok: false, pushed: 0, failed: 0 };
  }
  const pending = listPendingMessages();
  let pushed = 0;
  let failed = 0;

  for (const m of pending) {
    if (m.kind !== 'text' || m.text === null) {
      // Пока (Phase A) поддерживаем только text. Media — Phase B.
      continue;
    }
    try {
      const resp = await apiClient.api(`/conversations/${m.chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          clientMsgId: m.clientId,
          kind: 'text',
          body: m.text,
          replyToId: m.replyToMessageId,
        }),
      });
      if (!resp.ok) {
        // 4xx — постоянная ошибка; 5xx — временная.
        if (resp.status >= 400 && resp.status < 500) {
          // Permanent — server отверг; помечаем failed.
          markMessageFailed(m.clientId);
        } else {
          markMessageFailed(m.clientId);
        }
        failed += 1;
        continue;
      }
      const data = (await resp.json()) as { id: string };
      if (typeof data.id === 'string' && data.id !== '') {
        markMessageSent(m.clientId, data.id, 'sent');
        // Заодно update reactions/edited при необходимости — пропустим.
        // Reload и upsert обновит UI.
        const refreshed = { ...m, id: data.id, status: 'sent' as const };
        upsertMessage(refreshed);
        pushed += 1;
      } else {
        markMessageFailed(m.clientId);
        failed += 1;
      }
    } catch (e) {
      console.warn('[messageSync] push failed', m.clientId, e);
      markMessageFailed(m.clientId);
      failed += 1;
    }
  }
  return { ok: true, pushed, failed };
}
