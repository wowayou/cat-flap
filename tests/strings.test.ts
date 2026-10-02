import { describe, expect, it } from 'vitest';
import { pickStrings } from '../src/ui/strings.ts';

describe('pickStrings', () => {
  it('uses Chinese for any zh locale and English otherwise', () => {
    expect(pickStrings(['zh-CN']).lang).toBe('zh-CN');
    expect(pickStrings(['zh-TW', 'en']).lang).toBe('zh-CN');
    expect(pickStrings(['en-GB']).lang).toBe('en');
    expect(pickStrings(['fr-FR', 'zh-CN']).lang).toBe('zh-CN');
    expect(pickStrings(['fr-FR']).lang).toBe('en');
    expect(pickStrings([]).lang).toBe('en');
  });

  it('both locales define every string', () => {
    const zh = pickStrings(['zh']);
    const en = pickStrings(['en']);
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const s of [zh, en]) {
      for (const [k, v] of Object.entries(s)) {
        if (typeof v === 'string') expect(v.length, k).toBeGreaterThan(0);
      }
      expect(s.livesLeft(3)).toContain('3');
      expect(s.startKeys).toContain('{key}');
    }
  });
});
