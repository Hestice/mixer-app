import { clamp, STORY_STOPS } from './story-motion';
import { createStoryGesture } from './story-gesture';

type Motion = 'input' | 'settle' | 'navigation' | null;

/** Rendered position and input destination belong to the same motion controller. */
export function createStoryScrollState(initial: number) {
  const gesture = createStoryGesture();
  let progress = clamp(initial);
  let destination = progress;
  let motion: Motion = null;
  let direction = 0;
  let nextInputFresh = false;

  return {
    get progress() { return progress; },
    get destination() { return destination; },
    render(value: number) {
      progress = gesture.constrain(value);
      return progress;
    },
    input(delta: number, now: number, fresh = false) {
      fresh ||= nextInputFresh;
      nextInputFresh = false;
      // Accumulate a wheel burst, but interrupt settling or reverse from what
      // the user can actually see, never from an unfinished animation's end.
      const origin = !fresh && motion === 'input' && Math.sign(delta) === direction ? destination : progress;
      destination = gesture.move(origin, delta, now, fresh);
      direction = Math.sign(delta);
      motion = 'input';
      return destination;
    },
    native(value: number, now: number) {
      destination = gesture.move(progress, value - progress, now, nextInputFresh);
      progress = destination;
      nextInputFresh = false;
      motion = null;
      return progress;
    },
    settle() {
      destination = gesture.target ?? STORY_STOPS.reduce((nearest, stop) => Math.abs(stop - progress) < Math.abs(nearest - progress) ? stop : nearest, 0 as number);
      motion = 'settle';
      return destination;
    },
    navigate(stop: number) {
      gesture.navigate(progress, stop);
      destination = stop;
      motion = 'navigation';
      return destination;
    },
    finish() { motion = null; destination = progress; },
    begin() { nextInputFresh = true; motion = null; destination = progress; },
    restore(value: number) {
      gesture.reset();
      nextInputFresh = false;
      progress = destination = clamp(value);
      motion = null;
    },
  };
}
