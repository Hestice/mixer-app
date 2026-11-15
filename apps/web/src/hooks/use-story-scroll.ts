import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { gsap } from 'gsap';
import { clamp, harmonyTravelTime } from '../lib/story-motion';
import { createStoryScrollState } from '../lib/story-scroll-state';

const INPUT_SECONDS = .24;
const SETTLE_SECONDS = 1.5;
const IDLE_MS = 550;

/** One tween owns both the scrollbar and the rendered story; input always wins. */
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
      const distance = () => element.querySelector<HTMLElement>('[data-story-stop="1"]')?.offsetTop || 1;
      const start = () => element.offsetTop;
      const read = () => clamp((window.scrollY - start()) / distance());
      const state = createStoryScrollState(read());
      let tween: gsap.core.Tween | null = null;
      let tweenDestination = state.progress;
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      let held = false;
      let touchY: number | null = null;
      let writtenScroll = window.scrollY;

      function cancelMotion() {
        clearTimeout(idleTimer);
        tween?.kill();
        tween = null;
      }
      function write(value: number) {
        writtenScroll = Math.round(start() + value * distance());
        window.scrollTo({ top: writtenScroll, behavior: 'instant' });
        writtenScroll = window.scrollY;
        setProgress(state.render(read()));
      }
      function animate(destination: number, settling: boolean) {
        cancelMotion();
        if (reduced || Math.abs(destination - state.progress) * distance() < 1) {
          write(destination);
          state.finish();
          return;
        }
        const position = { progress: state.progress };
        const travelTime = harmonyTravelTime(state.progress, destination);
        tweenDestination = destination;
        tween = gsap.to(position, {
          progress: destination,
          duration: (settling ? SETTLE_SECONDS : Math.min(.8, INPUT_SECONDS + Math.abs(destination - state.progress) * 2)) + travelTime,
          ease: settling || travelTime > 0 ? 'sine.inOut' : 'power1.out',
          onUpdate: () => write(position.progress),
          onComplete: () => { tween = null; state.finish(); },
        });
      }
      function scheduleSettle() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (held) return;
          const destination = state.settle();
          // A large gesture may already be travelling to the anchor. Let that
          // readable transfer finish instead of restarting its easing halfway.
          if (!tween || Math.abs(tweenDestination - destination) > .00001) animate(destination, true);
        }, IDLE_MS);
      }

      function onNativeScroll() {
        if (Math.abs(window.scrollY - writtenScroll) < 1) return;
        cancelMotion();
        const bounded = state.native(read(), performance.now());
        write(bounded);
        scheduleSettle();
      }
      function onResize() {
        // Keep the same visible story position and pending anchor when the
        // viewport changes, without a second library restoring old scroll data.
        const visible = state.progress;
        cancelMotion();
        write(visible);
        scheduleSettle();
      }
      setProgress(state.progress);
      window.addEventListener('scroll', onNativeScroll, { passive: true });
      window.addEventListener('resize', onResize);

      navigateRef.current = (stop) => animate(state.navigate(stop), true);

      function move(delta: number, fresh = false, native = false) {
        const destination = state.input(delta / distance(), performance.now(), fresh);
        // Non-cancelable events still declare intent; their native scroll is
        // bounded by the observer instead of adding the delta a second time.
        if (native) cancelMotion();
        else animate(destination, false);
        scheduleSettle();
      }
      function ownsInput(target: EventTarget | null) {
        return target instanceof Element && !target.closest('input, textarea, select, [contenteditable="true"], dialog[open]');
      }
      function onWheel(event: WheelEvent) {
        if (event.ctrlKey || !ownsInput(event.target) || !event.deltaY) return;
        if (touchY === null) held = false;
        if (event.cancelable) event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
        move(event.deltaY * unit, false, !event.cancelable);
      }
      function onTouchStart(event: TouchEvent) {
        touchY = event.touches.length === 1 && ownsInput(event.target) ? event.touches[0].clientY : null;
        if (touchY === null) return;
        held = true;
        cancelMotion();
        state.begin();
      }
      function onTouchMove(event: TouchEvent) {
        if (touchY === null || event.touches.length !== 1) return;
        const nextY = event.touches[0].clientY;
        if (event.cancelable) event.preventDefault();
        move(touchY - nextY, false, !event.cancelable);
        touchY = nextY;
      }
      function release() {
        held = false;
        touchY = null;
        scheduleSettle();
      }
      function onKey(event: KeyboardEvent) {
        if (!ownsInput(event.target) || event.altKey || event.ctrlKey || event.metaKey || (event.key === ' ' && event.target instanceof Element && event.target.closest('button, a'))) return;
        const delta = event.key === 'ArrowDown' ? 40 : event.key === 'ArrowUp' ? -40
          : event.key === 'PageDown' || event.key === ' ' && !event.shiftKey ? window.innerHeight
          : event.key === 'PageUp' || event.key === ' ' && event.shiftKey ? -window.innerHeight : 0;
        if (!delta) return;
        held = false;
        event.preventDefault();
        move(delta, !event.repeat);
      }
      function onPointerDown(event: PointerEvent) {
        if (event.target !== document.documentElement) return;
        held = true;
        cancelMotion();
        state.begin();
      }
      function onPointerUp() { if (held && touchY === null) release(); }
      window.addEventListener('wheel', onWheel, { passive: false, capture: true });
      window.addEventListener('touchstart', onTouchStart, { passive: true });
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', release);
      window.addEventListener('touchcancel', release);
      window.addEventListener('keydown', onKey);
      window.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointerup', onPointerUp, true);
      window.addEventListener('blur', release);
      window.addEventListener('pointercancel', onPointerUp, true);

      return () => {
        cancelMotion();
        window.removeEventListener('wheel', onWheel, true);
        window.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', release);
        window.removeEventListener('touchcancel', release);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp, true);
        window.removeEventListener('blur', release);
        window.removeEventListener('pointercancel', onPointerUp, true);
        navigateRef.current = () => undefined;
        window.removeEventListener('scroll', onNativeScroll);
        window.removeEventListener('resize', onResize);
      };
    });

    return () => media.revert();
  }, [story, workspace]);

  return { progress, goToStop };
}
