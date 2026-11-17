import { useEffect, useEffectEvent } from 'react';
import type { StudioDeckControls } from './use-studio-deck-controls';

export function useStudioTransportShortcut(deck: StudioDeckControls | null) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== ' ' || event.defaultPrevented || event.isComposing ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !deck) return;
    const { studio, cueing, toggleTransport } = deck;
    if (!studio.localReady || studio.locked || (studio.busy && !cueing)) return;
    if (!studio.playing && !cueing && !studio.layers.length && !(studio.candidate && studio.previewCandidate)) return;

    const target = event.target;
    if (target instanceof Element) {
      if (target.closest('dialog, [role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      // A focused control keeps its own Space behavior unless it opts into transport.
      if (!target.closest('[aria-keyshortcuts="Space"], [data-studio-playback-shortcut]') &&
        target.closest('button, a[href], input, textarea, select, summary, [contenteditable], [role="button"], [role="slider"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]')) return;
    }
    event.preventDefault();
    if (!event.repeat) void toggleTransport({ instant: true });
  });

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
}
