import { TIMING, WORLD } from '../game/config.ts';
import type { Game, Phase } from '../game/Game.ts';
import { MAP_IDS, type MapId } from '../game/maps.ts';
import type { View } from '../render/view.ts';
import type { Strings } from './strings.ts';

export interface HudActions {
  togglePause(): void;
  toggleSound(): void;
  gesture(): void;
  share(): void;
  exitChallenge(): void;
  nameChanged(name: string): void;
  /** Previous (-1) / next (+1) map. */
  cycleMap(step: number): void;
}

/** Best scores that earn a map's three stars. */
const STAR_SCORES = [10, 25, 50] as const;

function starsFor(best: number): number {
  return STAR_SCORES.filter((s) => best >= s).length;
}

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(STAR_SCORES.length - n);

/** One line of a challenge ranking. `color` is the cat's fur, shown as a dot. */
export interface RankRow {
  name: string;
  score: number;
  me: boolean;
  color: string;
}

/** Seconds between countdown beats (3‑2‑1). */
const BEAT = TIMING.resumeCountdown / 3;

/** The 3‑2‑1 beat currently showing while resuming (0 when not counting). */
export function countdownBeat(game: Game): number {
  return game.phase === 'paused' && game.countdown > 0 ? Math.ceil(game.countdown / BEAT) : 0;
}

