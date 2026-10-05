import { CAT, FAIRNESS, FISH, GLIDE, OBSTACLE, TIMING, WORLD } from '../game/config.ts';
import type { RunRecord } from '../game/Game.ts';
import { MAP_IDS, MAPS, type MapId } from '../game/maps.ts';
import { simulate } from './replay.ts';

/*
 * Challenge links: `?c=<base64url>` carries a map, a course seed and up to
 * MAX_GHOSTS recorded runs. Each person who plays and shares adds (or
 * improves) their own run, so a link passed around a group chat becomes an
 * asynchronous race of everyone who has flown it — no server needed.
 *
 * Binary layout (all integers unsigned LEB128 varints unless noted):
 *   u8 format (2) · u16 sim signature · u8 map · u32 seed · u8 ghost count
 *   per ghost: u32 player id · u8 name byte length · UTF‑8 name · score ·
 *              f64 start scroll · f64 start y · flap count · flap deltas ·
 *              hold count · hold deltas
 * Format 1 (before maps and gliding) has no map byte and no holds: it is
 * always the garden, whose rules haven't changed, so those links still work.
 */

export const MAX_GHOSTS = 5;
const MAX_NAME_CHARS = 12;
/** Longest `c` value we accept; real links are far shorter (≈ 3 bytes per second of flight per ghost). */
const MAX_LINK_CHARS = 16_000;
const FORMAT = 2;
const FORMAT_V1 = 1;
/**
 * The signature format‑1 links carry: the garden-only rules before maps and
 * gliding existed. The garden still plays bit-for-bit by those rules (the
 * cross-engine test in e2e/social.spec.ts replays a link recorded then).
 */
const SIGNATURE_V1 = 0xc59e;
const MAX_NAME_BYTES = 48;

export interface Ghost {
  /** Random per-device id: lets a player replace their own earlier run in a link. */
  pid: number;
  name: string;
  /** Score the run earns — always re-derived by replay before it is trusted. */
  score: number;
  record: RunRecord;
}

export interface Challenge {
  map: MapId;
  seed: number;
  ghosts: Ghost[];
}

/**
 * A fingerprint of every tunable that shapes a course or the physics. A
 * retune changes it, so links recorded under other rules are recognised
 * instead of replaying ghosts through posts that moved.
 */
export const SIM_SIGNATURE = fnv16(JSON.stringify([WORLD, CAT, OBSTACLE, MAP_IDS, MAPS, GLIDE, FISH, FAIRNESS, TIMING.simHz]));

function fnv16(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h ^ (h >>> 16)) & 0xffff;
}

/** Trim, collapse whitespace, drop control characters, cap the length. */
export function cleanName(raw: string): string {
  const s = raw.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, MAX_NAME_CHARS).join('');
}

// ---------------------------------------------------------------- bytes

class Writer {
  private buf = new Uint8Array(256);
  private len = 0;

  private ensure(n: number): void {
    if (this.len + n <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.len + n));
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  u8(v: number): void {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
  }

  u16(v: number): void {
    this.u8(v >>> 8);
    this.u8(v);
  }

  u32(v: number): void {
    this.u16(v >>> 16);
    this.u16(v & 0xffff);
  }

  varint(v: number): void {
    let n = Math.floor(v);
    do {
      const b = n % 128;
      n = Math.floor(n / 128);
      this.u8(n > 0 ? b | 0x80 : b);
    } while (n > 0);
  }

  f64(v: number): void {
    this.ensure(8);
    new DataView(this.buf.buffer).setFloat64(this.len, v);
    this.len += 8;
  }

  bytes(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }

  done(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }
}

class Reader {
  private pos = 0;
  private readonly buf: Uint8Array;

  constructor(buf: Uint8Array) {
    this.buf = buf;
  }

  private need(n: number): void {
    if (this.pos + n > this.buf.length) throw new RangeError('truncated');
  }

  u8(): number {
    this.need(1);
    return this.buf[this.pos++];
  }

  u16(): number {
    return (this.u8() << 8) | this.u8();
  }

  u32(): number {
    return ((this.u16() << 16) >>> 0) + this.u16();
  }

