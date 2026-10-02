import { TIMING, WORLD } from '../game/config.ts';
import type { Game, Phase } from '../game/Game.ts';
import type { View } from '../render/view.ts';
import type { Strings } from './strings.ts';

export interface HudActions {
  togglePause(): void;
  toggleSound(): void;
  gesture(): void;
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
  private readonly strings: Strings;
  private readonly reducedMotion: boolean;

  private phase: Phase | null = null;
  private score = -1;
  private beat = -1;
  private shownFinal = -1;
  private canRetry = false;
  private result = { score: 0, best: 0, isNew: false };
  private deaths = 0;

  constructor(doc: Document, strings: Strings, touch: boolean, reducedMotion: boolean, actions: HudActions) {
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
    $('.ready-best .label').textContent = strings.best;
    $('.paused-title').textContent = strings.paused;
    $('.paused-hint').textContent = touch ? strings.resumeTouch : strings.resumeMouse;
    $('.over-title').textContent = strings.gameOver;
    $('.score-label').textContent = strings.score;
    $('.best-label').textContent = strings.best;
    $('.new-best').textContent = strings.newBest;
    this.beatBest.textContent = strings.newBest;
    $('.retry-hint').textContent = touch ? strings.retryTouch : strings.retryMouse;
    this.root.classList.toggle('touch', touch);

    // Buttons must not also count as a flap: stop the press reaching the stage.
    for (const btn of [this.pauseBtn, this.soundBtn]) {
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
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

  /** Called once when a run ends. */
  showResult(score: number, best: number, isNew: boolean): void {
    this.deaths++;
    this.result = { score, best, isNew };
    this.finalBest.textContent = String(best);
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
      if (phase === 'ready') {
        const v = this.readyBest.querySelector('.value');
        if (v) v.textContent = String(best);
        this.readyBest.hidden = best <= 0;
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
