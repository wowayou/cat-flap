import { describe, expect, it } from 'vitest';
import { bestKey, KEYS, parseBest, SettingsStore, type KeyValueStore } from '../src/storage/settings.ts';

function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('parseBest', () => {
  it('accepts non-negative integers and rejects everything else', () => {
    expect(parseBest('42')).toBe(42);
    expect(parseBest('0')).toBe(0);
    for (const bad of [null, '', ' ', '-3', '2.5', 'NaN', 'Infinity', 'abc', '1e309', '99999999']) {
      expect(parseBest(bad)).toBe(0);
    }
  });
});

describe('SettingsStore', () => {
  it('defaults: best 0, sound on', () => {
    expect(new SettingsStore(memory()).load()).toEqual({ best: 0, soundOn: true });
  });

  it('round-trips best score and sound', () => {
    const backing = memory();
    const a = new SettingsStore(backing);
    a.saveBest(17);
    a.saveSound(false);
    // A fresh store over the same storage = a page reload.
    expect(new SettingsStore(backing).load()).toEqual({ best: 17, soundOn: false });
    expect(backing.data[KEYS.best]).toBe('17');
  });

  it('survives storage that is missing or throws', () => {
    expect(new SettingsStore(null).load()).toEqual({ best: 0, soundOn: true });
    const hostile: KeyValueStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const store = new SettingsStore(hostile);
    expect(store.load()).toEqual({ best: 0, soundOn: true });
    expect(() => store.saveBest(5)).not.toThrow();
    expect(() => store.saveSound(false)).not.toThrow();
  });

  it('ignores a corrupted best score', () => {
    expect(new SettingsStore(memory({ [KEYS.best]: '{"x":1}' })).load().best).toBe(0);
  });

  it('keeps a name, and one random device id across reloads', () => {
    const backing = memory();
    const a = new SettingsStore(backing);
    expect(a.loadName()).toBe('');
    a.saveName('小橘');
    const id = a.playerId(() => 0.5);
    expect(id).toBeGreaterThan(0);
    const b = new SettingsStore(backing);
    expect(b.loadName()).toBe('小橘');
    expect(b.playerId(() => 0.9)).toBe(id);
  });

  it('replaces a corrupted device id, and still works without storage', () => {
    expect(new SettingsStore(memory({ [KEYS.pid]: 'abc' })).playerId(() => 0)).toBe(1);
    expect(new SettingsStore(null).playerId(() => 0.25)).toBeGreaterThan(0);
  });
});

describe('maps', () => {
  it('keeps a best per map; the garden keeps the original key', () => {
    const backing = memory({ [KEYS.best]: '31' });
    const store = new SettingsStore(backing);
    expect(store.loadBest('garden')).toBe(31);
    expect(store.loadBest('moon')).toBe(0);
    store.saveBest(12, 'moon');
    store.saveBest(40);
    const again = new SettingsStore(backing);
    expect(again.loadBest('moon')).toBe(12);
    expect(again.loadBest('garden')).toBe(40);
    expect(again.load().best).toBe(40);
    expect(backing.data[bestKey('moon')]).toBe('12');
  });

  it('remembers the map last picked, falling back to the garden', () => {
    const backing = memory();
    expect(new SettingsStore(backing).loadMap()).toBe('garden');
    new SettingsStore(backing).saveMap('clouds');
    expect(new SettingsStore(backing).loadMap()).toBe('clouds');
    expect(new SettingsStore(memory({ [KEYS.map]: 'atlantis' })).loadMap()).toBe('garden');
    expect(new SettingsStore(null).loadMap()).toBe('garden');
  });
});
