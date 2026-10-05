import { isMapId, type MapId } from '../game/maps.ts';

/**
 * The only persisted state (localStorage): best score per map, the map last
 * picked, the sound switch, and for challenge links the name shown on your
 * ghost and a random device id.
 * Storage can be missing or throw (private browsing, disabled cookies, quota),
 * so every access is guarded and the game falls back to in-memory values.
 */

export const KEYS = {
  /** The garden's best (the key from before there were other maps, so old records carry over). */
  best: 'catflap.best',
  sound: 'catflap.sound',
  name: 'catflap.name',
  pid: 'catflap.pid',
  map: 'catflap.map',
} as const;

/** Where a map's best score is kept. */
export const bestKey = (map: MapId): string => (map === 'garden' ? KEYS.best : `${KEYS.best}.${map}`);

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

  loadBest(map: MapId): number {
    return parseBest(this.read(bestKey(map)));
  }

  saveBest(best: number, map: MapId = 'garden'): void {
    this.write(bestKey(map), String(Math.max(0, Math.floor(best))));
  }

  /** The map picked last time (the garden at first, or if what's stored isn't a map). */
  loadMap(): MapId {
    const map = this.read(KEYS.map);
    return isMapId(map) ? map : 'garden';
  }

  saveMap(map: MapId): void {
    this.write(KEYS.map, map);
  }

  saveSound(on: boolean): void {
    this.write(KEYS.sound, on ? 'on' : 'off');
  }

  /** The name friends see on your ghost ('' until you pick one). */
  loadName(): string {
    return this.read(KEYS.name) ?? '';
  }

  saveName(name: string): void {
    this.write(KEYS.name, name);
  }

  /**
   * A random id for this device, created on first use. It only lets a link
   * recognise your own earlier run; it identifies nothing outside the link.
   */
  playerId(random: () => number = Math.random): number {
    const stored = Number(this.read(KEYS.pid));
    if (Number.isInteger(stored) && stored > 0 && stored <= 0xffffffff) return stored;
    const id = 1 + Math.floor(random() * 0xfffffffe);
    this.write(KEYS.pid, String(id));
    return id;
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
