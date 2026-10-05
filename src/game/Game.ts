import { circleHitsObstacle } from './collision.ts';
import { CAT, FISH, GLIDE, OBSTACLE, TIMING, WORLD } from './config.ts';
import { speedForScore } from './difficulty.ts';
import { MAPS, type MapId, type MapRules } from './maps.ts';
import { bobbedGapY, createObstaclePool, fishY, planFish, planObstacle, type Obstacle } from './obstacles.ts';
import { glide, integrate } from './physics.ts';
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
  /** The cape opened into a glide. */
  | { type: 'glide' }
  /** The cape ran out of energy mid-glide. */
  | { type: 'capeEmpty' }
  /** A fish snack was eaten at world (x, y). */
  | { type: 'fish'; x: number; y: number }
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
  /** Cape energy, 0–1: a full cape glides for `GLIDE.duration` seconds. */
  energy: number;
  /** Gliding during the latest step. */
  gliding: boolean;
  /** The cape emptied during this hold: it stays shut until the next flap. */
  spent: boolean;
  /** Sim times of the latest events this run (−Infinity when they haven't happened). */
  flapAt: number;
  bonkAt: number;
  deathAt: number;
  landAt: number;
  fishAt: number;
}

/**
 * Everything needed to replay a run exactly: the map and seed, where the run
 * began, the playing-step index of every flap (the first, at 0, is the
 * take-off), and when the player held on to glide. The simulation is
 * fixed-step and uses only IEEE-exact arithmetic, so the same record replays
 * bit-for-bit on any device (see `social/replay.ts`).
 */
export interface RunRecord {
  /** The map flown: its rules shape the course and the physics. */
  map: MapId;
  seed: number;
  /** `scroll` when the run started. */
  startScroll: number;
  /** Cat y when the run started. */
  startY: number;
  /** Playing-step count at each flap, non-decreasing, first is 0. */
  flaps: number[];
  /**
   * Playing-step counts at which "holding on past the top of a flap" switched
   * on (even entries) or off (odd entries), strictly increasing. Only that
   * matters to the physics, so a run of ordinary taps records none at all.
   */
  holds: number[];
}

/** Salt for the fish stream's seed. */
const FISH_STREAM = 0x5eaf00d;

