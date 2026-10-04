/**
 * Colours. Gameplay layers (cat, posts, wall) use fixed colours so they read
 * the same at every score; only the backdrop drifts through a day cycle as
 * the score climbs — a quiet sense of "I've flown a long way".
 */

export const INK = '#2a1b3d';

/** Match the source artwork for fur particles and the player's ranking dot. */
export const GINGER = { fur: '#efa044', cream: '#fff2d9' } as const;

/**
 * Friends' ghost cats are translucent silhouettes, one colour each (indexed
 * by `Rival.coat`): real coat colours — black, silver, white, blue-grey,
 * brown — chosen to read apart from each other and from the ginger player.
 */
export const GHOST_COLORS: readonly string[] = ['#3a3340', '#b9bdc7', '#f4f1ec', '#76839a', '#9a7454'];

export const POST_COLORS = {
  sisal: '#d8b784',
  sisalLight: '#ecd3a6',
  sisalShade: '#b38c58',
  rope: '#a67f4c',
  carpet: '#2e8c86',
  carpetLight: '#4fb3a9',
  carpetShade: '#1f6a66',
} as const;

export const WALL_COLORS = {
  cap: '#d3c4b4',
  capShade: '#a8988a',
  brick: '#a9503f',
  brickAlt: '#b85d48',
  mortar: '#6b2f2a',
  ivy: '#4f8a4b',
  ivyLight: '#6fae5f',
} as const;

export interface SkyPalette {
  top: string;
  mid: string;
  bottom: string;
  cloud: string;
  far: string;
  near: string;
  window: string;
  stars: number;
  moon: number;
  sun: number;
}

type Rgb = [number, number, number];
interface SkyKey {
  top: Rgb; mid: Rgb; bottom: Rgb; cloud: Rgb; far: Rgb; near: Rgb; window: Rgb;
  stars: number; moon: number; sun: number;
}

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const SUNSET: SkyKey = {
  top: hex('#3b2d6e'), mid: hex('#a65e8c'), bottom: hex('#ffb38a'), cloud: hex('#f6c3b8'),
  far: hex('#7a5490'), near: hex('#4f3669'), window: hex('#ffd58a'), stars: 0.15, moon: 0.35, sun: 1,
};
const DUSK: SkyKey = {
  top: hex('#241d52'), mid: hex('#5b3f8c'), bottom: hex('#d9779a'), cloud: hex('#b78cbc'),
  far: hex('#4b376f'), near: hex('#33264f'), window: hex('#ffcf7a'), stars: 0.6, moon: 0.8, sun: 0.25,
};
const NIGHT: SkyKey = {
  top: hex('#0f1236'), mid: hex('#1f2a64'), bottom: hex('#3d4a8e'), cloud: hex('#4a5590'),
  far: hex('#283063'), near: hex('#1a1e42'), window: hex('#ffc861'), stars: 1, moon: 1, sun: 0,
};
const DAWN: SkyKey = {
  top: hex('#3a4f96'), mid: hex('#8c8fc4'), bottom: hex('#ffd1a6'), cloud: hex('#ffe2cf'),
  far: hex('#7376ab'), near: hex('#4f5188'), window: hex('#ffe4a8'), stars: 0.1, moon: 0.3, sun: 0.8,
};

/** Score → sky. Loops every `SKY_CYCLE` points. */
const KEYS: [number, SkyKey][] = [
  [0, SUNSET],
  [10, DUSK],
  [22, NIGHT],
  [45, NIGHT],
  [60, DAWN],
  [75, SUNSET],
];
export const SKY_CYCLE = 75;

const mix = (a: Rgb, b: Rgb, t: number): string =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

/** Sky for a (fractional, smoothed) score position. */
export function skyAt(position: number): SkyPalette {
  const p = ((position % SKY_CYCLE) + SKY_CYCLE) % SKY_CYCLE;
  let i = 0;
  while (i < KEYS.length - 2 && p >= KEYS[i + 1][0]) i++;
  const [s0, a] = KEYS[i];
  const [s1, b] = KEYS[i + 1];
  const raw = (p - s0) / (s1 - s0);
  const t = raw * raw * (3 - 2 * raw); // smoothstep
  return {
    top: mix(a.top, b.top, t),
    mid: mix(a.mid, b.mid, t),
    bottom: mix(a.bottom, b.bottom, t),
    cloud: mix(a.cloud, b.cloud, t),
    far: mix(a.far, b.far, t),
    near: mix(a.near, b.near, t),
    window: mix(a.window, b.window, t),
    stars: a.stars + (b.stars - a.stars) * t,
    moon: a.moon + (b.moon - a.moon) * t,
    sun: a.sun + (b.sun - a.sun) * t,
  };
}
