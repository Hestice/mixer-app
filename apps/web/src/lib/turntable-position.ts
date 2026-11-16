export const SECONDS_PER_TURN = 16;

export function vinylAngle(position: number) {
  return position % SECONDS_PER_TURN * 360 / SECONDS_PER_TURN;
}

export function secondsForRotation(from: number, to: number) {
  const delta = (to - from + 540) % 360 - 180;
  return delta * SECONDS_PER_TURN / 360;
}
