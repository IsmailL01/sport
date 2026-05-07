// Speech adapter — обёртка над system TTS.
// Phase 6 / P6-A-09.
//
// Принцип: voice cues — строго опциональны. По умолчанию — silent (noop),
// чтобы build не зависел от expo-speech. Если в будущем добавим expo-speech
// в зависимости — поменяем default impl на real.

export interface SpeechAdapter {
  speak(text: string, opts?: { language?: string; rate?: number }): void;
  stop(): void;
  /** Доступен ли real TTS на устройстве. */
  isAvailable(): boolean;
}

const noopSpeech: SpeechAdapter = {
  speak: (text) => {
    if (__DEV__) console.log('[speech.noop]', text);
  },
  stop: () => {},
  isAvailable: () => false,
};

let active: SpeechAdapter = noopSpeech;

/** Зарегистрировать другой адаптер (например, expo-speech-based). */
export function setSpeechAdapter(adapter: SpeechAdapter): void {
  active = adapter;
}

export function speak(text: string, opts?: { language?: string; rate?: number }): void {
  active.speak(text, opts);
}

export function stopSpeech(): void {
  active.stop();
}

export function speechIsAvailable(): boolean {
  return active.isAvailable();
}