  varint(): number {
    let v = 0;
    let scale = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.u8();
      v += (b & 0x7f) * scale;
      if (!(b & 0x80)) return v;
      scale *= 128;
    }
    throw new RangeError('varint too long');
  }

  f64(): number {
    this.need(8);
    const v = new DataView(this.buf.buffer, this.buf.byteOffset).getFloat64(this.pos);
    this.pos += 8;
    return v;
  }

  bytes(n: number): Uint8Array {
    this.need(n);
    const b = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }

  get atEnd(): boolean {
    return this.pos === this.buf.length;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------- codec

export function encodeChallenge(c: Challenge): string {
  const w = new Writer();
  w.u8(FORMAT);
  w.u16(SIM_SIGNATURE);
  w.u8(MAP_IDS.indexOf(c.map));
  w.u32(c.seed >>> 0);
  const ghosts = c.ghosts.slice(0, MAX_GHOSTS);
  w.u8(ghosts.length);
  const enc = new TextEncoder();
  for (const g of ghosts) {
    w.u32(g.pid >>> 0);
    let name = enc.encode(cleanName(g.name));
    if (name.length > MAX_NAME_BYTES) name = enc.encode(Array.from(cleanName(g.name)).slice(0, 8).join(''));
    w.u8(name.length);
    w.bytes(name);
    w.varint(g.score);
    w.f64(g.record.startScroll);
    w.f64(g.record.startY);
    for (const ticks of [g.record.flaps, g.record.holds]) {
      w.varint(ticks.length);
      let prev = 0;
      for (const t of ticks) {
        w.varint(t - prev);
        prev = t;
      }
    }
  }
  return toBase64Url(w.done());
}

export type DecodeResult =
  | { ok: true; challenge: Challenge }
  | { ok: false; reason: 'malformed' | 'outdated' };

/** Parses a link value. Structure only: ghosts still have to pass `verifyGhosts`. */
export function decodeChallenge(text: string): DecodeResult {
  if (!text || text.length > MAX_LINK_CHARS || !/^[A-Za-z0-9_-]+$/.test(text)) return { ok: false, reason: 'malformed' };
  try {
    const r = new Reader(fromBase64Url(text));
    const format = r.u8();
    if (format !== FORMAT && format !== FORMAT_V1) return { ok: false, reason: 'outdated' };
    if (r.u16() !== (format === FORMAT ? SIM_SIGNATURE : SIGNATURE_V1)) return { ok: false, reason: 'outdated' };
    const map = format === FORMAT ? MAP_IDS[r.u8()] : 'garden';
    if (!map) return { ok: false, reason: 'malformed' };
    const seed = r.u32();
    const count = r.u8();
    if (count > MAX_GHOSTS) return { ok: false, reason: 'malformed' };
    const dec = new TextDecoder('utf-8', { fatal: true });
    const ghosts: Ghost[] = [];
    for (let i = 0; i < count; i++) {
      const pid = r.u32();
      const nameLen = r.u8();
      if (nameLen > MAX_NAME_BYTES) return { ok: false, reason: 'malformed' };
      const name = cleanName(dec.decode(r.bytes(nameLen)));
      const score = r.varint();
      const startScroll = r.f64();
      const startY = r.f64();
      const flaps = readTicks(r);
      const holds = format === FORMAT ? readTicks(r) : [];
      if (!flaps || !holds || flaps.length === 0) return { ok: false, reason: 'malformed' };
      ghosts.push({ pid, name, score, record: { map, seed, startScroll, startY, flaps, holds } });
    }
    if (!r.atEnd) return { ok: false, reason: 'malformed' };
    return { ok: true, challenge: { map, seed, ghosts } };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}

/** A count and that many deltas, as absolute step counts (null if implausibly long). */
function readTicks(r: Reader): number[] | null {
  const n = r.varint();
  if (n > MAX_LINK_CHARS) return null;
  const ticks: number[] = [];
  let t = 0;
  for (let k = 0; k < n; k++) {
    t += r.varint();
    ticks.push(t);
  }
  return ticks;
}

/**
 * Replays every ghost and keeps those whose run really earns the score the
 * link claims. A mismatch means a doctored link or a run recorded by a
 * different version of the game; either way it is not shown.
 */
export function verifyGhosts(ghosts: readonly Ghost[]): { valid: Ghost[]; rejected: number } {
  const valid: Ghost[] = [];
  for (const g of ghosts) {
    const result = simulate(g.record);
    if (result && result.score === g.score) valid.push(g);
  }
  return { valid, rejected: ghosts.length - valid.length };
}

/**
 * The ghosts to share after a run: everyone already in the link plus me,
 * keeping only my better run if I was already in it, and dropping the
 * lowest scorers (never me) beyond MAX_GHOSTS.
 */
export function mergeGhosts(existing: readonly Ghost[], me: Ghost): Ghost[] {
  const mine = existing.find((g) => g.pid === me.pid);
  const self = mine && mine.score > me.score ? { ...mine, name: me.name } : me;
  const others = existing.filter((g) => g.pid !== me.pid).sort((a, b) => b.score - a.score);
  return [self, ...others.slice(0, MAX_GHOSTS - 1)].sort((a, b) => b.score - a.score);
}
