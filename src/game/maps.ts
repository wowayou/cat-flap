import { DIFFICULTY, OBSTACLE, PHYSICS } from './config.ts';

/*
 * Maps. Each one is a different place to fly AND a different way the course
 * behaves, chosen on the Ready screen. Like config.ts, these numbers are
 * gameplay tunables: everything that shapes a course or the physics lives in
 * a map's rules, and nothing else in the simulation branches on the map.
 *
 * The garden is the original game: its rules ARE the classic constants, so
 * its courses (and challenge links recorded before maps existed) are
 * bit-for-bit unchanged.
 */

export type MapId = 'garden' | 'library' | 'clouds' | 'moon';

/** Picker order; the index is also the map's number in challenge links. */
export const MAP_IDS: readonly MapId[] = ['garden', 'library', 'clouds', 'moon'];

export interface PhysicsRules {
  gravity: number;
  /** A flap *sets* vertical velocity to this; it doesn't add to it. */
  flapVelocity: number;
  maxFallSpeed: number;
  /** Hitting a post knocks the cat up a little before it drops. */
  deathHopVelocity: number;
}

export interface DifficultyRules {
  baseSpeed: number;
  maxSpeed: number;
  speedPerPoint: number;
}

export interface CourseRules {
  /** Left edge to left edge of two standard-width obstacles. Wider ones keep the same clear run between them. */
  spacing: number;
  /** Distance from the cat to the first obstacle's left edge when a run starts. */
  firstDistance: number;
  gapStart: number;
  gapMin: number;
  gapShrinkPerPoint: number;
  /** Minimum distance from the ceiling to a gap's top (and from a gap's bottom to the ground), wherever a moving gap goes. */
  edgeMargin: number;
  /** Design caps on how far consecutive gap centres may move. The fairness model can tighten these further. */
  maxShiftUp: number;
  maxShiftDown: number;
  /** The first obstacles of a run shift less, ramping to full over this many; they are also plain (no shelves, no motion). */
  onboardingCount: number;
  /** How far the first gap may sit from the cat's start height. */
  firstGapMaxOffset: number;
  /**
   * Long shelves: after onboarding an obstacle's cap is one of `widths`
   * (weighted). A wide one is a tunnel the cat has to hold its height
   * through. null: every obstacle has the standard cap width.
   */
  shelves: { widths: readonly number[]; weights: readonly number[] } | null;
  /**
   * Bobbing gaps: after onboarding, a share (`chance`) of obstacles move up
   * and down by ±`amplitude` as they approach. The motion is keyed to the
   * obstacle's distance from the cat, not to time, so the height at which
   * the cat meets each gap is known when it is generated (and kept inside
   * the reach model), whatever the speed. null: gaps stay still.
   */
  motion: { amplitude: number; wavelength: number; chance: number } | null;
}

export interface MapRules {
  id: MapId;
  physics: PhysicsRules;
  difficulty: DifficultyRules;
  course: CourseRules;
}

const GARDEN_COURSE: CourseRules = {
  spacing: OBSTACLE.spacing,
  firstDistance: OBSTACLE.firstDistance,
  gapStart: OBSTACLE.gapStart,
  gapMin: OBSTACLE.gapMin,
  gapShrinkPerPoint: OBSTACLE.gapShrinkPerPoint,
  edgeMargin: OBSTACLE.edgeMargin,
  maxShiftUp: OBSTACLE.maxShiftUp,
  maxShiftDown: OBSTACLE.maxShiftDown,
  onboardingCount: OBSTACLE.onboardingCount,
  firstGapMaxOffset: OBSTACLE.firstGapMaxOffset,
  shelves: null,
  motion: null,
};

export const MAPS: Readonly<Record<MapId, MapRules>> = {
  /** The original: cat-tree posts over the garden wall at sunset. */
  garden: {
    id: 'garden',
    physics: PHYSICS,
    difficulty: DIFFICULTY,
    course: GARDEN_COURSE,
  },
  /** Bookshelves at night: some shelves are long tunnels to hold a steady line through. */
  library: {
    id: 'library',
    physics: PHYSICS,
    difficulty: { baseSpeed: 150, maxSpeed: 205, speedPerPoint: 1.4 },
    course: {
      ...GARDEN_COURSE,
      gapStart: 176,
      gapMin: 152,
      shelves: { widths: [OBSTACLE.capWidth, 124, 184], weights: [0.5, 0.3, 0.2] },
    },
  },
  /** Above the clouds by day: cloud pillars bob up and down as they come. */
  clouds: {
    id: 'clouds',
    physics: PHYSICS,
    difficulty: { baseSpeed: 150, maxSpeed: 210, speedPerPoint: 1.5 },
    course: {
      ...GARDEN_COURSE,
      gapStart: 166,
      gapMin: 144,
      motion: { amplitude: 38, wavelength: 520, chance: 0.8 },
    },
  },
  /** The moon: low gravity, a softer flap and a long, floaty fall. */
  moon: {
    id: 'moon',
    physics: { gravity: 760, flapVelocity: -300, maxFallSpeed: 470, deathHopVelocity: -190 },
    difficulty: { baseSpeed: 140, maxSpeed: 195, speedPerPoint: 1.4 },
    course: {
      ...GARDEN_COURSE,
      spacing: 236,
      firstDistance: 320,
      gapStart: 146,
      gapMin: 128,
      maxShiftUp: 150,
      maxShiftDown: 180,
    },
  },
};

export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && (MAP_IDS as readonly string[]).includes(value);
}
