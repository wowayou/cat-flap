import { expect, test } from '@playwright/test';

/*
 * Audio can't be eyeballed in a test, and gain numbers lie about loudness
 * (see the sibling project's LEARNINGS). So each recipe is rendered offline
 * in a real browser and measured: level, clipping, whether it reaches a
 * phone-sized speaker (energy above 500 Hz), and that it actually ends.
 */

interface Measure {
  peak: number;
  rmsDb: number;
  activeSeconds: number;
  tailPeak: number;
  speakerShare: number;
}

test('every sound effect is audible on small speakers, unclipped, and ends', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'measured once');
  await page.goto('http://localhost:4174/');
  const results = await page.evaluate(async () => {
    const path = '/src/audio/sfx.ts';
    const { SFX } = await import(/* @vite-ignore */ path);
    const rate = 44100;
    const out: Record<string, Measure> = {};
    for (const name of Object.keys(SFX)) {
      const render = async (highpass: boolean) => {
        const ctx = new OfflineAudioContext(1, Math.round(rate * 1.3), rate);
        let dest: AudioNode = ctx.destination;
        if (highpass) {
          const f = ctx.createBiquadFilter();
          f.type = 'highpass';
          f.frequency.value = 500;
          f.Q.value = -3.01; // flat (Butterworth) response, in dB per the Web Audio spec
          f.connect(ctx.destination);
          dest = f;
        }
        SFX[name](ctx, dest, 0.01);
        return (await ctx.startRendering()).getChannelData(0);
      };
      const raw = await render(false);
      const hp = await render(true);
      let peak = 0;
      let first = -1;
      let last = -1;
      for (let i = 0; i < raw.length; i++) {
        const a = Math.abs(raw[i]);
        peak = Math.max(peak, a);
        if (a > 0.002) {
          if (first < 0) first = i;
          last = i;
        }
      }
      let sum = 0;
      let sumHp = 0;
      for (let i = Math.max(0, first); i <= last; i++) {
        sum += raw[i] * raw[i];
        sumHp += hp[i] * hp[i];
      }
      const n = Math.max(1, last - first + 1);
      let tailPeak = 0;
      for (let i = raw.length - Math.round(rate * 0.15); i < raw.length; i++) tailPeak = Math.max(tailPeak, Math.abs(raw[i]));
      out[name] = {
        peak,
        rmsDb: 10 * Math.log10(sum / n),
        activeSeconds: n / rate,
        tailPeak,
        speakerShare: sumHp / Math.max(sum, 1e-12),
      };
    }
    return out;
  });

  console.table(
    Object.fromEntries(Object.entries(results).map(([k, m]) => [k, {
      peak: m.peak.toFixed(2), rms: `${m.rmsDb.toFixed(1)} dBFS`, length: `${m.activeSeconds.toFixed(2)}s`, '>500Hz': `${(m.speakerShare * 100).toFixed(0)}%`,
    }])),
  );

  for (const [name, m] of Object.entries(results)) {
    expect(m.peak, `${name} peak`).toBeGreaterThan(0.05);
    expect(m.peak, `${name} clips`).toBeLessThan(0.98);
    expect(m.rmsDb, `${name} loudness`).toBeGreaterThan(-34);
    expect(m.rmsDb, `${name} loudness`).toBeLessThan(-6);
    expect(m.activeSeconds, `${name} length`).toBeLessThan(1);
    expect(m.tailPeak, `${name} keeps sounding`).toBeLessThan(0.002);
    expect(m.speakerShare, `${name} lost on phone speakers`).toBeGreaterThan(0.35);
  }
  // The most frequent sound must sit under the rewarding one.
  expect(results.flap.rmsDb).toBeLessThan(results.score.rmsDb);
});
