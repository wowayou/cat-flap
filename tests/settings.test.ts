import { describe, expect, it } from 'vitest';
import { KEYS, parseBest, SettingsStore, type KeyValueStore } from '../src/storage/settings.ts';

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
});
