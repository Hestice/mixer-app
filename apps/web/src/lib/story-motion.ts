/** Resting positions occur only after each scene has fully unfolded. */
export const STORY_STOPS = [0, .27, .50, .70, 1] as const;
export const clamp = (value: number) => Math.min(1, Math.max(0, value));
export const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;
export function segment(progress: number, start: number, end: number) {
  const t = clamp((progress - start) / (end - start));
  return t * t * (3 - 2 * t);
}

export function layerReveal(id: string, progress: number) {
  if (id === 'guitar') return segment(progress, .08, .25);
  if (id === 'keys') return segment(progress, .30, .44);
  if (id === 'rhythm') return segment(progress, .36, .50);
  return segment(progress, .30, .50);
}

export function storyGeometry(progress: number, width: number, viewportHeight: number, layerCount: number, reducedMotion = false) {
  const mobile = width < 600;
  const short = viewportHeight <= 740;
  const settle = (value: number) => reducedMotion ? Number(value >= .5) : value;
  const unfold = settle(segment(progress, .08, .25));
  const build = settle(segment(progress, .30, .50));
  const open = settle(segment(progress, .51, .67));
  const pad = mobile ? 16 : 28;
  const fullDisc = mobile ? short ? 104 : 142 : Math.min(215, Math.max(130, (viewportHeight - 400) * .44));
  const introDisc = mobile ? short ? 180 : 220 : Math.min(270, Math.max(220, viewportHeight - 420));
  const middleDisc = mobile ? short ? Math.max(104, 138 - Math.max(0, layerCount - 3) * 34) : 190 : fullDisc;
  const disc = lerp(lerp(introDisc, middleDisc, unfold), fullDisc, open);
  const introWidth = Math.min(width, 390);
  const middleWidth = Math.min(width, 680);
  const shellWidth = lerp(lerp(introWidth, middleWidth, unfold), width, open);
  const shellX = (width - shellWidth) / 2;
  const slot = (width - pad * 2 - (mobile ? 20 : 64)) / 2;
  const middleSongWidth = mobile ? middleWidth - pad * 2 : middleDisc;
  const songWidth = lerp(lerp(introWidth - pad * 2, middleSongWidth, unfold), slot, open);
  const songX = lerp(lerp((width - introWidth) / 2 + pad, (width - middleWidth) / 2 + pad, unfold), pad, open);
  const songY = pad;
  const heading = mobile ? short ? 26 : 42 : 31;
  const readout = mobile ? short ? 24 : 34 : 30;
  const rowHeight = mobile ? short ? 32 : 37 : viewportHeight <= 800 ? 36 : 44;
  const layerTitle = 24;
  const layerHeight = layerTitle + Math.max(1, layerCount) * rowHeight;
  const middleLayerWidth = mobile ? middleWidth - pad * 2 : middleWidth - middleDisc - pad * 2 - 32;
  const middleLayerX = mobile ? pad : (width - middleWidth) / 2 + pad + middleDisc + 32;
  const middleLayerY = mobile ? pad + heading + middleDisc + readout + 14 : pad + heading + middleDisc / 2 - lerp(rowHeight / 2, rowHeight * layerCount / 2, build) - layerTitle;
  const fullLayerY = pad + heading + fullDisc + readout + 14;
  const layersX = lerp(middleLayerX, pad, open);
  const layersY = lerp(middleLayerY, fullLayerY, open);
  const layersWidth = lerp(middleLayerWidth, slot, open);
  const introHeight = pad * 2 + heading + introDisc + readout;
  const middleHeight = mobile ? middleLayerY + layerTitle + rowHeight * lerp(1, layerCount, build) + pad : pad * 2 + heading + middleDisc + readout;
  const fullHeight = Math.max(fullLayerY + layerHeight + pad, pad + heading + fullDisc + (mobile ? 170 : 170) + pad);
  const height = lerp(lerp(introHeight, middleHeight, unfold), fullHeight, open);
  return { mobile, short, unfold, build, open, disc, height, shellWidth, shellX, songX, songY, songWidth, layersX, layersY, layersWidth, rowHeight, trialX: width - pad - slot, trialY: pad, trialWidth: slot };
}

// Coordinates in the tonearm SVG's 100 × 100 record space.
export const TONEARM = { pivotX: 96, pivotY: 4, length: 62, restAngle: -12, playAngle: 10 };
export function stylusPosition(angle: number) {
  const radians = angle * Math.PI / 180;
  return { x: TONEARM.pivotX - Math.sin(radians) * TONEARM.length, y: TONEARM.pivotY + Math.cos(radians) * TONEARM.length };
}
