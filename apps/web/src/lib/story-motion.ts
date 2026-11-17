/** Resting positions occur only after each scene has fully unfolded. */
export const STORY_BOUNDARIES = [.2, .30, .6, .94] as const;
export const STORY_STOPS = [0, .27, .40, .50, .70, 1] as const;
export const CHAPTER_STOPS = [0, .27, .40, .70, 1] as const;
export const clamp = (value: number) => Math.min(1, Math.max(0, value));
export const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;
export function segment(progress: number, start: number, end: number) {
  const t = clamp((progress - start) / (end - start));
  return t * t * (3 - 2 * t);
}

export function layerReveal(id: string, progress: number) {
  if (id === 'guitar') return segment(progress, .08, .25);
  if (id === 'keys') return segment(progress, .30, .39);
  if (id === 'rhythm') return segment(progress, .41, .50);
  if (id === 'harmony') return segment(progress, .72, .90);
  return segment(progress, .30, .50);
}

/** Sound joins when each card reaches its slot, using the same scroll timing. */
export function tourBuildStage(progress: number): 0 | 1 | 2 {
  if (layerReveal('rhythm', progress) >= .97) return 2;
  if (layerReveal('keys', progress) >= .97) return 1;
  return 0;
}

export function storyGeometry(progress: number, width: number, viewportHeight: number, layerCount: number, reducedMotion = false, heightBudget = Infinity) {
  const mobile = width < 600;
  const short = viewportHeight <= 780;
  const compact = mobile && viewportHeight <= 620;
  const veryShort = compact && viewportHeight <= 560;
  const settle = (value: number) => reducedMotion ? Number(value >= .5) : value;
  const unfold = settle(segment(progress, .08, .25));
  const build = settle(segment(progress, .30, .50));
  const open = settle(segment(progress, .51, .67));
  const pad = compact ? 10 : mobile ? 16 : 28;
  const heading = mobile ? short ? 26 : 42 : 31;
  const readout = mobile ? compact ? 18 : short ? 24 : 34 : 30;
  const rowHeight = mobile ? compact ? 26 : short ? 32 : 37 : viewportHeight <= 800 ? 36 : 44;
  const layerTitle = compact ? 20 : 24;
  const layerGap = compact ? 6 : 14;
  const layerHeight = layerTitle + Math.max(1, layerCount) * rowHeight;
  const builtLayers = 1 + layerReveal('keys', progress) + layerReveal('rhythm', progress);
  const middleRows = rowHeight * Math.min(layerCount, Math.max(builtLayers, lerp(1, layerCount, build)));
  const deckChrome = pad * 2 + heading;
  const trialControls = compact ? 148 : 170;
  const fullChrome = deckChrome + Math.max(readout + layerGap + layerHeight, trialControls);
  const middleChrome = deckChrome + readout + (mobile ? layerGap + layerTitle + middleRows : 0);
  const fitDisc = (preferred: number, chrome: number, min: number) => Math.max(min, Math.min(preferred, heightBudget - chrome));
  const fullDisc = fitDisc(mobile ? short ? 104 : 142 : Math.min(215, Math.max(130, (viewportHeight - 400) * .44)), fullChrome, veryShort ? 62 : compact ? 80 : 94);
  const introDisc = fitDisc(mobile ? short ? 180 : 220 : Math.min(270, Math.max(220, viewportHeight - 420)), deckChrome + readout, 128);
  const middleDisc = mobile ? fitDisc(short ? Math.max(104, 138 - Math.max(0, layerCount - 3) * 34) : 190, middleChrome, veryShort ? 80 : 100) : fullDisc;
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
  const middleLayerWidth = mobile ? middleWidth - pad * 2 : middleWidth - middleDisc - pad * 2 - 32;
  const middleLayerX = mobile ? pad : (width - middleWidth) / 2 + pad + middleDisc + 32;
  const middleLayerY = mobile ? pad + heading + middleDisc + readout + layerGap : Math.max(pad, pad + heading + (middleDisc - middleRows) / 2 - layerTitle);
  const fullLayerY = pad + heading + fullDisc + readout + layerGap;
  const layersX = lerp(middleLayerX, pad, open);
  const layersY = lerp(middleLayerY, fullLayerY, open);
  const layersWidth = lerp(middleLayerWidth, slot, open);
  const introHeight = deckChrome + introDisc + readout;
  const middleHeight = middleChrome + middleDisc;
  const fullHeight = fullChrome + fullDisc;
  const height = lerp(lerp(introHeight, middleHeight, unfold), fullHeight, open);
  return { mobile, short, unfold, build, open, disc, height, shellWidth, shellX, songX, songY, songWidth, layersX, layersY, layersWidth, layerTitle, rowHeight, trialX: width - pad - slot, trialY: pad, trialWidth: slot };
}

// Coordinates in the tonearm SVG's 100 × 100 record space.
export const TONEARM = { pivotX: 96, pivotY: 4, length: 62, restAngle: -12, playAngle: 10 };
export function stylusPosition(angle: number) {
  const radians = angle * Math.PI / 180;
  return { x: TONEARM.pivotX - Math.sin(radians) * TONEARM.length, y: TONEARM.pivotY + Math.cos(radians) * TONEARM.length };
}


/** Scale settling time by the fraction remaining between adjacent anchors. */
export function storyTransitionDuration(from: number, to: number) {
  const start = Math.min(clamp(from), clamp(to));
  const end = Math.max(clamp(from), clamp(to));
  let seconds = 0;
  let longestTransition = 0;
  for (let index = 1; index < STORY_STOPS.length; index++) {
    const left = STORY_STOPS[index - 1];
    const right = STORY_STOPS[index];
    const overlap = Math.max(0, Math.min(end, right) - Math.max(start, left));
    if (!overlap) continue;
    const fullDuration = index === STORY_STOPS.length - 1 ? 2 : 1.5;
    seconds += overlap / (right - left) * fullDuration;
    longestTransition = Math.max(longestTransition, fullDuration);
  }
  // Chapter navigation can skip anchors without accumulating a long animation.
  return Math.min(seconds, longestTransition);
}
