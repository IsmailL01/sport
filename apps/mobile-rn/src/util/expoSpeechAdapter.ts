// Real TTS impl via expo-speech.
// Phase 6.5 / extra.

import * as Speech from 'expo-speech';
import type { SpeechAdapter } from './speech';

export const expoSpeechAdapter: SpeechAdapter = {
  speak: (text: string, opts?: { language?: string; rate?: number }) => {
    Speech.speak(text, {
      language: opts?.language ?? 'ru-RU',
      rate: opts?.rate ?? 1.0,
      // Чтобы не накапливалась очередь длинных фраз, обрываем предыдущую.
      onError: (err) => console.warn('[speech.expo] error', err),
    });
  },
  stop: () => {
    Speech.stop().catch((e) => console.warn('[speech.expo] stop failed', e));
  },
  isAvailable: () => true,
};
