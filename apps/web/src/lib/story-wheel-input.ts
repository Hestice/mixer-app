export const SCROLL_IDLE_MS = 100;

type WheelSample = {
  deltaY: number;
  deltaMode: number;
  time: number;
  momentum?: boolean;
};

/** Prefer the browser's momentum flag; older browsers need a decay estimate. */
export function createStoryWheelInput() {
  let previous: WheelSample | undefined;
  let lastActive = 0;
  let declining = 0;
  let declineStart = 0;
  let peak = 0;
  let steady = 0;
  let momentum = false;

  function reset() {
    previous = undefined;
    declining = steady = 0;
    momentum = false;
  }

  return {
    reset,
    sample(input: WheelSample) {
      const magnitude = Math.abs(input.deltaY);
      const priorMagnitude = Math.abs(previous?.deltaY ?? 0);
      const fresh = !previous || input.time - previous.time > SCROLL_IDLE_MS
        || Math.sign(input.deltaY) !== Math.sign(previous.deltaY)
        || input.deltaMode !== previous.deltaMode;

      if (typeof input.momentum === 'boolean') {
        // A reported active event always wins, even when its delta is shrinking.
        momentum = input.momentum;
        if (!previous || !momentum) lastActive = input.time;
        declining = steady = 0;
      } else if (fresh || input.deltaMode !== 0
        || magnitude > priorMagnitude + Math.max(.5, priorMagnitude * .06)) {
        momentum = false;
        declining = steady = 0;
        lastActive = input.time;
      } else if (magnitude < priorMagnitude - Math.max(.1, priorMagnitude * .015)) {
        if (!declining) {
          declineStart = previous!.time;
          peak = priorMagnitude;
        }
        declining++;
        steady = 0;
        if (declining >= 3 && input.time - declineStart >= 32 && magnitude <= peak * .75) momentum = true;
        // Once decay is confirmed, count from its onset, not its latest event.
        lastActive = momentum ? declineStart : input.time;
      } else {
        steady++;
        // Sustained, low-speed input must regain control even without a spike.
        if (!momentum || steady >= 3) {
          momentum = false;
          declining = 0;
          lastActive = input.time;
        }
      }

      previous = input;
      return { momentum, delay: Math.max(0, lastActive + SCROLL_IDLE_MS - input.time) };
    },
  };
}
