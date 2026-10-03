import { circleHitsObstacle } from './collision.ts';
import { CAT, DIFFICULTY, OBSTACLE, PHYSICS, TIMING, WORLD } from './config.ts';
import { speedForScore } from './difficulty.ts';
import { createObstaclePool, planNextGap, type Obstacle } from './obstacles.ts';
import { integrate } from './physics.ts';
import { createRng, randomSeed, type Rng } from './rng.ts';

/**
 * READY → PLAYING ⇄ PAUSED
 *            ↓ (crash)
 *          DYING (cat drops to the ground, no control)
 *            ↓
 *         GAMEOVER → (tap) → READY
 */
export type Phase = 'ready' | 'playing' | 'paused' | 'dying' | 'gameover';
export type DeathCause = 'obstacle' | 'ground';

export type GameEvent =
  | { type: 'start' }
  | { type: 'flap' }
  | { type: 'score'; score: number }
  | { type: 'bonk' }
  | { type: 'hit'; cause: DeathCause }
  | { type: 'land' }
  | { type: 'gameover'; score: number }
  | { type: 'pause' }
  | { type: 'countdown' }
  | { type: 'resume' }
  | { type: 'reset' };

export interface Cat {
  /** Hitbox centre (x is fixed at CAT.x on screen). */
  y: number;
  vy: number;
  /** y at the start of the latest step, for render interpolation. */
  prevY: number;
  landed: boolean;
  /** Sim times of the latest events this run (−Infinity when they haven't happened). */
  flapAt: number;
  bonkAt: number;
  deathAt: number;
  landAt: number;
}

/**
 * Everything needed to replay a run exactly: the seed, where the run began,
 * and the playing-step index of every flap (the first, at 0, is the take-off).
 * The simulation is fixed-step and uses only IEEE-exact arithmetic, so the
 * same record replays bit-for-bit on any device (see `social/replay.ts`).
 */
export interface RunRecord {
  seed: number;
  /** `scroll` when the run started. */
  startScroll: number;
  /** Cat y when the run started. */
  startY: number;
  /** Playing-step count at each flap, non-decreasing, first is 0. */
  flaps: number[];
}

/** Longest run a record keeps flaps for (≈ 1.5 hours of frantic tapping); later flaps aren't recorded. */
export const MAX_RECORDED_FLAPS = 30_000;

export function readyHoverY(time: number): number {
  return CAT.startY + Math.sin(time * Math.PI * 2 * CAT.readyBobHz) * CAT.readyBobAmplitude;
}

/**
 * The whole simulation. No DOM, no clock, no globals: advance it with
 * `step(dt)`, drive it with `flap()`, read its fields, consume its events.
 * Seeded, so any run can be replayed exactly.
 */
export class Game {
  phase: Phase = 'ready';
  /** Seconds since creation; drives ambient animation. Never reset. */
  time = 0;
  /** Seconds since the current phase began. */
  phaseTime = 0;
  score = 0;
  /** Current scroll speed (px/s). */
  speed: number = DIFFICULTY.baseSpeed;
  /** World x of the screen's left edge. Obstacles live in world space; only this moves. */
  scroll = 0;
  prevScroll = 0;
  /** Seed of the current run. */
  seed = 0;
  deathCause: DeathCause | null = null;
  /** Seconds left in the 3‑2‑1 resume countdown; 0 while waiting on the pause screen. */
  countdown = 0;
  /** When set, every run uses this seed (a shared course) instead of drawing the next one. */
  fixedSeed: number | null = null;
  /** Simulation steps spent in PLAYING this run — the clock replays are keyed on. */
  runTicks = 0;
  /** The current (or last) run's inputs. */
  readonly record: RunRecord = { seed: 0, startScroll: 0, startY: 0, flaps: [] };
  readonly cat: Cat = {
    y: CAT.startY, vy: 0, prevY: CAT.startY, landed: false,
    flapAt: -Infinity, bonkAt: -Infinity, deathAt: -Infinity, landAt: -Infinity,
  };
  readonly obstacles: Obstacle[] = createObstaclePool();
  /** Events emitted since the last `consumeEvents`. */
  readonly events: GameEvent[] = [];

