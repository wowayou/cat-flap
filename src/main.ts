import '@fontsource-variable/fredoka/wght.css';
import './styles.css';

import { AudioManager } from './audio/AudioManager.ts';
import { Autopilot } from './game/autopilot.ts';
import { TIMING } from './game/config.ts';
import { Game, type GameEvent } from './game/Game.ts';
import { FixedStepLoop } from './game/loop.ts';
import { bindInput } from './input.ts';
import { POPUP_FONT, Renderer } from './render/Renderer.ts';
import { browserStorage, SettingsStore } from './storage/settings.ts';
import { countdownBeat, Hud } from './ui/Hud.ts';
import { pickStrings } from './ui/strings.ts';

/*
 * Wiring only. The simulation (Game) knows nothing about the DOM; the
 * renderer and HUD only read it; input only calls its one action. Each frame:
 * advance fixed steps → hand events to effects/audio/UI → draw.
 */

const params = new URLSearchParams(location.search);
const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('stage') as HTMLCanvasElement;

const media = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
const touch = media('(pointer: coarse)');
const reducedMotion = media('(prefers-reduced-motion: reduce)');

const store = new SettingsStore(browserStorage());
const settings = store.load();
let best = settings.best;

const game = new Game();
const loop = new FixedStepLoop();
const renderer = new Renderer(canvas);
renderer.reducedMotion = reducedMotion;
renderer.debug = params.has('debug');
const audio = new AudioManager(settings.soundOn);

const toggleSound = () => {
  const on = !audio.isEnabled;
  audio.setEnabled(on);
  store.saveSound(on);
  hud.setSound(on);
  if (on) audio.play('tick');
};

const hud = new Hud(document, pickStrings(navigator.languages ?? [navigator.language]), touch, reducedMotion, {
  togglePause: () => game.togglePause(),
  toggleSound,
  gesture: () => audio.unlock(),
});
hud.setSound(settings.soundOn);

bindInput(app, window, {
  primary: () => game.flap(),
  togglePause: () => game.togglePause(),
  toggleSound,
  gesture: () => audio.unlock(),
});

// `?bot` lets the autopilot play (a demo, and how e2e tests reach a score).
// `?bot=5` stops tapping at 5 points so the run ends there.
const bot = params.has('bot') ? new Autopilot() : null;
const botLimit = Number(params.get('bot')) || Infinity;

// Celebrate passing the previous best once per run (not on a first-ever run: best 0).
let celebrated = false;

function onEvent(e: GameEvent): void {
  renderer.handleEvent(e, game);
  switch (e.type) {
    case 'start':
      celebrated = false;
      break;
    case 'flap':
      audio.play('flap');
      break;
    case 'score':
      audio.play('score');
      hud.pulseScore();
      if (!celebrated && best > 0 && e.score > best) {
        celebrated = true;
        hud.celebrateBest();
        audio.play('go', 0.16);
      }
      break;
    case 'bonk':
      audio.play('bonk');
      break;
    case 'hit':
      audio.play('hit');
      audio.play('meow', 0.1);
      if (touch) navigator.vibrate?.(35);
      break;
    case 'resume':
      audio.play('go');
      break;
    case 'gameover': {
      const isNew = e.score > best;
      if (isNew) {
        best = e.score;
        store.saveBest(best);
      }
      hud.showResult(e.score, best, isNew);
      break;
    }
    default:
      break;
  }
}

function resize(): void {
  const view = renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
  hud.layout(view);
}
resize();
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

// Leaving the tab or window pauses the run; it never continues unseen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.pause();
    audio.suspend();
  }
});
window.addEventListener('blur', () => game.pause());

let beat = 0;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.max(0, (now - last) / 1000);
  last = now;

  const alpha = loop.advance(dt, (step) => {
    if (bot) {
      if (game.score < botLimit) bot.update(game);
      if (game.phase === 'ready' || (game.phase === 'gameover' && game.phaseTime > 1.6 && botLimit === Infinity)) game.flap();
    }
    game.step(step);
  });
  game.consumeEvents(onEvent);

  const b = countdownBeat(game);
  if (b !== beat) {
    if (b > 0) audio.play('tick');
    beat = b;
  }

  renderer.render(game, alpha, Math.min(dt, TIMING.maxFrameDt));
  hud.sync(game, best);
  requestAnimationFrame(frame);
}

// Start drawing straight away; ask for the display font early so the canvas "+1" pop-ups get it.
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
document.fonts?.load(POPUP_FONT).catch(() => {});
