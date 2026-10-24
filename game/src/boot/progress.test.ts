import { describe, expect, it } from 'vitest';
import type { Entry } from './manifest';
import { formatBytes, IMAGE_WEIGHT, LoadTracker } from './progress';

const json = (key: string, optional = false): Entry => ({ key, url: `/assets/${key}.json`, kind: 'json', optional });
const image = (key: string): Entry => ({ key, url: `/assets/${key}.png`, kind: 'image' });

describe('load tracker', () => {
  it('weights images over JSON and counts bytes of files in flight', () => {
    const t = new LoadTracker(() => 0);
    t.plan([json('a'), image('b')]);
    t.done('a', 100);
    expect(t.summary().fraction).toBeCloseTo(1 / (1 + IMAGE_WEIGHT));
    t.start('b'); t.bytes('b', 50, 100);
    expect(t.summary().fraction).toBeCloseTo((1 + IMAGE_WEIGHT / 2) / (1 + IMAGE_WEIGHT));
    t.done('b');
    expect(t.summary()).toMatchObject({ files: 2, done: 2, bytes: 200, fraction: 1 });
  });
  it('never moves the bar backwards when more files are planned', () => {
    const t = new LoadTracker(() => 0);
    t.plan([json('stage')]); t.done('stage');
    expect(t.summary().fraction).toBe(1);
    t.plan([image('plate')]);
    expect(t.summary().fraction).toBe(1);
    expect(t.summary().done).toBe(1);
  });
  it('separates required errors from optional missing files', () => {
    const t = new LoadTracker(() => 0);
    t.plan([json('stage'), json('atmosphere', true)]);
    t.fail('stage', 'HTTP 404'); t.fail('atmosphere', 'HTTP 404');
    const s = t.summary();
    expect(s.errors).toEqual([{ key: 'stage', url: '/assets/stage.json', reason: 'HTTP 404', optional: false }]);
    expect(s.missing.map(f => f.key)).toEqual(['atmosphere']);
  });
  it('a retry re-plans failed files but keeps finished ones', () => {
    const t = new LoadTracker(() => 0);
    t.plan([json('a'), json('b')]);
    t.done('a'); t.fail('b', 'timed out');
    t.plan([json('a'), json('b')]);
    expect(t.status('a')).toBe('done');
    expect(t.status('b')).toBe('queued');
    expect(t.summary().errors).toEqual([]);
  });
  it('reports a stall only while files are pending', () => {
    let now = 0;
    const t = new LoadTracker(() => now);
    t.plan([json('a')]);
    now = 30_000;
    expect(t.stalled(25_000)).toBe(true);
    t.done('a');
    now = 90_000;
    expect(t.stalled(25_000)).toBe(false);
  });
  it('tells the boot log when a file changes status', () => {
    const t = new LoadTracker(() => 0), seen: string[] = [];
    t.onChange = f => seen.push(`${f.entry.key}:${f.status}`);
    t.plan([json('a')]); t.start('a'); t.bytes('a', 1, 2); t.done('a');
    expect(seen).toEqual(['a:loading', 'a:done']);
  });
  it('formats bytes', () => {
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25.0 MB');
  });
});