  private rng: Rng = createRng(0);
  private nextSpawnX = Infinity;
  private spawned = 0;
  private lastGapY: number = CAT.startY;

  constructor(seed: number = randomSeed()) {
    this.reset(seed);
    this.events.length = 0;
  }

  /** World x of the cat's hitbox centre. */
  get catWorldX(): number {
    return this.scroll + CAT.x;
  }

  /**
   * The one-button action. Space, mouse and touch all call exactly this,
   * so every input device produces identical physics. What it does depends on
   * the phase: start a run, flap, resume from pause, or retry after Game Over.
   */
  flap(): void {
    switch (this.phase) {
      case 'ready':
        this.start();
        this.doFlap();
        break;
      case 'playing':
        this.doFlap();
        break;
      case 'paused':
        if (this.countdown <= 0) {
          this.countdown = TIMING.resumeCountdown;
          this.emit({ type: 'countdown' });
        }
        break;
      case 'gameover':
        if (this.phaseTime >= TIMING.retryLockout) this.reset();
        break;
      case 'dying':
        break; // no control after a crash
    }
  }

  /** Pause if playing (used for tab-hide / focus loss). */
  pause(): void {
    if (this.phase !== 'playing') return;
    this.setPhase('paused');
    this.countdown = 0;
    this.emit({ type: 'pause' });
  }

  /** Pause key / button: pause, start resuming, or cancel a running countdown. */
  togglePause(): void {
    if (this.phase === 'playing') this.pause();
    else if (this.phase === 'paused') {
      if (this.countdown > 0) this.countdown = 0;
      else this.flap();
    }
  }

  /**
   * Back to READY for a new run: obstacles cleared, score 0, base speed.
   * The scroll position is kept so the ground doesn't jump. Without an
   * explicit seed the next seed is drawn from the current run's stream, so a
   * whole session is reproducible from the first seed.
   */
  reset(seed?: number): void {
    this.seed = seed ?? this.fixedSeed ?? ((this.rng() * 0x100000000) >>> 0);
    this.rng = createRng(this.seed);
    for (const o of this.obstacles) o.active = false;
    this.score = 0;
    this.speed = DIFFICULTY.baseSpeed;
    this.spawned = 0;
    this.lastGapY = CAT.startY;
    this.nextSpawnX = Infinity;
    this.deathCause = null;
    this.countdown = 0;
    this.runTicks = 0;
    this.record.seed = this.seed;
    this.record.flaps.length = 0;

    const cat = this.cat;
    cat.y = readyHoverY(this.time);
    cat.prevY = cat.y;
    cat.vy = 0;
    cat.landed = false;
    cat.flapAt = cat.bonkAt = cat.deathAt = cat.landAt = -Infinity;

    this.setPhase('ready');
    this.emit({ type: 'reset' });
  }

  step(dt: number): void {
    this.time += dt;
    this.phaseTime += dt;
    this.prevScroll = this.scroll;
    this.cat.prevY = this.cat.y;

    switch (this.phase) {
      case 'ready':
        this.scroll += DIFFICULTY.baseSpeed * dt;
        this.cat.y = readyHoverY(this.time);
        break;
      case 'playing':
        this.stepPlaying(dt);
        break;
      case 'paused':
        if (this.countdown > 0) {
          this.countdown -= dt;
          if (this.countdown <= 0) {
            this.countdown = 0;
            this.setPhase('playing');
            this.emit({ type: 'resume' });
          }
        }
        break;
      case 'dying':
        this.stepDying(dt);
        break;
      case 'gameover':
        break;
    }
  }

  /** Calls `fn` for every pending event, then clears them. */
  consumeEvents(fn: (e: GameEvent) => void): void {
    for (const e of this.events) fn(e);
    this.events.length = 0;
  }

  /** The nearest obstacle the cat hasn't fully cleared yet, if any. */
  upcomingObstacle(): Obstacle | null {
    const clearX = this.catWorldX - CAT.hitboxRadius;
    let best: Obstacle | null = null;
    for (const o of this.obstacles) {
      if (!o.active || o.x + OBSTACLE.capWidth < clearX) continue;
      if (!best || o.x < best.x) best = o;
    }
    return best;
  }

