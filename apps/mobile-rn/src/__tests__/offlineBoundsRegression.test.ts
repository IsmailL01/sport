// Regression test for the long-standing bounds-order bug in src/map/offline.ts.
// Phase 1 / PHASE1-10. См. RESEARCH.md §Pitfall 1 + 01-06-PLAN-offline-region-picker.md.
//
// Контракт @rnmapbox/maps@10.3.0 OfflineCreatePackOptions: `const [ne, sw] = bounds;`
// До фикса downloadHomeRegion передавал `[sw, ne]` — это работало случайно потому что
// home-region симметрична ±0.05deg по обеим осям. После фикса порядок строго `[ne, sw]`.
//
// Этот тест пинит контракт: downloadHomeRegion должен звать offlineManager.createPack
// с bounds[0] = NE-угол, bounds[1] = SW-угол. Парность с предыдущим поведением
// сохраняется (значения тех же точек), но порядок исправлен.

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
import { downloadHomeRegion } from '../map/offline';

const createPackMock = offlineManager.createPack as unknown as jest.Mock;
const getPacksMock = offlineManager.getPacks as unknown as jest.Mock;

beforeEach(() => {
  createPackMock.mockClear();
  getPacksMock.mockClear();
  getPacksMock.mockResolvedValue([]);
});

describe('downloadHomeRegion bounds-order regression (PHASE1-10)', () => {
  it('passes bounds in [NE, SW] order after the fix — NE is first, SW is second', async () => {
    await downloadHomeRegion({ latitude: 50.0, longitude: 10.0 });
    expect(createPackMock).toHaveBeenCalledTimes(1);
    const callArgs = createPackMock.mock.calls[0][0];
    expect(callArgs.bounds).toEqual([
      [10.05, 50.05], // NE (+0.05 deg lon, +0.05 deg lat)
      [9.95, 49.95], //  SW (-0.05 deg lon, -0.05 deg lat)
    ]);
  });

  it('uses correct pack name "home-region" + default zoom 12-16 + default outdoors-v12 style', async () => {
    await downloadHomeRegion({ latitude: 50.0, longitude: 10.0 });
    const callArgs = createPackMock.mock.calls[0][0];
    expect(callArgs.name).toBe('home-region');
    expect(callArgs.minZoom).toBe(12);
    expect(callArgs.maxZoom).toBe(16);
    expect(callArgs.styleURL).toBe('mapbox://styles/mapbox/outdoors-v12');
  });

  it('is idempotent — does not call createPack if a "home-region" pack already exists', async () => {
    getPacksMock.mockResolvedValueOnce([{ name: 'home-region', bounds: [], state: 'complete' }]);
    await downloadHomeRegion({ latitude: 50.0, longitude: 10.0 });
    expect(createPackMock).not.toHaveBeenCalled();
  });
});
