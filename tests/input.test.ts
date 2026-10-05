// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bindInput, Controls, type PadLike } from '../src/input.ts';

let calls: string[];
let unbind: () => void;
let surface: HTMLElement;
let button: HTMLButtonElement;

beforeEach(() => {
  document.body.innerHTML = '<main id="app"><button id="b">x</button></main>';
  surface = document.getElementById('app')!;
  button = document.getElementById('b') as HTMLButtonElement;
  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  calls = [];
  unbind = bindInput(surface, window, {
    primary: () => calls.push('primary'),
    hold: (down) => calls.push(down ? 'hold' : 'let go'),
    togglePause: () => calls.push('pause'),
    toggleSound: () => calls.push('sound'),
    gesture: () => calls.push('gesture'),
    cycleMap: (step) => calls.push(`map ${step}`),
  });
});
afterEach(() => unbind());

// jsdom has no PointerEvent constructor; a MouseEvent with the pointer fields is equivalent here.
function pointer(target: EventTarget, init: { pointerType: string; button?: number; id?: number; type?: string }): MouseEvent {
  const e = new MouseEvent(init.type ?? 'pointerdown', { bubbles: true, cancelable: true, button: init.button ?? 0 });
  Object.defineProperty(e, 'pointerType', { value: init.pointerType });
  Object.defineProperty(e, 'pointerId', { value: init.id ?? 1 });
  target.dispatchEvent(e);
  return e;
}

function key(code: string, opts: KeyboardEventInit = {}, target: EventTarget = window, type = 'keydown'): KeyboardEvent {
  const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...opts });
  target.dispatchEvent(e);
  return e;
}

const actionsOnly = () => calls.filter((c) => c !== 'gesture');

describe('one action for every device', () => {
  it('mouse, touch, pen and Space all call primary exactly once', () => {
    pointer(surface, { pointerType: 'mouse' });
    pointer(surface, { pointerType: 'touch' });
    pointer(surface, { pointerType: 'pen' });
    key('Space');
    expect(calls.filter((c) => c === 'primary')).toHaveLength(4);
    expect(calls.filter((c) => c === 'gesture')).toHaveLength(4);
  });

  it('ignores right / middle mouse buttons', () => {
    pointer(surface, { pointerType: 'mouse', button: 2 });
    pointer(surface, { pointerType: 'mouse', button: 1 });
    expect(calls).toEqual([]);
  });

  it('a held key flaps once: auto-repeat is ignored but still prevented (no page scroll)', () => {
    key('Space');
    const repeat = key('Space', { repeat: true });
    expect(calls.filter((c) => c === 'primary')).toHaveLength(1);
    expect(repeat.defaultPrevented).toBe(true);
  });

  it('prevents default so taps never scroll, zoom or select', () => {
    expect(pointer(surface, { pointerType: 'touch' }).defaultPrevented).toBe(true);
    expect(key('Space').defaultPrevented).toBe(true);
  });

  it('pressing a HUD button does not flap', () => {
    pointer(button, { pointerType: 'touch' });
    expect(calls).toEqual([]);
  });

  it('Enter flaps on the stage but is left alone on a focused button', () => {
    key('Enter');
    expect(calls).toContain('primary');
    calls = [];
    const e = key('Enter', {}, button);
    expect(calls).toEqual([]);
    expect(e.defaultPrevented).toBe(false);
  });
});

