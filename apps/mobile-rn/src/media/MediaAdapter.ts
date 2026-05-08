// MediaAdapter — interface для выбора/съёмки/сжатия медиа.
// Phase 8 / B3.

export type PickedMedia = {
  uri: string;        // file:// или ph:// URI на устройстве
  mime: string;       // image/jpeg | image/png | video/mp4 ...
  width: number | null;
  height: number | null;
  durationS: number | null; // для video
  bytes: number;
};

export type MediaScope = 'gallery' | 'camera';

export interface MediaAdapter {
  /** Запросить permission. true = granted. */
  requestPermission(scope: MediaScope): Promise<boolean>;

  /** Выбрать одно фото из галереи. */
  pickFromGallery(opts?: { type?: 'image' | 'video' | 'mixed' }): Promise<PickedMedia | null>;

  /** Сделать фото камерой. */
  takePhoto(): Promise<PickedMedia | null>;

  /**
   * Сжать image до maxDimension и не больше maxBytes.
   * Возвращает новый файл (тот же / меньше). На NOOP возвращает оригинал.
   */
  compressImage(uri: string, opts: { maxBytes: number; maxDimension: number }): Promise<PickedMedia>;
}
