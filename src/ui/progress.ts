/** Presentation-only milestones: never part of physics or the replay signature. */
export const STAR_SCORES = [10, 25, 50] as const;

export const starsFor = (best: number): number => STAR_SCORES.filter((score) => best >= score).length;
export const nextStar = (best: number): number | null => STAR_SCORES.find((score) => best < score) ?? null;
export const starText = (best: number): string => '★'.repeat(starsFor(best)) + '☆'.repeat(STAR_SCORES.length - starsFor(best));
