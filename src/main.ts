import '@fontsource-variable/fredoka/wght.css';
import './styles.css';

import { AudioManager } from './audio/AudioManager.ts';
import { Autopilot } from './game/autopilot.ts';
import { TIMING } from './game/config.ts';
import { Game, MAX_RECORDED_FLAPS, type GameEvent, type RunRecord } from './game/Game.ts';
import { FixedStepLoop } from './game/loop.ts';
import { bindInput } from './input.ts';
import { loadCatArt } from './render/cat.ts';
import { GHOST_COLORS, GINGER } from './render/palette.ts';
import { POPUP_FONT, Renderer } from './render/Renderer.ts';
import { cleanName, decodeChallenge, encodeChallenge, mergeGhosts, verifyGhosts, type Ghost } from './social/link.ts';
import { Squad, type Standing } from './social/squad.ts';
import { browserStorage, SettingsStore } from './storage/settings.ts';
import { countdownBeat, Hud, type RankRow } from './ui/Hud.ts';
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
const strings = pickStrings(navigator.languages ?? [navigator.language]);
const artStatus = document.getElementById('art-status')!;
artStatus.querySelector('p')!.textContent = strings.loading;
const pid = store.playerId();

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

const hud = new Hud(document, strings, touch, reducedMotion, {
  togglePause: () => game.togglePause(),
  toggleSound,
  gesture: () => audio.unlock(),
  share: () => void share(),
  exitChallenge,
  nameChanged: (name) => {
    hud.nameValue = cleanName(name);
    store.saveName(hud.nameValue);
  },
});
hud.setSound(settings.soundOn);
hud.nameValue = store.loadName();
hud.setShareable(false);

// ---------------------------------------------------------------- challenges

/**
 * `?c=…` is a friends' challenge: a shared course plus the ghosts of everyone
 * who has flown it and passed the link on. Every retry flies the same course.
 */
let squad: Squad | null = null;
/** The best run so far on the current course, which is what "share" sends. */
let shareable: { score: number; record: RunRecord } | null = null;

const myName = () => cleanName(hud.nameValue) || strings.defaultName;
const rankRows = (rows: Standing[]): RankRow[] =>
  rows.map((r) => ({ name: r.me ? strings.you : r.name, score: r.score, me: r.me, color: r.me ? GINGER.fur : GHOST_COLORS[r.coat] }));

function enterChallenge(seed: number, ghosts: Ghost[]): void {
  squad = new Squad(ghosts);
  game.fixedSeed = seed;
  game.reset(seed);
  renderer.setSquad(squad);
  hud.setChallenge(rankRows(squad.standings('', -1).filter((r) => !r.me)));
}

function exitChallenge(): void {
  squad = null;
  renderer.setSquad(null);
  game.fixedSeed = null;
  if (game.phase === 'ready') game.reset();
  hud.setChallenge(null);
  const url = new URL(location.href);
  url.searchParams.delete('c');
  history.replaceState(history.state, '', url);
}

function openLink(value: string): void {
  const decoded = decodeChallenge(value);
  if (!decoded.ok) {
    hud.toast(decoded.reason === 'outdated' ? strings.linkOutdated : strings.linkBroken, 4000);
    return;
  }
  const { seed, ghosts } = decoded.challenge;
  const { valid, rejected } = verifyGhosts(ghosts);
  if (valid.length === 0) {
    hud.toast(ghosts.length ? strings.linkOutdated : strings.linkBroken, 4000);
    return;
  }
  enterChallenge(seed, valid);
  if (rejected > 0) hud.toast(strings.ghostsSkipped(rejected), 4000);
}

async function share(): Promise<void> {
  if (!shareable) return;
  const me: Ghost = { pid, name: myName(), score: shareable.score, record: shareable.record };
  const others = squad && game.fixedSeed === shareable.record.seed ? squad.rivals.map((r) => r.ghost) : [];
  const ghosts = mergeGhosts(others, me);
  const self = ghosts.find((g) => g.pid === pid) ?? me;
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('c', encodeChallenge({ seed: shareable.record.seed, ghosts }));
  const text = strings.shareText(self.score, ghosts.indexOf(self) + 1, ghosts.length);

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Cat Flap', text, url: url.href });
      return;
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return; // the player closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url.href}`);
    hud.toast(strings.copied);
  } catch {
    window.prompt(strings.copyPrompt, url.href);
  }
}

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
    case 'score': {
      audio.play('score');
      hud.pulseScore();
      if (!celebrated && best > 0 && e.score > best) {
        celebrated = true;
        hud.celebrateBest();
        audio.play('go', 0.16);
      }
      const passed = squad?.overtaken(e.score) ?? [];
      if (passed.length > 0) {
        hud.announceOvertake(strings.overtook(passed.map((r) => r.ghost.name).join(' · ')));
        audio.play('go', 0.1);
      }
      break;
    }
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
      // Keep the best run on this course for sharing (a record past the flap cap couldn't replay).
      const record = game.record;
      if (record.flaps.length < MAX_RECORDED_FLAPS && (!shareable || shareable.record.seed !== record.seed || e.score >= shareable.score)) {
        shareable = { score: e.score, record: { ...record, flaps: record.flaps.slice() } };
      }
      hud.setShareable(shareable !== null);
      hud.showStandings(squad ? rankRows(squad.standings(myName(), e.score)) : null);
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
    squad?.beforeStep(game);
    const before = game.phase;
    game.step(step);
    squad?.afterStep(game, before);
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

const link = params.get('c');
if (link) openLink(link);

// Enable play only once the character is decoded. A failed asset request
// leaves an explicit retry action, never a playable scene with an invisible cat.
void loadCatArt().then(() => {
  // Establish the first screen before revealing it, avoiding transitions
  // from uninitialized overlays while the image is being decoded.
  renderer.render(game, 0, 0);
  hud.sync(game, best);
  artStatus.hidden = true;
  app.inert = false;
  app.removeAttribute('aria-busy');
  bindInput(app, window, {
    primary: () => game.flap(),
    togglePause: () => game.togglePause(),
    toggleSound,
    gesture: () => audio.unlock(),
  });
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
}).catch((error: unknown) => {
  console.error('Character artwork failed to load', error);
  artStatus.querySelector('p')!.textContent = strings.artLoadFailed;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = strings.reload;
  retry.addEventListener('click', () => location.reload());
  artStatus.append(retry);
});
document.fonts?.load(POPUP_FONT).catch(() => {});