/** Longest run a record keeps inputs for (≈ 1.5 hours of frantic tapping); a longer run can't be replayed. */
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
  /** Fish snacks eaten this run. */
  fish = 0;
  /** The map being flown and its rules. Change it with `setMap`. */
  map: MapId = 'garden';
  rules: MapRules = MAPS.garden;
  /** Current scroll speed (px/s). */
  speed: number = MAPS.garden.difficulty.baseSpeed;
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
  readonly record: RunRecord = { map: 'garden', seed: 0, startScroll: 0, startY: 0, flaps: [], holds: [] };
  readonly cat: Cat = {
    y: CAT.startY, vy: 0, prevY: CAT.startY, landed: false, energy: 1, gliding: false, spent: false,
    flapAt: -Infinity, bonkAt: -Infinity, deathAt: -Infinity, landAt: -Infinity, fishAt: -Infinity,
  };
  /**
   * Whether the button is held down right now (any device). Set it with
   * `setHold`; the simulation reads it at the start of each step.
   */
  held = false;
  readonly obstacles: Obstacle[] = createObstaclePool();
  /** Events emitted since the last `consumeEvents`. */
  readonly events: GameEvent[] = [];

  private rng: Rng = createRng(0);
  /** Fish placement has its own stream, so the posts of a seed don't depend on it. */
  private fishRng: Rng = createRng(0);
  private nextSpawnX = Infinity;
  private spawned = 0;
  private lastGapY: number = CAT.startY;
  private lastDrift = 0;
  /** The glide intent the latest step used (what `record.holds` toggles). */
  private holding = false;

  constructor(seed: number = randomSeed(), map: MapId = 'garden') {
    this.map = map;
    this.rules = MAPS[map];
    this.reset(seed);
    this.events.length = 0;
  }

  /** Switch maps (between runs): back to READY on the new map. */
  setMap(map: MapId, seed?: number): void {
    this.map = map;
    this.rules = MAPS[map];
    this.reset(seed);
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

  /**
   * The button went down (true) or was let go (false). A press still calls
   * `flap()` too; this only adds the hold, which glides once the cat is
   * past the top of its flap.
   */
  setHold(down: boolean): void {
    this.held = down;
  }

  /** Whether the current record holds the whole run (so it can be shared and replayed). */
  get recordComplete(): boolean {
    return this.record.flaps.length < MAX_RECORDED_FLAPS && this.record.holds.length < MAX_RECORDED_FLAPS;
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
    this.fishRng = createRng(this.seed ^ FISH_STREAM);
    for (const o of this.obstacles) o.active = false;
    this.score = 0;
    this.fish = 0;
    this.speed = this.rules.difficulty.baseSpeed;
    this.spawned = 0;
    this.lastGapY = CAT.startY;
    this.lastDrift = 0;
    this.nextSpawnX = Infinity;
    this.deathCause = null;
    this.countdown = 0;
    this.runTicks = 0;
    this.record.map = this.map;
    this.record.seed = this.seed;
    this.record.flaps.length = 0;
    this.record.holds.length = 0;
    this.holding = false;

    const cat = this.cat;
    cat.y = readyHoverY(this.time);
    cat.prevY = cat.y;
    cat.vy = 0;
    cat.landed = false;
    cat.energy = 1;
    cat.gliding = false;
    cat.spent = false;
    cat.flapAt = cat.bonkAt = cat.deathAt = cat.landAt = cat.fishAt = -Infinity;

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
        this.scroll += this.rules.difficulty.baseSpeed * dt;
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
      if (!o.active || o.x + o.width < clearX) continue;
      if (!best || o.x < best.x) best = o;
    }
    return best;
  }

  private stepPlaying(dt: number): void {
    const cat = this.cat;
    const r = CAT.hitboxRadius;

    // Only "held past the top of a flap" changes anything, so that is what is recorded.
    const holding = this.held && cat.vy >= 0;
    if (holding !== this.holding) {
      this.holding = holding;
      if (this.record.holds.length < MAX_RECORDED_FLAPS) this.record.holds.push(this.runTicks);
    }

    this.runTicks++;
    this.speed = speedForScore(this.score, this.rules.difficulty);
    this.scroll += this.speed * dt;
    this.fly(holding, dt);
    this.clampToCeiling();
    this.spawnAndRecycle();
    this.bobGaps();

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
    this.eatFish();
    // A point is awarded once the whole hitbox is past the obstacle, so a
    // point can never be followed by a crash into the same obstacle.
    for (const o of this.obstacles) {
      if (o.active && !o.scored && cx - r > o.x + o.width) {
        o.scored = true;
        this.score++;
        this.emit({ type: 'score', score: this.score });
      }
    }
  }

  private eatFish(): void {
    const cat = this.cat;
    const cx = this.catWorldX;
    const reach = CAT.hitboxRadius + FISH.radius;
    for (const o of this.obstacles) {
      if (!o.active || !o.fish || o.fishTaken) continue;
      const dx = o.x + o.fishDx - cx;
      const dy = fishY(o) - cat.y;
      if (dx * dx + dy * dy >= reach * reach) continue;
      o.fishTaken = true;
      this.fish++;
      cat.fishAt = this.time;
      cat.energy = Math.min(1, cat.energy + FISH.energy);
      this.emit({ type: 'fish', x: o.x + o.fishDx, y: fishY(o) });
    }
  }

  /** Vertical motion for one playing step: glide while holding on with cape energy left, otherwise fall. */
  private fly(holding: boolean, dt: number): void {
    const cat = this.cat;
    const gliding = holding && !cat.spent && cat.energy >= (cat.gliding ? 0 : GLIDE.minToOpen);
    if (gliding && !cat.gliding) this.emit({ type: 'glide' });
    cat.gliding = gliding;
    if (gliding) {
      glide(cat, dt, this.rules.physics);
      cat.energy = Math.max(0, cat.energy - dt / GLIDE.duration);
      if (cat.energy === 0) {
        cat.spent = true;
        this.emit({ type: 'capeEmpty' });
      }
    } else {
      integrate(cat, dt, this.rules.physics);
      cat.energy = Math.min(1, cat.energy + GLIDE.regen * dt);
    }
  }

  private stepDying(dt: number): void {
    const cat = this.cat;
    if (!cat.landed) {
      integrate(cat, dt, this.rules.physics);
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
    this.nextSpawnX = this.scroll + CAT.x + this.rules.course.firstDistance;
    this.record.startScroll = this.scroll;
    this.record.startY = this.cat.y;
    this.emit({ type: 'start' });
  }

  private doFlap(): void {
    const flaps = this.record.flaps;
    if (flaps.length < MAX_RECORDED_FLAPS && flaps[flaps.length - 1] !== this.runTicks) flaps.push(this.runTicks);
    this.cat.vy = this.rules.physics.flapVelocity;
    this.cat.flapAt = this.time;
    this.cat.spent = false; // a fresh press re-arms an emptied cape
    this.emit({ type: 'flap' });
  }

  private die(cause: DeathCause): void {
    const cat = this.cat;
    this.deathCause = cause;
    cat.deathAt = this.time;
    cat.gliding = false;
    this.setPhase('dying');
    this.emit({ type: 'hit', cause });
    if (cause === 'ground') {
      this.land();
    } else {
      // Rising hard into a cap: stop dead and drop. Otherwise: a little knock-back hop.
      cat.vy = cat.vy < -100 ? 0 : this.rules.physics.deathHopVelocity;
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
    for (const o of this.obstacles) {
      if (o.active && o.x < this.scroll - o.width - 8) o.active = false;
    }
    // The clear run after an obstacle is the same whatever its width. (Width + clear
    // is summed first: for the standard cap it is exactly the classic spacing.)
    const clear = this.rules.course.spacing - OBSTACLE.capWidth;
    while (this.nextSpawnX <= this.scroll + WORLD.width + OBSTACLE.spawnAhead) {
      this.nextSpawnX += this.spawnAt(this.nextSpawnX) + clear;
    }
  }

  /** Move bobbing gaps to where they are at the cat's current distance. */
  private bobGaps(): void {
    const cx = this.catWorldX;
    for (const o of this.obstacles) {
      if (o.active && o.amp > 0) o.gapY = bobbedGapY(o, cx);
    }
  }

  /** Spawns the next obstacle with its left edge at `x`; returns its width. */
  private spawnAt(x: number): number {
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
    const plan = planObstacle(this.lastGapY, this.lastDrift, this.spawned, this.score, this.rng, this.rules);
    slot.active = true;
    slot.scored = false;
    slot.index = this.spawned++;
    slot.x = x;
    slot.width = plan.width;
    slot.passY = plan.gapY;
    slot.gap = plan.gap;
    slot.amp = plan.amp;
    slot.phase = plan.phase;
    slot.wavelength = plan.wavelength;
    slot.gapY = plan.amp > 0 ? bobbedGapY(slot, this.catWorldX) : plan.gapY;
    const fish = planFish(plan, this.lastGapY, slot.index, this.rules.course.spacing, this.fishRng);
    slot.fish = fish.fish;
    slot.fishTaken = false;
    slot.fishInGap = fish.fishInGap;
    slot.fishDx = fish.fishDx;
    slot.fishY = fish.fishY;
    this.lastGapY = plan.gapY;
    this.lastDrift = plan.drift;
    return plan.width;
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }
}
