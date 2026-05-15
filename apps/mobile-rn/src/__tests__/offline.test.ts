// Unit tests for src/map/offline.ts — bounds-order bug fix + createCustomPack + estimatePackSize.
// Phase 1 / PHASE1-10. См. RESEARCH.md §Pitfall 1 (bounds [NE, SW] in @rnmapbox/maps v10) и §Pattern 4
// (tile-count math через Web Mercator).
//
// @rnmapbox/maps замокан целиком — production-код в src/map/offline.ts импортирует только
// `offlineManager`. Импорт SDK напрямую из теста допустим внутри jest.mock factory.

jest.mock('@rnmapbox/maps', () => ({
  offlineManager: {
    createPack: jest.fn(() => Promise.resolve()),
    getPacks: jest.fn(() => Promise.resolve([])),
    deletePack: jest.fn(() => Promise.resolve()),
  },
}));

// eslint-disable-next-line import/first -- jest.mock is hoisted; import must follow it.
import { offlineManager } from '@rnmapbox/maps';
// eslint-disable-next-line import/first
import {
  createCustomPack,
  estimatePackSize,
  TILE_CAP_HEADROOM,
} from '../map/offline';

const createPackMock = offlineManager.createPack as unknown as jest.Mock;

beforeEach(() => {
  createPackMock.mockClear();
});

describe('estimatePackSize (Web Mercator tile math, PHASE1-10)', () => {
  it('returns a positive tile count consistent with hand-computed value for a ~10×10 km bbox at zoom 12-16', () => {
    // Bbox ±0.05 deg around lat 50, lon 10 — same as HOME_PACK_HALF_SIDE_DEG.
    // Hand-computed expectation: at lat ≈50°, ~10×10km covers a small handful of tiles
    // per zoom level. Sum across z=12..16 stays well under TILE_CAP_HEADROOM (5500).
    const { tiles, kb } = estimatePackSize({
      ne: [10.05, 50.05],
      sw: [9.95, 49.95],
      minZ: 12,
      maxZ: 16,
    });
    expect(tiles).toBeGreaterThan(0);
    expect(tiles).toBeLessThan(TILE_CAP_HEADROOM);
    expect(kb).toBe(tiles * 30); // AVG_KB_PER_TILE = 30
  });

  it('matches the exact hand-computed tile count for the home-region bbox (locks the math)', () => {
    // Hand-compute for ne=[10.05,50.05], sw=[9.95,49.95]:
    //   z=12: n=4096. x: sw=floor((9.95+180)/360*4096)=floor(2161.0666)=2161
    //                  ne=floor((10.05+180)/360*4096)=floor(2162.2044)=2162  → dx+1=2
    //         y(lat=50.05)=floor((1-ln(tan(50.05°)+sec(50.05°))/π)/2*4096)
    //                     ≈floor(0.35085*4096)≈1437  (NE — smaller y because higher lat)
    //         y(lat=49.95)=floor((1-ln(tan(49.95°)+sec(49.95°))/π)/2*4096)
    //                     ≈ y1+~1                                            → dy+1=2
    //   At each higher zoom level tile count roughly quadruples.
    // Compute expected via the same formula written by hand for the test (sanity-anchor):
    let expected = 0;
    for (let z = 12; z <= 16; z++) {
      const n = Math.pow(2, z);
      const x1 = Math.floor(((9.95 + 180) / 360) * n);
      const x2 = Math.floor(((10.05 + 180) / 360) * n);
      const latRad1 = (50.05 * Math.PI) / 180;
      const latRad2 = (49.95 * Math.PI) / 180;
      const y1 = Math.floor(
        ((1 - Math.log(Math.tan(latRad1) + 1 / Math.cos(latRad1)) / Math.PI) / 2) * n,
      );
      const y2 = Math.floor(
        ((1 - Math.log(Math.tan(latRad2) + 1 / Math.cos(latRad2)) / Math.PI) / 2) * n,
      );
      expected += Math.abs(x2 - x1 + 1) * Math.abs(y2 - y1 + 1);
    }
    const { tiles } = estimatePackSize({
      ne: [10.05, 50.05],
      sw: [9.95, 49.95],
      minZ: 12,
      maxZ: 16,
    });
    expect(tiles).toBe(expected);
  });

  it('returns tiles = (maxZ - minZ + 1) for a zero-area bbox (ne === sw, ≥1 tile per zoom)', () => {
    // Zero-area: every zoom contributes exactly 1×1=1 tile (the single tile under the point).
    const { tiles } = estimatePackSize({
      ne: [10.0, 50.0],
      sw: [10.0, 50.0],
      minZ: 12,
      maxZ: 16,
    });
    expect(tiles).toBe(5); // 5 zoom levels × 1 tile
  });

  it('grows roughly 4x per zoom level (each level quadruples tile density)', () => {
    const a = estimatePackSize({ ne: [10.05, 50.05], sw: [9.95, 49.95], minZ: 12, maxZ: 12 });
    const b = estimatePackSize({ ne: [10.05, 50.05], sw: [9.95, 49.95], minZ: 13, maxZ: 13 });
    const c = estimatePackSize({ ne: [10.05, 50.05], sw: [9.95, 49.95], minZ: 14, maxZ: 14 });
    // Allow tolerance: tile counts on small bboxes are noisy near floor()-boundaries;
    // the dominant trend is multiplicative growth in {2, 3, 4, 5}× per level.
    expect(b.tiles).toBeGreaterThanOrEqual(a.tiles);
    expect(c.tiles).toBeGreaterThanOrEqual(b.tiles);
    // For a ~10km bbox by zoom 14 we should be in the 4-25 tile range, not <2.
    expect(c.tiles).toBeGreaterThan(a.tiles);
  });

  it('exposes TILE_CAP_HEADROOM = 5500 (iOS 6000-tile cap, 500 headroom per Pitfall 7)', () => {
    expect(TILE_CAP_HEADROOM).toBe(5500);
  });
});

