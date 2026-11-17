import { useEffect, useRef, type PointerEvent } from 'react';

export function StudioVolumeSlider({ value, onChange, label, disabled }: {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  disabled?: boolean;
}) {
  const gesture = useRef<AbortController | null>(null);

  useEffect(() => () => gesture.current?.abort(), []);

  function trackPointerFocus(event: PointerEvent<HTMLInputElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    const input = event.currentTarget;
    const doc = input.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;
    const before = doc.activeElement;
    const keyboardFocus = before === input || before?.matches(':focus-visible') ? before : null;
    const pointer = event.pointerId;
    gesture.current?.abort();
    const controller = new AbortController();
    gesture.current = controller;

    function finish() {
      controller.abort();
      gesture.current = null;
      const focused = doc.activeElement;
      // WebKit can focus the scrollable timeline around a native range input.
      if (focused instanceof HTMLElement && focused !== keyboardFocus &&
        (focused === input || focused.tabIndex >= 0 && focused.contains(input))) focused.blur();
    }
    function release(event: globalThis.PointerEvent) {
      if (event.pointerId === pointer) finish();
    }
    const options = { capture: true, signal: controller.signal };
    view.addEventListener('pointerup', release, options);
    view.addEventListener('pointercancel', release, options);
    view.addEventListener('blur', finish, { signal: controller.signal });
  }

  return <input type="range" min="0" max="1" step=".01" value={value} disabled={disabled}
    aria-label={label} aria-valuetext={`${Math.round(value * 100)}%`} aria-keyshortcuts="Space"
    onPointerDown={trackPointerFocus} onChange={event => onChange(event.currentTarget.valueAsNumber)} />;
}
