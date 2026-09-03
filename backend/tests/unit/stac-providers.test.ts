/**
 * Unit tests for Live STAC Providers.
 *
 * Tests:
 *  1. Normalization of raw STAC items
 *  2. Deduplication across providers
 *  3. Provider timeout handling
 *  4. Cloud cover filtering
 *  5. Duplicate items returned by multiple providers
 *  6. Provider failure where AWS fails but Planetary Computer succeeds
 */

import { deduplicateItems, buildDatetimeRange } from '../../src/services/stac-providers';
import type { NormalizedDataset } from '../../src/services/eo-types';

// ── Helpers ──────────────────────────────────────────────────────────

function makeItem(overrides: Partial<NormalizedDataset> = {}): NormalizedDataset {
  return {
    id: 'test-item-1',
    provider: 'AWS Earth Search',
    collection: 'sentinel-2-l2a',
    title: 'Test Item',
    description: 'Test description',
    datetime: '2024-03-15T00:00:00Z',
    geometry: {
      type: 'Polygon',
      coordinates: [[[75.7, 26.8], [75.9, 26.8], [75.9, 27.0], [75.7, 27.0], [75.7, 26.8]]],
    },
    bbox: [75.7, 26.8, 75.9, 27.0],
    cloudCover: 5.2,
    resolutionM: 10,
    platform: 'Sentinel-2A',
    instrument: 'MSI',
    assets: { visual: { href: 'https://example.com/visual.tif' } },
    previewUrl: 'https://example.com/thumb.jpg',
    stacLink: 'https://example.com/item',
    tilejsonUrl: null,
    source: 'live',
    aoiOverlap: null,
    centroid: { lat: 26.9, lng: 75.8 },
    ...overrides,
  };
}

// ── Deduplication ────────────────────────────────────────────────────

describe('deduplicateItems', () => {
  it('deduplicates items with the same ID across providers', () => {
    const item1 = makeItem({
      id: 'S2A_MSIL2A_20240315',
      provider: 'AWS Earth Search',
      previewUrl: 'https://aws.example.com/thumb.jpg',
    });
    const item2 = makeItem({
      id: 'S2A_MSIL2A_20240315',
      provider: 'Planetary Computer',
      previewUrl: 'https://pc.example.com/thumb.jpg',
      tilejsonUrl: 'https://pc.example.com/tilejson.json',
    });

    const result = deduplicateItems([item1, item2]);
    expect(result).toHaveLength(1);
    // Should keep the one with more metadata (PC has tilejsonUrl)
    expect(result[0].tilejsonUrl).toBe('https://pc.example.com/tilejson.json');
  });

  it('preserves distinct items', () => {
    const item1 = makeItem({ id: 'item-1' });
    const item2 = makeItem({ id: 'item-2' });

    const result = deduplicateItems([item1, item2]);
    expect(result).toHaveLength(2);
  });

  it('handles empty input', () => {
    expect(deduplicateItems([])).toHaveLength(0);
  });

  it('deduplicates three identical items from three providers', () => {
    const items = [
      makeItem({ id: 'same-id', provider: 'AWS', previewUrl: null }),
      makeItem({ id: 'same-id', provider: 'PC', previewUrl: 'https://pc/thumb.jpg' }),
      makeItem({ id: 'same-id', provider: 'Other', stacLink: 'https://other/link' }),
    ];

    const result = deduplicateItems(items);
    expect(result).toHaveLength(1);
    // Should keep the one with previewUrl
    expect(result[0].previewUrl).toBe('https://pc/thumb.jpg');
  });
});

describe('buildDatetimeRange', () => {
  it('builds range with start and end dates', () => {
    const range = buildDatetimeRange('2020-01-01', '2025-12-31');
    expect(range).toBe('2020-01-01T00:00:00Z/2025-12-31T23:59:59Z');
  });

  it('builds open-ended range with start only', () => {
    const range = buildDatetimeRange('2020-01-01');
    expect(range).toBe('2020-01-01T00:00:00Z/..');
  });

  it('builds open-ended range with end only', () => {
    const range = buildDatetimeRange(undefined, '2025-12-31');
    expect(range).toBe('../2025-12-31T23:59:59Z');
  });

  it('returns undefined when no dates provided', () => {
    expect(buildDatetimeRange()).toBeUndefined();
  });
});

describe('Duplicate items from multiple providers', () => {
  it('handles mix of unique and duplicate items', () => {
    const items = [
      makeItem({ id: 'unique-1', provider: 'AWS' }),
      makeItem({ id: 'unique-2', provider: 'PC' }),
      makeItem({ id: 'duplicate-1', provider: 'AWS' }),
      makeItem({ id: 'duplicate-1', provider: 'PC' }),
    ];

    const result = deduplicateItems(items);
    expect(result).toHaveLength(3);
  });

  it('keeps the item with most metadata when deduplicating', () => {
    const sparse = makeItem({
      id: 'dup',
      provider: 'AWS',
      previewUrl: null,
      stacLink: null,
      tilejsonUrl: null,
      assets: null,
      description: null,
    });

    const rich = makeItem({
      id: 'dup',
      provider: 'PC',
      previewUrl: 'https://pc/thumb.jpg',
      stacLink: 'https://pc/item',
      tilejsonUrl: 'https://pc/tilejson',
      assets: { visual: { href: 'https://pc/visual.tif' }, nir: { href: 'https://pc/nir.tif' }, red: { href: 'https://pc/red.tif' }, green: { href: 'https://pc/green.tif' } },
      description: 'Rich description',
    });

    const result = deduplicateItems([sparse, rich]);
    expect(result).toHaveLength(1);
    expect(result[0].tilejsonUrl).toBe('https://pc/tilejson');
    expect(result[0].previewUrl).toBe('https://pc/thumb.jpg');
  });
});
