import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { gsap } from 'gsap';
import { clamp, storyTransitionDuration } from '../lib/story-motion';
import { createStoryScrollState } from '../lib/story-scroll-state';
import { createStoryWheelInput, SCROLL_IDLE_MS } from '../lib/story-wheel-input';

/** Scrolling stays native. A single interruptible tween settles after release. */
export function useStoryScroll(story: RefObject<HTMLElement | null>, workspace: boolean) {
  const [progress, setProgress] = useState(0);
  const navigateRef = useRef<(stop: number) => void>(() => undefined);
  const goToStop = useCallback((stop: number) => navigateRef.current(stop), []);

  useLayoutEffect(() => {
    const element = story.current;
    if (workspace || !element) return;
    const media = gsap.matchMedia();

    media.add({ all: 'all', reduced: '(prefers-reduced-motion: reduce)' }, (context) => {
      const reduced = !!context.conditions?.reduced;
      const lastAnchor = element.querySelector<HTMLElement>('[data-story-stop="1"]');
      let storyStart = element.offsetTop;
      let storyDistance = lastAnchor?.offsetTop || 1;
      const read = () => clamp((window.scrollY - storyStart) / storyDistance);
      const state = createStoryScrollState(read());
      const wheelInput = createStoryWheelInput();
      let tween: gsap.core.Tween | null = null;
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      let held = false;
      let touchActive = false;
      let lastScroll = window.scrollY;
      let source: 'wheel' | 'touch' | 'keyboard' | 'other' = 'other';
      let settling = false;
      let cancelableWheelTail = true;
      const heldKeys = new Set<string>();

      function cancelMotion() {
        clearTimeout(idleTimer);
        tween?.kill();
        tween = null;
        settling = false;
      }
      function write(value: number) {
        window.scrollTo({ top: Math.round(storyStart + value * storyDistance), behavior: 'instant' });
        lastScroll = window.scrollY;
        setProgress(state.render(read()));
      }
      function animate(destination: number) {
        cancelMotion();
        settling = true;
        if (reduced || Math.abs(destination - state.progress) * storyDistance < 1) {
          write(destination);
          return;
        }
        const position = { progress: state.progress };
        tween = gsap.to(position, {
          progress: destination,
          duration: storyTransitionDuration(state.progress, destination),
          ease: 'sine.inOut',
          onUpdate: () => write(position.progress),
          onComplete: () => { tween = null; },
        });
      }
      function scheduleSettle(delay = SCROLL_IDLE_MS) {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          idleTimer = undefined;
          if (!held && heldKeys.size === 0) {
            // Inertia may have moved us since the final active input.
            setProgress(state.render(read()));
            animate(state.settle());
          }
        }, delay);
      }
      function onNativeScroll() {
        if (Math.abs(window.scrollY - lastScroll) < 1) return;
        lastScroll = window.scrollY;
        // Native scrolling can resume after a settle starts. Yield to it.
        const interrupted = settling;
        if (interrupted) cancelMotion();
        // No corrective scroll write, anchor cap, or per-gesture distance limit.
        // A single continuous gesture can traverse the entire story.
        setProgress(state.native(read()));
        // Touch scroll events include the native fling after the finger lifts.
        if ((interrupted || source === 'other' || source === 'touch') && !held) scheduleSettle();
      }
      const onResize = () => {
        const nextStart = element.offsetTop;
        const nextDistance = lastAnchor?.offsetTop || 1;
        // The mobile browser toolbar can resize the viewport during a swipe.
        if (nextStart === storyStart && nextDistance === storyDistance) return;
        storyStart = nextStart;
        storyDistance = nextDistance;
        if (held || source === 'touch') {
          cancelMotion();
          setProgress(state.render(read()));
          if (!held) scheduleSettle();
          return;
        }
        const visible = state.progress;
        cancelMotion();
        write(visible);
        scheduleSettle();
      };
      function ownsInput(target: EventTarget | null) {
        return target instanceof Element && !target.closest('input, textarea, select, [contenteditable="true"], dialog[open], [role="dialog"]');
      }
      function onWheel(event: WheelEvent) {
        if (event.ctrlKey || !ownsInput(event.target) || !event.deltaY) return;
        if (source !== 'wheel') wheelInput.reset();
        source = 'wheel';
        const input = wheelInput.sample({
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          time: performance.now(),
          momentum: (event as WheelEvent & { momentum?: boolean }).momentum,
        });
        if (input.momentum) {
          if (!event.cancelable) cancelableWheelTail = false;
          if (settling) {
            if (event.cancelable) event.preventDefault();
            else {
              // Some browsers cannot cancel a tail. Let it finish rather than lock input.
              cancelMotion();
              scheduleSettle();
            }
          } else scheduleSettle(cancelableWheelTail ? input.delay : SCROLL_IDLE_MS);
          return;
        }
        cancelableWheelTail = event.cancelable;
        if (!touchActive) held = false;
        cancelMotion();
        setProgress(state.render(read()));
        state.intent(event.deltaY);
        scheduleSettle();
      }
      function onTouchStart(event: TouchEvent) {
        if (!ownsInput(event.target)) return;
        source = 'touch';
        touchActive = held = true;
        cancelMotion();
      }
      function onTouchMove() {
        if (touchActive) cancelMotion();
      }
      function release() {
        touchActive = held = false;
        heldKeys.clear();
        scheduleSettle();
      }
      function onTouchEnd(event: TouchEvent) {
        if (touchActive && event.touches.length === 0) release();
      }
      function onKey(event: KeyboardEvent) {
        if (!ownsInput(event.target) || event.altKey || event.ctrlKey || event.metaKey || (event.key === ' ' && event.target instanceof Element && event.target.closest('button, a'))) return;
        const direction = ['ArrowDown', 'PageDown', 'End'].includes(event.key) || event.key === ' ' && !event.shiftKey ? 1
          : ['ArrowUp', 'PageUp', 'Home'].includes(event.key) || event.key === ' ' && event.shiftKey ? -1 : 0;
        if (!direction) return;
        source = 'keyboard';
        heldKeys.add(event.code || event.key);
        held = false;
        cancelMotion();
        state.intent(direction);
      }
      function onKeyUp(event: KeyboardEvent) {
        if (heldKeys.delete(event.code || event.key) && heldKeys.size === 0) scheduleSettle();
      }
      function onPointerDown(event: PointerEvent) {
        if (event.pointerType === 'touch' || event.target !== document.documentElement) return;
        source = 'other';
        held = true;
        cancelMotion();
      }
      function onPointerUp() { if (held && !touchActive) release(); }

      setProgress(state.progress);
      navigateRef.current = animate;
      window.addEventListener('scroll', onNativeScroll, { passive: true });
      window.addEventListener('resize', onResize);
      // Only an identified momentum tail is canceled, after settling has taken over.
      window.addEventListener('wheel', onWheel, { passive: false, capture: true });
      window.addEventListener('touchstart', onTouchStart, { passive: true });
      window.addEventListener('touchmove', onTouchMove, { passive: true });
      window.addEventListener('touchend', onTouchEnd);
      window.addEventListener('touchcancel', onTouchEnd);
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointerup', onPointerUp, true);
      window.addEventListener('pointercancel', onPointerUp, true);
      window.addEventListener('blur', release);

      return () => {
        cancelMotion();
        navigateRef.current = () => undefined;
        window.removeEventListener('scroll', onNativeScroll);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('wheel', onWheel, true);
        window.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchcancel', onTouchEnd);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp, true);
        window.removeEventListener('pointercancel', onPointerUp, true);
        window.removeEventListener('blur', release);
      };
    });

    return () => media.revert();
  }, [story, workspace]);

  return { progress, goToStop };
}
