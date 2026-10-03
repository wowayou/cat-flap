/**
 * Every gameplay tunable lives here — nothing that affects feel or fairness is
 * hard-coded elsewhere.
 *
 * Units: logical pixels and seconds. The world is a fixed 360×640 frame on
 * every device; screens only change the on-screen scale, never the physics.
 * +y points down (canvas convention), so "up" velocities are negative.
 */

export const WORLD = {
  width: 360,
  height: 640,
  /** Top edge of the wall the cat must not touch. */
  groundY: 560,
  /**
   * Upper limit for the cat's hitbox. Reaching it is a bonk (vertical speed
   * zeroed), not a death: top posts already extend past it, so hugging the
   * ceiling can't skip an obstacle, and dying to an invisible line reads as
   * the "I didn't touch anything" kind of unfair.
   */
  ceilingY: 0,
} as const;

export const CAT = {
  /** Fixed horizontal screen position of the hitbox centre. */
  x: 104,
  /** Hover height on the Ready screen; a run starts from here. */
  startY: 272,
  /**
   * Hitbox circle radius. The drawn cat is noticeably larger (ears, tail,
   * cape, paws stick out): the art may overlap a post a little before a
   * death counts, never the other way round.
   */
  hitboxRadius: 13,
  readyBobAmplitude: 7,
  readyBobHz: 0.9,
} as const;

export const PHYSICS = {
  gravity: 1250,
  /** A flap *sets* vertical velocity to this; it doesn't add to it. */
  flapVelocity: -385,
  maxFallSpeed: 720,
  /** Hitting a post knocks the cat up a little before it drops. */
  deathHopVelocity: -240,
} as const;

export const OBSTACLE = {
  /** Width of the sisal post. */
  postWidth: 52,
  /** Width of the carpeted cap at the gap edge (the widest part). */
  capWidth: 66,
  capHeight: 16,
  /** Left edge to left edge of consecutive obstacles. Spawning is by distance, so this stays fixed as speed rises. */
  spacing: 214,
  /** Distance from the cat to the first obstacle's left edge when a run starts. */
  firstDistance: 300,
  /** Obstacles spawn this far beyond the right edge so they never pop in. */
  spawnAhead: 40,
  gapStart: 172,
  gapMin: 148,
  gapShrinkPerPoint: 0.6,
  /** Minimum distance from the ceiling to a gap's top, and from a gap's bottom to the ground. */
  edgeMargin: 56,
  /** Design caps on how far consecutive gap centres may move. The fairness model can tighten these further. */
  maxShiftUp: 140,
  maxShiftDown: 170,
  /** The first obstacles of a run shift less, ramping to full over this many. */
  onboardingCount: 4,
  /** How far the first gap may sit from the cat's start height. */
  firstGapMaxOffset: 36,
  poolSize: 6,
} as const;

export const DIFFICULTY = {
  /** Difficulty only ramps speed and (slightly) the gap; gravity and flap stay fixed so the feel the player learns never changes. */
  baseSpeed: 150,
  maxSpeed: 210,
  speedPerPoint: 1.5,
} as const;

export const FAIRNESS = {
  /** Sustained tap interval the reach model assumes a person can manage (≈5.5 taps/s). */
  assumedTapInterval: 0.18,
  /** Fraction of the modelled climb/drop the generator may demand between two gaps. */
  reachSafety: 0.85,
  /**
   * The drop model starts the cat moving up at this fraction of a flap,
   * because a player leaving a gap is usually mid-bob, not at rest. Without
   * it, big drops at top speed were the main way skilled players died.
   */
  dropStartFlapFraction: 0.5,
  /** Collision shapes are shrunk by this much on every side. */
  collisionInset: 2,
} as const;

export const TIMING = {
  /** Fixed simulation rate. Identical on 30, 60, 120 and 144 Hz displays. */
  simHz: 120,
  /** Longest real frame the loop will simulate; longer gaps (tab switch, debugger) are dropped. */
  maxFrameDt: 0.1,
  /** After the cat comes to rest, wait this long before the Game Over card. */
  gameOverDelay: 0.4,
  /** Input is ignored this long after Game Over appears, so a panicked extra tap can't skip the result. */
  retryLockout: 0.55,
  /** Resuming from pause counts down 3‑2‑1 over this long. */
  resumeCountdown: 1.5,
} as const;
