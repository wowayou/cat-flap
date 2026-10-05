/**
 * Maps devices to actions. Space, mouse, touch and gamepad buttons all end
 * in the same `primary()` call (→ Game.flap), so every device produces
 * identical physics. Presses fire on *down* (pointerdown / keydown) for the
 * lowest latency, and held keys don't auto-repeat: one press, one flap.
 *
 * Holding is tracked across devices: `hold(true)` when the first finger,
 * key or button goes down, `hold(false)` once the last one is let go (or
 * the page loses focus). Holding on past the top of a flap glides.
 */
export interface InputActions {
  primary(): void;
  /** The primary button is now held down by something (true) or by nothing (false). */
  hold(down: boolean): void;
  togglePause(): void;
  toggleSound(): void;
  /** Any user gesture — lets audio unlock (browsers require a gesture). */
  gesture(): void;
  /** Previous / next map (←/→, A/D, gamepad d-pad). Only meaningful on the Ready screen. */
  cycleMap?(step: number): void;
}

const PRIMARY_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
const MAP_KEYS: Record<string, number> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };

/** Standard-mapping gamepad buttons: face buttons, shoulders, triggers and d-pad up all flap. */
const PAD_PRIMARY = [0, 1, 2, 3, 4, 5, 6, 7, 12];
const PAD_SOUND = 8;
const PAD_PAUSE = 9;
const PAD_LEFT = 14;
const PAD_RIGHT = 15;

/** The parts of the Gamepad API this reads (so tests can pass plain objects). */
export interface PadLike {
  index: number;
  connected: boolean;
  buttons: readonly { pressed: boolean }[];
}

interface PadState {
  primary: boolean;
  pause: boolean;
  sound: boolean;
  left: boolean;
  right: boolean;
}

/** Typing in a text field (the share name) must never flap, pause or mute. */
const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.closest('input, textarea, select') !== null);

export class Controls {
  private readonly actions: InputActions;
  /** Everything holding the primary button down: pointers, keys, gamepads. */
  private readonly holding = new Set<string>();
  private readonly pads = new Map<number, PadState>();

  constructor(actions: InputActions) {
    this.actions = actions;
  }

  get held(): boolean {
    return this.holding.size > 0;
  }

  /** Let go of everything, e.g. when the page loses focus and key-ups would be missed. */
  releaseAll(): void {
    if (this.holding.size === 0) return;
    this.holding.clear();
    this.actions.hold(false);
  }

  bind(surface: HTMLElement, win: Window): () => void {
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.actions.gesture();
      this.down(`p${e.pointerId ?? 0}`);
    };
    // Releases are caught on the window, so letting go outside the stage still counts.
    const onPointerUp = (e: PointerEvent) => this.up(`p${e.pointerId ?? 0}`);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;
      const onButton = e.target instanceof HTMLElement && e.target.closest('button') !== null;
      if (PRIMARY_KEYS.has(e.code) || ((e.code === 'Enter' || e.code === 'NumpadEnter') && !onButton)) {
        e.preventDefault(); // no page scroll, no button activation by Space
        if (e.repeat) return;
        this.actions.gesture();
        this.down(`k${e.code}`);
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        if (e.repeat) return;
        e.preventDefault();
        this.actions.gesture();
        this.actions.togglePause();
      } else if (e.code === 'KeyM') {
        if (e.repeat) return;
        this.actions.gesture();
        this.actions.toggleSound();
      } else if (e.code in MAP_KEYS && this.actions.cycleMap) {
        e.preventDefault();
        if (e.repeat) return;
        this.actions.gesture();
        this.actions.cycleMap(MAP_KEYS[e.code]);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => this.up(`k${e.code}`);
    const onHidden = () => {
      if (win.document.hidden) this.releaseAll();
    };
    const onBlur = () => this.releaseAll();

    const onContextMenu = (e: Event) => e.preventDefault();
    // Some iOS versions only let audio start on the *end* of a touch; unlocking is idempotent.
    const onRelease = () => this.actions.gesture();

    surface.addEventListener('pointerdown', onPointerDown);
    surface.addEventListener('pointerup', onRelease);
    surface.addEventListener('touchend', onRelease, { passive: true });
    surface.addEventListener('contextmenu', onContextMenu);
    win.addEventListener('pointerup', onPointerUp);
    win.addEventListener('pointercancel', onPointerUp);
    win.addEventListener('keydown', onKeyDown);
    win.addEventListener('keyup', onKeyUp);
    win.addEventListener('blur', onBlur);
    win.document.addEventListener('visibilitychange', onHidden);
    return () => {
      surface.removeEventListener('pointerdown', onPointerDown);
      surface.removeEventListener('pointerup', onRelease);
      surface.removeEventListener('touchend', onRelease);
      surface.removeEventListener('contextmenu', onContextMenu);
      win.removeEventListener('pointerup', onPointerUp);
      win.removeEventListener('pointercancel', onPointerUp);
      win.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('keyup', onKeyUp);
      win.removeEventListener('blur', onBlur);
      win.document.removeEventListener('visibilitychange', onHidden);
    };
  }

  /**
   * Gamepads have no events for buttons: call this once per frame with
   * `navigator.getGamepads()`. Presses are edges, so a held button flaps once
   * and keeps holding.
   */
  pollGamepads(pads: ArrayLike<PadLike | null>): void {
    const seen = new Set<number>();
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      seen.add(pad.index);
      const prev = this.pads.get(pad.index) ?? { primary: false, pause: false, sound: false, left: false, right: false };
      const on = (b: number) => pad.buttons[b]?.pressed === true;
      const next: PadState = {
        primary: PAD_PRIMARY.some(on),
        pause: on(PAD_PAUSE),
        sound: on(PAD_SOUND),
        left: on(PAD_LEFT),
        right: on(PAD_RIGHT),
      };
      this.pads.set(pad.index, next);
      const id = `g${pad.index}`;
      if (next.primary && !prev.primary) {
        this.actions.gesture();
        this.down(id);
      } else if (!next.primary && prev.primary) {
        this.up(id);
      }
      if (next.pause && !prev.pause) this.actions.togglePause();
      if (next.sound && !prev.sound) this.actions.toggleSound();
      if (next.left && !prev.left) this.actions.cycleMap?.(-1);
      if (next.right && !prev.right) this.actions.cycleMap?.(1);
    }
    // A pad that went away lets go of anything it was holding.
    for (const index of this.pads.keys()) {
      if (seen.has(index)) continue;
      this.pads.delete(index);
      this.up(`g${index}`);
    }
  }

  private down(id: string): void {
    const first = this.holding.size === 0;
    this.holding.add(id);
    if (first) this.actions.hold(true);
    this.actions.primary();
  }

  private up(id: string): void {
    if (!this.holding.delete(id)) return;
    if (this.holding.size === 0) this.actions.hold(false);
  }
}

/** Binds keyboard and pointer input; returns an unbind function. */
export function bindInput(surface: HTMLElement, win: Window, actions: InputActions): () => void {
  return new Controls(actions).bind(surface, win);
}
