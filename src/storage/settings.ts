/**
 * The only persisted state: best score and the sound switch (localStorage).
 * Storage can be missing or throw (private browsing, disabled cookies, quota),
 * so every access is guarded and the game falls back to in-memory values.
 */

export const KEYS = {
  best: 'catflap.best',
  sound: 'catflap.sound',
} as const;

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export interface Settings {
  best: number;
  soundOn: boolean;
}

/** A stored best score, or 0 if missing / corrupted / implausible. */
export function parseBest(raw: string | null): number {
  if (raw === null || raw.trim() === '') return 0;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 && n < 1_000_000 ? n : 0;
}

export class SettingsStore {
  private readonly storage: KeyValueStore | null;

  constructor(storage: KeyValueStore | null) {
    this.storage = storage;
  }

  load(): Settings {
    return {
      best: parseBest(this.read(KEYS.best)),
      soundOn: this.read(KEYS.sound) !== 'off',
    };
  }

  saveBest(best: number): void {
    this.write(KEYS.best, String(Math.max(0, Math.floor(best))));
  }

  saveSound(on: boolean): void {
    this.write(KEYS.sound, on ? 'on' : 'off');
  }

  private read(key: string): string | null {
    try {
      return this.storage ? this.storage.getItem(key) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Quota or privacy mode: keep playing, just don't persist.
    }
  }
}

/** localStorage if it is usable, otherwise null. */
export function browserStorage(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = 'catflap.probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