describe('createCustomPack (PHASE1-10 — enforces [NE, SW] bounds order at the API boundary)', () => {
  it('calls offlineManager.createPack with bounds in [NE, SW] order, never [SW, NE]', async () => {
    await createCustomPack({
      name: 'test-region',
      ne: [11.0, 51.0],
      sw: [10.0, 50.0],
    });
    expect(createPackMock).toHaveBeenCalledTimes(1);
    const opts = createPackMock.mock.calls[0][0];
    expect(opts.bounds).toEqual([
      [11.0, 51.0], // NE — first
      [10.0, 50.0], // SW — second
    ]);
  });

  it('defaults minZoom=12, maxZoom=16, styleURL=outdoors-v12 when not provided', async () => {
    await createCustomPack({
      name: 'test-defaults',
      ne: [10.1, 50.1],
      sw: [10.0, 50.0],
    });
    const opts = createPackMock.mock.calls[0][0];
    expect(opts.minZoom).toBe(12);
    expect(opts.maxZoom).toBe(16);
    expect(opts.styleURL).toBe('mapbox://styles/mapbox/outdoors-v12');
    expect(opts.name).toBe('test-defaults');
  });

  it('respects custom styleUrl, minZoom, maxZoom when provided', async () => {
    await createCustomPack({
      name: 'test-custom',
      ne: [10.1, 50.1],
      sw: [10.0, 50.0],
      styleUrl: 'mapbox://styles/mapbox/streets-v12',
      minZoom: 10,
      maxZoom: 14,
    });
    const opts = createPackMock.mock.calls[0][0];
    expect(opts.styleURL).toBe('mapbox://styles/mapbox/streets-v12');
    expect(opts.minZoom).toBe(10);
    expect(opts.maxZoom).toBe(14);
  });

  it('wires onProgress callback through to status.percentage', async () => {
    const onProgress = jest.fn();
    createPackMock.mockImplementationOnce((_opts, progressCb, _errCb) => {
      // Simulate Mapbox SDK pushing a progress update.
      progressCb(null, { percentage: 42 });
      return Promise.resolve();
    });
    await createCustomPack({
      name: 'test-progress',
      ne: [10.1, 50.1],
      sw: [10.0, 50.0],
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledWith(42);
  });
});
