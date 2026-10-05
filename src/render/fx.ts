import { drawFish } from './cat.ts';
import { GINGER } from './palette.ts';

/*
 * Small, pooled effects: flap puffs, crash fur tufts, score sparks, "+1"
 * pop-ups, wind streaks off a gliding cape, eaten fish, screen shake and
 * flash. Fixed-size pools — nothing grows during play, however long the session.
 */

const PUFF = 0;
const TUFT = 1;
const SPARK = 2;
const STREAK = 3;

interface Particle {
  active: boolean;
  kind: number;
  /** World x (moves with the scenery) and y. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  rot: number;
  spin: number;
}

interface Popup {
  active: boolean;
  /** Screen-world position (sticks near the cat, not the scenery). */
  x: number;
  y: number;
  age: number;
  text: string;
}

const POOL = 64;
const POPUPS = 4;
const POPUP_LIFE = 0.7;
const FISH_POPS = 3;
const FISH_POP_LIFE = 0.5;

export class Fx {
  shake = 0;
  flash = 0;
  private readonly particles: Particle[] = Array.from({ length: POOL }, () => ({
    active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 1, rot: 0, spin: 0,
  }));
  private readonly popups: Popup[] = Array.from({ length: POPUPS }, () => ({ active: false, x: 0, y: 0, age: 0, text: '' }));
  /** Eaten fish, gulped towards the cat. Screen-world positions, like pop-ups. */
  private readonly fishPops: Popup[] = Array.from({ length: FISH_POPS }, () => ({ active: false, x: 0, y: 0, age: 0, text: '' }));
  private next = 0;
  private seed = 1;

  /** Count of live particles (for tests / debug). */
  get liveCount(): number {
    let n = 0;
    for (const p of this.particles) if (p.active) n++;
    return n;
  }