/**
 * DOM overlay: score, buttons, Ready / Paused / Game Over screens. Reads the
 * game every frame but only touches the DOM when something changed. Which
 * screen shows is pure CSS, keyed off `#app[data-phase]`.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly beatBest: HTMLElement;
  private readonly readyBest: HTMLElement;
  private readonly countdownEl: HTMLElement;
  private readonly finalScore: HTMLElement;
  private readonly finalBest: HTMLElement;
  private readonly quip: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly soundBtn: HTMLButtonElement;
  private readonly overtakeEl: HTMLElement;
  private readonly challengeEl: HTMLElement;
  private readonly challengeList: HTMLOListElement;
  private readonly standingsEl: HTMLElement;
  private readonly standingsList: HTMLOListElement;
  private readonly shareRow: HTMLElement;
  private readonly shareBtn: HTMLButtonElement;
  private readonly nameInput: HTMLInputElement;
  private readonly toastEl: HTMLElement;
  private readonly mapName: HTMLElement;
  private readonly mapHint: HTMLElement;
  private readonly mapStars: HTMLElement;
  private readonly mapDots: HTMLElement[];
  private readonly fishCount: HTMLElement;
  private readonly finalMap: HTMLElement;
  private readonly finalStars: HTMLElement;
  private readonly finalFish: HTMLElement;
  private readonly challengeHeading: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly doc: Document;
  private readonly strings: Strings;
  private readonly reducedMotion: boolean;

  private phase: Phase | null = null;
  private score = -1;
  private beat = -1;
  private shownFinal = -1;
  private fish = -1;
  private canRetry = false;
  private result = { score: 0, best: 0, isNew: false };
  private deaths = 0;

  constructor(doc: Document, strings: Strings, touch: boolean, reducedMotion: boolean, actions: HudActions) {
    this.doc = doc;
    this.strings = strings;
    this.reducedMotion = reducedMotion;
    const $ = <T extends HTMLElement>(sel: string) => {
      const el = doc.querySelector<T>(sel);
      if (!el) throw new Error(`missing ${sel}`);
      return el;
    };
    this.root = $('#app');
    this.frame = $('#frame');
    this.scoreEl = $('.score');
    this.beatBest = $('.beat-best');
    this.readyBest = $('.ready-best');
    this.countdownEl = $('.countdown');
    this.finalScore = $('.final-score');
    this.finalBest = $('.final-best');
    this.quip = $('.quip');
    this.pauseBtn = $<HTMLButtonElement>('.pause-btn');
    this.soundBtn = $<HTMLButtonElement>('.sound-btn');
    this.overtakeEl = $('.overtake');
    this.challengeEl = $('.challenge');
    this.challengeList = $<HTMLOListElement>('.challenge-list');
    this.standingsEl = $('.standings');
    this.standingsList = $<HTMLOListElement>('.standings-list');
    this.shareRow = $('.share-row');
    this.shareBtn = $<HTMLButtonElement>('.share-btn');
    this.nameInput = $<HTMLInputElement>('.name-input');
    this.toastEl = $('.toast');
    this.mapName = $('.map-name');
    this.mapHint = $('.map-hint');
    this.mapStars = $('.ready-best .stars');
    this.fishCount = $('.fish-count b');
    this.finalMap = $('.final-map');
    this.finalStars = $('.final-stars');
    this.finalFish = $('.final-fish');
    this.challengeHeading = $('.challenge-heading');
    const dots = $('.map-dots');
    this.mapDots = MAP_IDS.map(() => dots.appendChild(doc.createElement('i')));

    doc.documentElement.lang = strings.lang;
    $('#stage').setAttribute('aria-label', strings.canvasLabel);
    $('.tagline').textContent = strings.tagline;
    $('.start-main').textContent = touch ? strings.startTouch : strings.startMouse;
    const keys = $('.start-keys');
    if (touch) keys.remove();
    else {
      const [before, after] = strings.startKeys.split('{key}');
      keys.append(before, Object.assign(doc.createElement('kbd'), { textContent: strings.spaceKey }), after ?? '');
    }
    $('.start-glide').textContent = strings.startGlide;
    $('.ready-best .label').textContent = strings.best;
    $('.paused-title').textContent = strings.paused;
    $('.paused-hint').textContent = touch ? strings.resumeTouch : strings.resumeMouse;
    $('.over-title').textContent = strings.gameOver;
    $('.score-label').textContent = strings.score;
    $('.best-label').textContent = strings.best;
    $('.fish-label').textContent = strings.fish;
    $('.new-best').textContent = strings.newBest;
    this.beatBest.textContent = strings.newBest;
    $('.retry-hint').textContent = touch ? strings.retryTouch : strings.retryMouse;
    this.challengeHeading.textContent = strings.challengeHeading;
    $('.challenge-hint').textContent = strings.challengeHint;
    $('.standings-label').textContent = strings.standingsLabel;
    const exit = $<HTMLButtonElement>('.exit-challenge');
    exit.textContent = strings.exitChallenge;
    this.shareBtn.textContent = strings.shareStart;
    this.nameInput.placeholder = strings.namePlaceholder;
    this.nameInput.setAttribute('aria-label', strings.nameLabel);
    this.root.classList.toggle('touch', touch);

    const prev = $<HTMLButtonElement>('.map-prev');
    const next = $<HTMLButtonElement>('.map-next');
    prev.setAttribute('aria-label', strings.prevMap);
    prev.title = `${strings.prevMap} (←)`;
    next.setAttribute('aria-label', strings.nextMap);
    next.title = `${strings.nextMap} (→)`;
    for (const [btn, step] of [[prev, -1], [next, 1]] as const) {
      btn.addEventListener('click', () => {
        actions.gesture();
        actions.cycleMap(step);
      });
    }

    // Buttons and the name field must not also count as a flap: stop the press reaching the stage.
    for (const el of [this.pauseBtn, this.soundBtn, exit, this.shareRow, prev, next]) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    this.shareBtn.addEventListener('click', () => {
      actions.gesture();
      actions.share();
    });
    exit.addEventListener('click', () => {
      actions.gesture();
      actions.exitChallenge();
    });
    this.nameInput.addEventListener('change', () => actions.nameChanged(this.nameInput.value));
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.nameInput.blur();
    });
    this.pauseBtn.addEventListener('click', () => {
      actions.gesture();
      actions.togglePause();
      this.pauseBtn.blur();
    });
    this.soundBtn.addEventListener('click', () => {
      actions.gesture();
      actions.toggleSound();
    });
  }

  /** Pin the overlay to the world frame and scale it with the world. */
  layout(view: View): void {
    const s = this.frame.style;
    s.left = `${view.offsetX}px`;
    s.top = `${view.offsetY}px`;
    s.width = `${WORLD.width * view.scale}px`;
    s.height = `${WORLD.height * view.scale}px`;
    s.setProperty('--u', String(view.scale));
    s.setProperty('--frame-top', `${view.offsetY}px`);
    s.setProperty('--frame-side', `${view.offsetX}px`);
  }

  setSound(on: boolean): void {
    this.soundBtn.setAttribute('aria-pressed', String(on));
    const label = on ? this.strings.soundOn : this.strings.soundOff;
    this.soundBtn.setAttribute('aria-label', label);
    this.soundBtn.title = `${label} (M)`;
  }

  pulseScore(): void {
    if (this.reducedMotion || typeof this.scoreEl.animate !== 'function') return;
    this.scoreEl.animate(
      [{ transform: 'scale(1.28)' }, { transform: 'scale(1)' }],
      { duration: 200, easing: 'cubic-bezier(.2,.8,.3,1)' },
    );
  }

  /** The moment a run passes the previous best: a sticker pops under the score. */
  celebrateBest(): void {
    if (typeof this.beatBest.animate !== 'function') return;
    const frames: Keyframe[] = this.reducedMotion
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }]
      : [
          { opacity: 0, transform: 'rotate(-4deg) scale(0.4)' },
          { opacity: 1, transform: 'rotate(-4deg) scale(1.15)', offset: 0.12 },
          { opacity: 1, transform: 'rotate(-4deg) scale(1)', offset: 0.2 },
          { opacity: 1, transform: 'rotate(-4deg) scale(1)', offset: 0.85 },
          { opacity: 0, transform: 'rotate(-4deg) scale(0.9)' },
        ];
    this.beatBest.animate(frames, { duration: 1800, easing: 'ease-out' });
  }

  /** Someone's ghost was just overtaken: a sticker under the score. */
  announceOvertake(text: string): void {
    this.overtakeEl.textContent = text;
    if (typeof this.overtakeEl.animate !== 'function') return;
    const frames: Keyframe[] = this.reducedMotion
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }]
      : [
          { opacity: 0, transform: 'rotate(3deg) scale(0.5)' },
          { opacity: 1, transform: 'rotate(3deg) scale(1.1)', offset: 0.12 },
          { opacity: 1, transform: 'rotate(3deg) scale(1)', offset: 0.2 },
          { opacity: 1, transform: 'rotate(3deg) scale(1)', offset: 0.85 },
          { opacity: 0, transform: 'rotate(3deg) scale(0.9)' },
        ];
    this.overtakeEl.animate(frames, { duration: 1600, easing: 'ease-out' });
  }

  /** The map on the Ready screen: its name, what's special about it, its best and stars. */
  setMap(map: MapId, best: number): void {
    this.mapName.textContent = this.strings.mapNames[map];
    this.mapHint.textContent = this.strings.mapHints[map];
    const v = this.readyBest.querySelector('.value');
    if (v) v.textContent = String(best);
    this.readyBest.hidden = best <= 0;
    const stars = starsFor(best);
    this.mapStars.textContent = starText(stars);
    this.mapStars.setAttribute('aria-label', this.strings.stars(stars));
    MAP_IDS.forEach((id, i) => this.mapDots[i].classList.toggle('on', id === map));
    this.root.dataset.map = map;
  }

  /** The friends on this course, shown on the Ready screen (null: not a challenge). */
  setChallenge(rows: RankRow[] | null, map?: MapId): void {
    this.challengeHeading.textContent = rows && map ? `${this.strings.challengeHeading} · ${this.strings.mapNames[map]}` : this.strings.challengeHeading;
    this.challengeEl.hidden = !rows;
    this.root.classList.toggle('in-challenge', !!rows);
    this.shareBtn.textContent = rows ? this.strings.shareRelay : this.strings.shareStart;
    if (rows) this.fillRanks(this.challengeList, rows);
    if (!rows) this.showStandings(null);
  }

  /** Where this run placed among the friends on the course (null: hide). */
  showStandings(rows: RankRow[] | null): void {
    this.standingsEl.hidden = !rows;
    if (rows) this.fillRanks(this.standingsList, rows);
  }

  /** Whether there is a run to share (there isn't until one has been flown). */
  setShareable(on: boolean): void {
    this.shareRow.hidden = !on;
  }

  get nameValue(): string {
    return this.nameInput.value;
  }

  set nameValue(name: string) {
    this.nameInput.value = name;
  }

  /** A short message near the bottom of the frame. */
  toast(text: string, ms = 2800): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  private fillRanks(list: HTMLOListElement, rows: RankRow[]): void {
    const doc = this.doc;
    list.replaceChildren(
      ...rows.map((r) => {
        const li = doc.createElement('li');
        if (r.me) li.className = 'me';
        const dot = doc.createElement('i');
        dot.className = 'dot';
        dot.style.background = r.color;
        const who = doc.createElement('span');
        who.className = 'who';
        who.textContent = r.name;
        const score = doc.createElement('b');
        score.textContent = String(r.score);
        li.append(dot, who, score);
        return li;
      }),
    );
  }

  /** Called once when a run ends. */
  showResult(score: number, best: number, isNew: boolean, map: MapId, fish: number): void {
    this.deaths++;
    this.result = { score, best, isNew };
    this.finalBest.textContent = String(best);
    this.finalMap.textContent = this.strings.mapNames[map];
    const stars = starsFor(best);
    this.finalStars.textContent = starText(stars);
    this.finalStars.setAttribute('aria-label', this.strings.stars(stars));
    this.finalFish.textContent = String(fish);
    this.root.classList.toggle('is-new-best', isNew);
    const livesLeft = 8 - ((this.deaths - 1) % 9);
    this.quip.textContent = isNew && score > 0
      ? this.strings.newBestQuip
      : livesLeft > 0 ? this.strings.livesLeft(livesLeft) : this.strings.outOfLives;
    this.shownFinal = -1;
  }

  sync(game: Game, best: number): void {
    const phase = game.phase;
    if (phase !== this.phase) {
      this.root.dataset.phase = phase;
      // Leaving the result card: put the on-screen keyboard away.
      if (this.phase === 'gameover' && this.doc.activeElement === this.nameInput) this.nameInput.blur();
      if (phase === 'ready') {
        this.setMap(game.map, best);
        this.root.classList.remove('can-retry');
        this.canRetry = false;
      }
      const paused = phase === 'paused';
      this.pauseBtn.setAttribute('aria-label', paused ? this.strings.resume : this.strings.pause);
      this.pauseBtn.title = `${paused ? this.strings.resume : this.strings.pause} (P)`;
      this.phase = phase;
    }

    if (game.score !== this.score) {
      this.score = game.score;
      this.scoreEl.textContent = String(game.score);
    }

    if (game.fish !== this.fish) {
      const more = game.fish > this.fish && this.fish >= 0;
      this.fish = game.fish;
      this.fishCount.textContent = String(game.fish);
      if (more && !this.reducedMotion && typeof this.fishCount.animate === 'function') {
        this.fishCount.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.3,1)' });
      }
    }

    const beat = countdownBeat(game);
    if (beat !== this.beat) {
      this.beat = beat;
      this.countdownEl.textContent = beat > 0 ? String(beat) : '';
      this.root.classList.toggle('counting', beat > 0);
      if (beat > 0 && !this.reducedMotion && typeof this.countdownEl.animate === 'function') {
        this.countdownEl.animate([{ transform: 'scale(1.5)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 220, easing: 'ease-out' });
      }
    }

    if (phase === 'gameover') {
      // Count the score up quickly: at most ~0.6s however high it is.
      const { score } = this.result;
      const step = score > 0 ? Math.min(0.045, 0.6 / score) : 1;
      const shown = this.reducedMotion ? score : Math.min(score, Math.floor(game.phaseTime / step));
      if (shown !== this.shownFinal) {
        this.shownFinal = shown;
        this.finalScore.textContent = String(shown);
      }
      const canRetry = game.phaseTime >= TIMING.retryLockout;
      if (canRetry !== this.canRetry) {
        this.canRetry = canRetry;
        this.root.classList.toggle('can-retry', canRetry);
      }
    }
  }
}
