// GPX 1.1 serializer для экспорта трека в формате, совместимом с Garmin / Strava /
// gpsbabel и прочими инструментами. ТЗ §7.2 / FR-018.

import type { Point, Session } from './types';

export type GpxOptions = {
  /** Имя приложения, попадает в creator-атрибут. */
  appName?: string;
  /** Имя трека (попадает в <name>). По умолчанию ISO-дата старта. */
  trackName?: string;
  /** Произвольное описание (попадает в <desc>). */
  trackDescription?: string;
};

/**
 * Сериализовать сессию в GPX 1.1 XML.
 * Включает метаданные (creator, time), один <trk> с одним <trkseg>.
 * Высоты включаются если есть. Время — ISO 8601 UTC.
 */
export function serializeToGpx(
  session: Pick<Session, 'startedAt' | 'endedAt'>,
  points: readonly Point[],
  options: GpxOptions = {},
): string {
  const appName = options.appName ?? 'Running Ecosystem';
  const startIso = new Date(session.startedAt).toISOString();
  const trackName = options.trackName ?? `Пробежка ${startIso}`;
  const xmlEscape = (s: string): string =>
    s.replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&apos;';
        default:
          return c;
      }
    });

  const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${xmlEscape(appName)}"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${xmlEscape(trackName)}</name>
    <time>${startIso}</time>
  </metadata>
  <trk>
    <name>${xmlEscape(trackName)}</name>${
      options.trackDescription
        ? `\n    <desc>${xmlEscape(options.trackDescription)}</desc>`
        : ''
    }
    <trkseg>`;

  const body = points
    .map((p) => {
      const time = new Date(p.timestamp).toISOString();
      const ele = p.altitude !== null ? `\n        <ele>${p.altitude}</ele>` : '';
      return `      <trkpt lat="${p.latitude}" lon="${p.longitude}">${ele}
        <time>${time}</time>
      </trkpt>`;
    })
    .join('\n');

  const footer = `
    </trkseg>
  </trk>
</gpx>
`;
  return header + '\n' + body + footer;
}