describe('holding (to glide)', () => {
  it('a press holds until it is let go, for keys and pointers alike', () => {
    key('Space');
    key('Space', {}, window, 'keyup');
    pointer(surface, { pointerType: 'touch', id: 7 });
    pointer(window, { pointerType: 'touch', id: 7, type: 'pointerup' });
    expect(actionsOnly()).toEqual(['hold', 'primary', 'let go', 'hold', 'primary', 'let go']);
  });

  it('stays held while any finger or key is still down, and every new press still flaps', () => {
    pointer(surface, { pointerType: 'touch', id: 1 });
    pointer(surface, { pointerType: 'touch', id: 2 });
    key('KeyW');
    pointer(window, { pointerType: 'touch', id: 1, type: 'pointercancel' });
    key('KeyW', {}, window, 'keyup');
    expect(actionsOnly()).toEqual(['hold', 'primary', 'primary', 'primary']);
    pointer(window, { pointerType: 'touch', id: 2, type: 'pointerup' });
    expect(actionsOnly()).toEqual(['hold', 'primary', 'primary', 'primary', 'let go']);
  });

  it('a release that was never a flap (a HUD button, a stray key-up) changes nothing', () => {
    pointer(button, { pointerType: 'touch', id: 3 });
    pointer(window, { pointerType: 'touch', id: 3, type: 'pointerup' });
    key('Space', {}, window, 'keyup');
    expect(calls).toEqual([]);
  });

  it('losing focus lets go, so a missed key-up cannot glide forever', () => {
    key('Space');
    window.dispatchEvent(new Event('blur'));
    expect(actionsOnly()).toEqual(['hold', 'primary', 'let go']);
    key('Space', {}, window, 'keyup');
    expect(actionsOnly()).toHaveLength(3);
  });
});

describe('gamepads', () => {
  const pad = (pressed: number[], index = 0): PadLike => ({
    index, connected: true, buttons: Array.from({ length: 17 }, (_, b) => ({ pressed: pressed.includes(b) })),
  });

  it('A flaps once per press and holds until released; Start pauses; d-pad picks maps', () => {
    const log: string[] = [];
    const c = new Controls({
      primary: () => log.push('primary'), hold: (d) => log.push(d ? 'hold' : 'let go'),
      togglePause: () => log.push('pause'), toggleSound: () => log.push('sound'),
      gesture: () => {}, cycleMap: (s) => log.push(`map ${s}`),
    });
    c.pollGamepads([pad([0])]);
    c.pollGamepads([pad([0])]);
    c.pollGamepads([pad([])]);
    c.pollGamepads([pad([9, 15])]);
    c.pollGamepads([pad([14])]);
    expect(log).toEqual(['hold', 'primary', 'let go', 'pause', 'map 1', 'map -1']);
  });

  it('shares the hold with other devices and lets go when the pad disconnects', () => {
    const log: string[] = [];
    const c = new Controls({
      primary: () => log.push('primary'), hold: (d) => log.push(d ? 'hold' : 'let go'),
      togglePause: () => {}, toggleSound: () => {}, gesture: () => {},
    });
    c.pollGamepads([pad([7], 2)]);
    expect(c.held).toBe(true);
    c.pollGamepads([null]);
    expect(c.held).toBe(false);
    expect(log).toEqual(['hold', 'primary', 'let go']);
  });
});

describe('other keys', () => {
  it('P / Escape pause, M toggles sound, ←/→ and A/D pick maps, modified keys are left to the browser', () => {
    key('KeyP');
    key('Escape');
    key('KeyM');
    key('ArrowLeft');
    key('KeyD');
    key('KeyD', { repeat: true });
    expect(calls.filter((c) => c !== 'gesture')).toEqual(['pause', 'pause', 'sound', 'map -1', 'map 1']);
    calls = [];
    key('Space', { ctrlKey: true });
    key('KeyR', { metaKey: true });
    expect(calls).toEqual([]);
  });
});

describe('text fields', () => {
  it('typing a name (Space, Enter, P, M, W) never flaps, pauses or mutes, and is not blocked', () => {
    const input = document.createElement('input');
    surface.append(input);
    for (const code of ['Space', 'Enter', 'KeyP', 'KeyM', 'KeyW', 'ArrowUp', 'KeyA', 'ArrowRight']) {
      const e = key(code, {}, input);
      expect(e.defaultPrevented).toBe(false);
    }
    expect(calls).toEqual([]);
  });
});
