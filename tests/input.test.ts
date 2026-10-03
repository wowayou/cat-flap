// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bindInput } from '../src/input.ts';

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
    togglePause: () => calls.push('pause'),
    toggleSound: () => calls.push('sound'),
    gesture: () => calls.push('gesture'),
  });
});
afterEach(() => unbind());

// jsdom has no PointerEvent constructor; a MouseEvent with the pointer fields is equivalent here.
function pointer(target: Element, init: { pointerType: string; button?: number }): MouseEvent {
  const e = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: init.button ?? 0 });
  Object.defineProperty(e, 'pointerType', { value: init.pointerType });
  target.dispatchEvent(e);
  return e;
}

function key(code: string, opts: KeyboardEventInit = {}, target: EventTarget = window): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...opts });
  target.dispatchEvent(e);
  return e;
}

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

describe('other keys', () => {
  it('P / Escape pause, M toggles sound, modified keys are left to the browser', () => {
    key('KeyP');
    key('Escape');
    key('KeyM');
    expect(calls.filter((c) => c !== 'gesture')).toEqual(['pause', 'pause', 'sound']);
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
    for (const code of ['Space', 'Enter', 'KeyP', 'KeyM', 'KeyW', 'ArrowUp']) {
      const e = key(code, {}, input);
      expect(e.defaultPrevented).toBe(false);
    }
    expect(calls).toEqual([]);
  });
});