  private stepPlaying(dt: number): void {
    const cat = this.cat;
    const r = CAT.hitboxRadius;

    this.runTicks++;
    this.speed = speedForScore(this.score);
    this.scroll += this.speed * dt;
    integrate(cat, dt);
    this.clampToCeiling();
    this.spawnAndRecycle();

    if (cat.y + r >= WORLD.groundY) {
      this.die('ground');
      return;
    }
    const cx = this.catWorldX;
    for (const o of this.obstacles) {
      if (o.active && circleHitsObstacle(cx, cat.y, r, o)) {
        this.die('obstacle');
        return;
      }
    }
    // A point is awarded once the whole hitbox is past the obstacle, so a
    // point can never be followed by a crash into the same obstacle.
    for (const o of this.obstacles) {
      if (o.active && !o.scored && cx - r > o.x + OBSTACLE.capWidth) {
        o.scored = true;
        this.score++;
        this.emit({ type: 'score', score: this.score });
      }
    }
  }

  private stepDying(dt: number): void {
    const cat = this.cat;
    if (!cat.landed) {
      integrate(cat, dt);
      this.clampToCeiling();
      if (cat.y + CAT.hitboxRadius >= WORLD.groundY) this.land();
    } else if (this.time - cat.landAt >= TIMING.gameOverDelay) {
      this.setPhase('gameover');
      this.emit({ type: 'gameover', score: this.score });
    }
  }

  private clampToCeiling(): void {
    const cat = this.cat;
    const top = WORLD.ceilingY + CAT.hitboxRadius;
    if (cat.y < top) {
      cat.y = top;
      if (cat.vy < 0) {
        cat.vy = 0;
        cat.bonkAt = this.time;
        if (this.phase === 'playing') this.emit({ type: 'bonk' });
      }
    }
  }

  private start(): void {
    this.setPhase('playing');
    this.nextSpawnX = this.scroll + CAT.x + OBSTACLE.firstDistance;
    this.record.startScroll = this.scroll;
    this.record.startY = this.cat.y;
    this.emit({ type: 'start' });
  }

  private doFlap(): void {
    const flaps = this.record.flaps;
    if (flaps.length < MAX_RECORDED_FLAPS && flaps[flaps.length - 1] !== this.runTicks) flaps.push(this.runTicks);
    this.cat.vy = PHYSICS.flapVelocity;
    this.cat.flapAt = this.time;
    this.emit({ type: 'flap' });
  }

  private die(cause: DeathCause): void {
    const cat = this.cat;
    this.deathCause = cause;
    cat.deathAt = this.time;
    this.setPhase('dying');
    this.emit({ type: 'hit', cause });
    if (cause === 'ground') {
      this.land();
    } else {
      // Rising hard into a cap: stop dead and drop. Otherwise: a little knock-back hop.
      cat.vy = cat.vy < -100 ? 0 : PHYSICS.deathHopVelocity;
    }
  }

  private land(): void {
    const cat = this.cat;
    cat.y = WORLD.groundY - CAT.hitboxRadius;
    cat.vy = 0;
    cat.landed = true;
    cat.landAt = this.time;
    this.emit({ type: 'land' });
  }

  private spawnAndRecycle(): void {
    const offLeft = this.scroll - OBSTACLE.capWidth - 8;
    for (const o of this.obstacles) {
      if (o.active && o.x < offLeft) o.active = false;
    }
    while (this.nextSpawnX <= this.scroll + WORLD.width + OBSTACLE.spawnAhead) {
      this.spawnAt(this.nextSpawnX);
      this.nextSpawnX += OBSTACLE.spacing;
    }
  }

  private spawnAt(x: number): void {
    let slot: Obstacle | null = null;
    for (const o of this.obstacles) {
      if (!o.active) {
        slot = o;
        break;
      }
    }
    // The pool is sized for the worst case (see tests); this only guards against a bad retune.
    if (!slot) {
      slot = this.obstacles[0];
      for (const o of this.obstacles) if (o.x < slot.x) slot = o;
    }
    const plan = planNextGap(this.lastGapY, this.spawned, this.score, this.rng);
    slot.active = true;
    slot.scored = false;
    slot.index = this.spawned++;
    slot.x = x;
    slot.gapY = plan.gapY;
    slot.gap = plan.gap;
    this.lastGapY = plan.gapY;
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }
}
