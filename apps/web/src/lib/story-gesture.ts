import { clamp, STORY_STOPS } from './story-motion';

const STOP_TOLERANCE = .001;
const GESTURE_BREAK_MS = 180;

/** One input burst has one anchor; a new gesture never waits for its animation. */
export function createStoryGesture() {
  let target: number | null = null;
  let direction = 0;
  let lastInput = -Infinity;

  function constrain(progress: number) {
    return clamp(target === null ? progress : direction > 0 ? Math.min(progress, target) : Math.max(progress, target));
  }

  return {
    get target() { return target; },
    reset() { target = null; direction = 0; lastInput = -Infinity; },
    navigate(progress: number, stop: number) {
      target = stop;
      direction = Math.sign(stop - progress) || 1;
      lastInput = -Infinity;
    },
    constrain,
    move(progress: number, delta: number, now: number, fresh = false) {
      if (!delta) return constrain(progress);
      const nextDirection = Math.sign(delta);
      const newGesture = fresh || now - lastInput >= GESTURE_BREAK_MS;
      if (target === null || nextDirection !== direction || newGesture) {
        // Continuing in the same direction advances past the pending anchor,
        // even mid-transition. Reversing starts from the visible position.
        const origin = target !== null && newGesture && nextDirection === direction ? target : progress;
        target = nextDirection > 0
          ? STORY_STOPS.find((stop) => stop > origin + STOP_TOLERANCE) ?? 1
          : [...STORY_STOPS].reverse().find((stop) => stop < origin - STOP_TOLERANCE) ?? 0;
      }
      direction = nextDirection;
      lastInput = now;
      return constrain(progress + delta);
    },
  };
}
