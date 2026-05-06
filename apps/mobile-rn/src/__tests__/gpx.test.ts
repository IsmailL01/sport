import { serializeToGpx } from '../domain/gpx';
import type { Point } from '../domain/types';

function pt(ts: number, lat: number, lon: number, alt: number | null = null): Point {
  return {
    timestamp: ts,
    latitude: lat,
    longitude: lon,
    altitude: alt,
    accuracy: 5,
    speed: null,
    heading: null,
    source: 'kalman',
  };
}

describe('serializeToGpx', () => {
  it('включает GPX header + xmlns', () => {
    const xml = serializeToGpx(
      { startedAt: 1_700_000_000_000, endedAt: 1_700_000_100_000 },
      [pt(1_700_000_000_000, 50, 10), pt(1_700_000_001_000, 50.0001, 10)],
    );
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<gpx');
    expect(xml).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(xml).toContain('creator="Running Ecosystem"');
  });

  it('пишет каждую точку как <trkpt>', () => {
    const xml = serializeToGpx(
      { startedAt: 0, endedAt: 1_000 },
      [pt(0, 50, 10), pt(1_000, 51, 11)],
    );
    expect(xml).toContain('lat="50" lon="10"');
    expect(xml).toContain('lat="51" lon="11"');
  });

  it('включает <ele> когда altitude не null', () => {
    const xml = serializeToGpx(
      { startedAt: 0, endedAt: 0 },
      [pt(0, 50, 10, 123.4)],
    );
    expect(xml).toContain('<ele>123.4</ele>');
  });

  it('опускает <ele> когда altitude null', () => {
    const xml = serializeToGpx(
      { startedAt: 0, endedAt: 0 },
      [pt(0, 50, 10, null)],
    );
    expect(xml).not.toContain('<ele>');
  });

  it('экранирует XML спецсимволы в trackName', () => {
    const xml = serializeToGpx(
      { startedAt: 0, endedAt: 0 },
      [pt(0, 50, 10)],
      { trackName: 'Бег <в> "парке" & назад' },
    );
    expect(xml).toContain(
      '<name>Бег &lt;в&gt; &quot;парке&quot; &amp; назад</name>',
    );
  });
});
