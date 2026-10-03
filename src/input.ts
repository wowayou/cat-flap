/**
 * Maps devices to actions. Space, mouse and touch all end in the same
 * `primary()` call (→ Game.flap), so every device produces identical physics.
 * Presses fire on *down* (pointerdown / keydown) for the lowest latency, and
 * held keys don't auto-repeat: one press, one flap.
 */
export interface InputActions {
  primary(): void;
  togglePause(): void;
  toggleSound(): void;
  /** Any user gesture — lets audio unlock (browsers require a gesture). */
  gesture(): void;
}

const PRIMARY_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);

/** Typing in a text field (the share name) must never flap, pause or mute. */
const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.closest('input, textarea, select') !== null);

export function bindInput(surface: HTMLElement, win: Window, actions: InputActions): () => void {
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    actions.gesture();
    actions.primary();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;
    const onButton = e.target instanceof HTMLElement && e.target.closest('button') !== null;
    if (PRIMARY_KEYS.has(e.code) || ((e.code === 'Enter' || e.code === 'NumpadEnter') && !onButton)) {
      e.preventDefault(); // no page scroll, no button activation by Space
      if (e.repeat) return;
      actions.gesture();
      actions.primary();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (e.repeat) return;
      e.preventDefault();
      actions.gesture();
      actions.togglePause();
    } else if (e.code === 'KeyM') {
      if (e.repeat) return;
      actions.gesture();
      actions.toggleSound();
    }
  };

  const onContextMenu = (e: Event) => e.preventDefault();
  // Some iOS versions only let audio start on the *end* of a touch; unlocking is idempotent.
  const onRelease = () => actions.gesture();

  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointerup', onRelease);
  surface.addEventListener('touchend', onRelease, { passive: true });
  surface.addEventListener('contextmenu', onContextMenu);
  win.addEventListener('keydown', onKeyDown);
  return () => {
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointerup', onRelease);
    surface.removeEventListener('touchend', onRelease);
    surface.removeEventListener('contextmenu', onContextMenu);
    win.removeEventListener('keydown', onKeyDown);
  };
}
