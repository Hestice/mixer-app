import { clamp } from './story-motion';
import { storySnapTarget } from './story-snap';

/** Native scrolling owns progress; only idle settling and navigation animate it. */
export function createStoryScrollState(initial: number) {
  let progress = clamp(initial);
  let direction = 0;

  return {
    get progress() { return progress; },
    render(value: number) {
      // Programmatic animation frames must not masquerade as fresh input.
      progress = clamp(value);
      return progress;
    },
    intent(value: number) { direction = Math.sign(value) || direction; },
    native(value: number) {
      const next = clamp(value);
      direction = Math.sign(next - progress) || direction;
      progress = next;
      return progress;
    },
    settle() { return storySnapTarget(progress, direction); },
  };
}