  puff(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      this.spawn(PUFF, x - 4 + this.rand(-3, 3), y + this.rand(-3, 4), this.rand(-55, -25), this.rand(25, 60), this.rand(0.28, 0.4), this.rand(3, 5.5));
    }
  }

  /** Tufts of ginger fur knocked loose in a crash. */
  furTufts(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      this.spawn(TUFT, x + this.rand(-8, 8), y + this.rand(-10, 4), this.rand(-90, 90), this.rand(-170, -40), this.rand(0.9, 1.4), this.rand(4, 6));
    }
  }

  sparks(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + this.rand(-0.3, 0.3);
      const v = this.rand(70, 120);
      this.spawn(SPARK, x, y, Math.cos(a) * v, Math.sin(a) * v, this.rand(0.3, 0.45), this.rand(2, 3.2));
    }
  }

  /** Air streaming off the edge of a gliding cape. */
  streak(x: number, y: number): void {
    this.spawn(STREAK, x + this.rand(-3, 3), y + this.rand(-6, 6), this.rand(-40, -20), this.rand(-6, 6), this.rand(0.25, 0.4), this.rand(7, 13));
  }

  /** A fish snack just eaten at screen-world (x, y). */
  fishPop(x: number, y: number): void {
    let slot = this.fishPops[0];
    for (const p of this.fishPops) {
      if (!p.active) {
        slot = p;
        break;
      }
      if (p.age > slot.age) slot = p;
    }
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.age = 0;
  }

  dust(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      this.spawn(PUFF, x + this.rand(-14, 14), y - this.rand(0, 4), this.rand(-60, 60), this.rand(-40, -10), this.rand(0.35, 0.5), this.rand(3, 6));
    }
  }

  popup(x: number, y: number, text: string): void {
    let slot = this.popups[0];
    for (const p of this.popups) {
      if (!p.active) {
        slot = p;
        break;
      }
      if (p.age > slot.age) slot = p;
    }
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.age = 0;
    slot.text = text;
  }

  clear(): void {
    for (const p of this.particles) p.active = false;
    for (const p of this.popups) p.active = false;
    for (const p of this.fishPops) p.active = false;
    this.shake = 0;
    this.flash = 0;
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      if (p.kind === TUFT) {
        // Flutter down: drag plus a sideways sway.
        p.vx *= Math.exp(-2.2 * dt);
        p.vy = Math.min(p.vy + 420 * dt, 55);
        p.x += Math.sin(p.age * 9 + p.spin) * 22 * dt;
      } else if (p.kind === PUFF) {
        p.vx *= Math.exp(-3 * dt);
        p.vy *= Math.exp(-3 * dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    for (const p of this.popups) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= POPUP_LIFE) p.active = false;
    }
    for (const p of this.fishPops) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= FISH_POP_LIFE) p.active = false;
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 4);
  }

  /** Draw world-anchored particles; `scroll` maps world x to the screen. */
  draw(ctx: CanvasRenderingContext2D, scroll: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      const t = p.age / p.life;
      const x = p.x - scroll;
      if (p.kind === PUFF) {
        ctx.globalAlpha = 0.7 * (1 - t);
        ctx.fillStyle = '#f4ecff';
        ctx.beginPath();
        ctx.arc(x, p.y, p.size * (0.6 + t * 0.9), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === STREAK) {
        ctx.globalAlpha = 0.6 * (1 - t);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - p.size, p.y - 0.75, p.size, 1.5);
      } else if (p.kind === TUFT) {
        // A wisp of ginger fur with a pale end, like the chest fur.
        ctx.globalAlpha = t < 0.75 ? 1 : (1 - t) * 4;
        ctx.save();
        ctx.translate(x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = GINGER.fur;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = GINGER.cream;
        ctx.beginPath();
        ctx.ellipse(p.size * 0.45, 0, p.size * 0.5, p.size * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = '#ffd86b';
        const s = p.size * (1 - t * 0.5);
        ctx.beginPath();
        ctx.moveTo(x, p.y - s * 1.6);
        ctx.lineTo(x + s * 0.5, p.y);
        ctx.lineTo(x, p.y + s * 1.6);
        ctx.lineTo(x - s * 0.5, p.y);
        ctx.closePath();
        ctx.moveTo(x - s * 1.6, p.y);
        ctx.lineTo(x, p.y - s * 0.5);
        ctx.lineTo(x + s * 1.6, p.y);
        ctx.lineTo(x, p.y + s * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Eaten fish: a quick gulp — it pops up, shrinks and fades. Screen-world space. */
  drawFishPops(ctx: CanvasRenderingContext2D): void {
    for (const p of this.fishPops) {
      if (!p.active) continue;
      const t = p.age / FISH_POP_LIFE;
      ctx.globalAlpha = 1 - t * t;
      drawFish(ctx, p.x - t * 6, p.y - 10 * (1 - (1 - t) * (1 - t)), 1 - 0.5 * t);
    }
    ctx.globalAlpha = 1;
  }

  /** Draw "+1" pop-ups in screen-world space. */
  drawPopups(ctx: CanvasRenderingContext2D, font: string, ink: string): void {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const p of this.popups) {
      if (!p.active) continue;
      const t = p.age / POPUP_LIFE;
      const rise = 1 - (1 - t) * (1 - t);
      ctx.globalAlpha = t < 0.6 ? 1 : (1 - t) / 0.4;
      const y = p.y - rise * 26;
      ctx.lineWidth = 4;
      ctx.strokeStyle = ink;
      ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(p.text, p.x, y);
    }
    ctx.globalAlpha = 1;
  }

  private spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number): void {
    const p = this.particles[this.next];
    this.next = (this.next + 1) % POOL;
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.age = 0;
    p.life = life;
    p.size = size;
    p.rot = this.rand(0, Math.PI);
    p.spin = this.rand(-6, 6);
  }

  /** Cheap LCG: effects don't need quality randomness, and shouldn't touch the game's seeded RNG. */
  private rand(a: number, b: number): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return a + (this.seed / 2147483647) * (b - a);
  }
}
