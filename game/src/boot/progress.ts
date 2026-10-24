import type { Entry } from './manifest';

/** An image or atlas sheet counts this many JSON files in the progress fraction. */
export const IMAGE_WEIGHT = 8;
export type FileStatus = 'queued' | 'loading' | 'done' | 'failed' | 'skipped';
export interface FileState { entry: Entry; status: FileStatus; loaded: number; total: number; reason?: string }
export interface Failure { key: string; url: string; reason: string; optional: boolean }
export interface Summary {
  files: number; done: number; failed: number; bytes: number;
  /** 0–1, by files with a byte-weighted share for files in flight; never goes backwards. */
  fraction: number;
  /** Required files that failed: the screen offers Retry / Continue for these. */
  errors: Failure[];
  /** Optional files that were missing: the game runs without them. */
  missing: Failure[];
  /** The most recent file that changed, for the boot log. */
  last?: FileState;
}

/**
 * Pure bookkeeping for the loading screen: which files are planned, in flight, done or failed, how many bytes
 * arrived, and when anything last moved (the stall watchdog). No Phaser, so it is unit-tested.
 */
export class LoadTracker {
  private files = new Map<string, FileState>();
  private shown = 0;
  private last?: FileState;
  lastActivity: number;
  /** Called whenever a file changes status or receives bytes (the loading screen's boot log). */
  onChange?: (file: FileState) => void;

  constructor(private now: () => number = () => performance.now()) { this.lastActivity = now(); }

  plan(entries: Entry[]): void {
    for (const entry of entries) {
      const known = this.files.get(entry.key);
      // A retry re-plans failed files; finished ones stay finished.
      if (!known || known.status === 'failed') this.files.set(entry.key, { entry, status: 'queued', loaded: 0, total: 0 });
    }
    this.touch();
  }

  start(key: string): void { this.set(key, { status: 'loading' }); }
  bytes(key: string, loaded: number, total: number): void { this.set(key, { loaded, total: Math.max(total, loaded) }); }
  done(key: string, bytes?: number): void {
    const file = this.files.get(key);
    const size = bytes ?? Math.max(file?.loaded ?? 0, file?.total ?? 0);
    this.set(key, { status: 'done', loaded: size, total: size });
  }
  fail(key: string, reason: string): void { this.set(key, { status: 'failed', reason }); }
  /** Already cached (a region swap, a retry): counts as done without a request. */
  skip(key: string): void { this.set(key, { status: 'skipped' }); }

  status(key: string): FileStatus | undefined { return this.files.get(key)?.status; }

  /** True when nothing has moved for `ms` while files are still queued or in flight. */
  stalled(ms: number): boolean {
    const pending = [...this.files.values()].some(f => f.status === 'queued' || f.status === 'loading');
    return pending && this.now() - this.lastActivity > ms;
  }

  summary(): Summary {
    const all = [...this.files.values()];
    const finished = (f: FileState) => f.status === 'done' || f.status === 'skipped' || f.status === 'failed';
    const doneCount = all.filter(finished).length;
    // Images weigh more than JSON (they are most of the bytes); a file in flight counts by its bytes so far.
    const weight = (f: FileState) => f.entry.kind === 'json' ? 1 : IMAGE_WEIGHT;
    const total = all.reduce((sum, f) => sum + weight(f), 0);
    const reached = all.reduce((sum, f) => sum + weight(f) * (finished(f) ? 1
      : f.status === 'loading' && f.total > 0 ? Math.min(1, f.loaded / f.total) : 0), 0);
    const raw = total ? Math.min(1, reached / total) : 0;
    this.shown = Math.max(this.shown, raw);
    const failure = (f: FileState): Failure => ({ key: f.entry.key, url: f.entry.url, reason: f.reason ?? 'failed', optional: !!f.entry.optional });
    const failed = all.filter(f => f.status === 'failed');
    return {
      files: all.length, done: doneCount, failed: failed.length,
      bytes: all.reduce((sum, f) => sum + f.loaded, 0),
      fraction: this.shown,
      errors: failed.filter(f => !f.entry.optional).map(failure),
      missing: failed.filter(f => f.entry.optional).map(failure),
      last: this.last,
    };
  }

  private set(key: string, patch: Partial<FileState>): void {
    const file = this.files.get(key);
    if (!file) return;
    const before = file.status;
    Object.assign(file, patch);
    this.last = file;
    this.touch();
    if (file.status !== before) this.onChange?.(file);
  }

  private touch(): void { this.lastActivity = this.now(); }
}

/** "4.2 MB", "380 KB" – for the loading screen. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
