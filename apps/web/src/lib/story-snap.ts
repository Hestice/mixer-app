import { clamp, STORY_STOPS } from './story-motion';

/** Anchors choose where scrolling settles; they never restrict active scrolling. */
export function storySnapTarget(progress: number, direction: number) {
  const position = clamp(progress);
  const resting = STORY_STOPS.find((stop) => Math.abs(stop - position) < .001);
  if (resting !== undefined) return resting;
  if (direction > 0) return STORY_STOPS.find((stop) => stop > position) ?? 1;
  if (direction < 0) return [...STORY_STOPS].reverse().find((stop) => stop < position) ?? 0;
  return STORY_STOPS.reduce((nearest, stop) => Math.abs(stop - position) < Math.abs(nearest - position) ? stop : nearest, 0 as number);
}
