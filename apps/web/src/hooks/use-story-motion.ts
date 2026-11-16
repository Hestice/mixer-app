import { useLayoutEffect, useRef, type RefObject } from 'react';
import { gsap } from 'gsap';
import { layerReveal, storyGeometry, clamp, segment, STORY_BOUNDARIES } from '../lib/story-motion';

interface Options {
  scene: RefObject<HTMLDivElement | null>;
  progress: number;
  workspace: boolean;
  layerCount: number;
  harmonyKeptManually: boolean;
  keepingHarmony: boolean;
  finishKeepingHarmony: () => void;
}

/** One persistent scene, projected along the scroll path rather than mounted per chapter. */
export function useStoryMotion(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const drawRef = useRef<() => void>(() => undefined);
  const manualReveal = useRef(0);

  useLayoutEffect(() => {
    if (options.workspace) return;
    const scene = options.scene.current;
    const canvas = scene?.querySelector<HTMLElement>('.console-object');
    const copy = scene?.querySelector<HTMLElement>('.scene-copy');
    const note = scene?.querySelector<HTMLElement>('.scene-note');
    const footer = scene?.querySelector<HTMLElement>('.tour-footer');
    if (!scene || !canvas || !copy || !note || !footer) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    function draw() {
      frame = 0;
      if (!scene || !canvas || !copy || !note || !footer) return;
      const { progress, layerCount, harmonyKeptManually, keepingHarmony } = latest.current;
      const style = getComputedStyle(scene);
      const heightBudget = scene.getBoundingClientRect().height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        - copy.getBoundingClientRect().height - note.getBoundingClientRect().height - footer.getBoundingClientRect().height;
      // Reserve the fourth slot while the second deck opens, so its landing
      // destination stays fixed throughout the harmony transfer.
      const rows = Math.max(layerCount, 3 + segment(progress, .51, .67));
      const g = storyGeometry(progress, canvas.clientWidth, window.innerHeight, rows, media.matches, heightBudget);
      const numbers: Record<string, number> = { 'console-height': g.height, 'shell-x': g.shellX, 'shell-width': g.shellWidth, 'song-x': g.songX, 'song-y': g.songY, 'song-width': g.songWidth, 'motion-disc': g.disc, 'layers-x': g.layersX, 'layers-y': g.layersY, 'layers-width': g.layersWidth, 'layer-title-height': g.layerTitle, 'row-height': g.rowHeight, 'trial-x': g.trialX, 'trial-y': g.trialY, 'trial-width': g.trialWidth };
      for (const [name, value] of Object.entries(numbers)) canvas.style.setProperty(`--${name}`, `${value.toFixed(3)}px`);
      canvas.style.setProperty('--unfold', String(g.unfold));
      canvas.style.setProperty('--open-deck', String(g.open));
      const right = canvas.querySelector<HTMLElement>('.new-side');
      if (right) {
        if (g.open < .96 && right.contains(document.activeElement)) canvas.querySelector<HTMLButtonElement>('.deck-left .platter')?.focus({ preventScroll: true });
        right.inert = g.open < .96; right.setAttribute('aria-hidden', String(g.open < .96)); }
      const panel = canvas.querySelector<HTMLElement>('.song-layers');
      if (panel) { panel.style.setProperty('--layer-heading-opacity', String(clamp((g.unfold - .75) / .25))); panel.inert = g.unfold < .97; panel.setAttribute('aria-hidden', String(g.unfold < .97)); }
      const disc = canvas.querySelector<HTMLElement>('.deck-left .platter')?.getBoundingClientRect();
      const previewDisc = canvas.querySelector<HTMLElement>('.deck-right .platter')?.getBoundingClientRect();
      const strip = canvas.querySelector<HTMLElement>('.layer-strip')?.getBoundingClientRect();
      if (disc && strip) {
        for (const row of canvas.querySelectorAll<HTMLElement>('[data-layer-id]')) {
          const harmony = row.dataset.layerId === 'harmony';
          let reveal = layerReveal(row.dataset.layerId!, progress);
          if (harmony && harmonyKeptManually) reveal = Math.max(reveal, keepingHarmony ? manualReveal.current : 1);
          if (media.matches) reveal = Number(reveal >= .5);
          if (harmony) row.toggleAttribute('data-revealing', reveal < 1);
          const destinationX = strip.left + row.offsetLeft + row.offsetWidth / 2;
          const destinationY = strip.top + row.offsetTop + row.offsetHeight / 2;
          const source = harmony && previewDisc ? previewDisc : disc;
          const dx = source.left + source.width / 2 - destinationX;
          const dy = source.top + source.height / 2 - destinationY;
          // Descend into the empty fourth-row space before crossing left,
          // keeping the moving card clear of the existing rhythm row.
          const x = harmony ? dx * (1 - reveal * reveal) : dx * (1 - reveal);
          const y = harmony ? dy * (1 - reveal) ** 3 : dy * (1 - reveal);
          const scale = harmony ? .84 + .16 * reveal : .32 + .68 * reveal;
          const rotation = harmony ? 0 : -12 * (1 - reveal);
          row.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scale.toFixed(3)}) rotate(${rotation.toFixed(2)}deg)`;
          row.style.opacity = String(clamp(reveal * (harmony ? 8 : 2.5)));
          row.inert = reveal < (harmony ? 1 : .97);
          row.setAttribute('aria-hidden', String(row.inert));
          if (row.inert && row.contains(document.activeElement)) canvas.querySelector<HTMLButtonElement>('.deck-left .platter')?.focus({ preventScroll: true });
        }
      }
      // Text changes at a fully faded midpoint, while the hardware continues moving.
      const distance = Math.min(...STORY_BOUNDARIES.map((point) => Math.abs(progress - point)));
      scene.style.setProperty('--story-copy-opacity', media.matches ? '1' : String(clamp(distance / .022)));
      scene.dataset.motionReady = 'true';
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(draw); }
    drawRef.current = draw;
    const observer = new ResizeObserver(schedule);
    for (const element of [scene, copy, note, footer]) observer.observe(element);
    window.addEventListener('resize', schedule);
    media.addEventListener('change', schedule);
    draw();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', schedule); media.removeEventListener('change', schedule); drawRef.current = () => undefined; };
  }, [options.workspace, options.scene]);

  const { keepingHarmony, finishKeepingHarmony } = options;
  useLayoutEffect(() => {
    if (!keepingHarmony) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    function finish() {
      manualReveal.current = 1;
      drawRef.current();
      finishKeepingHarmony();
    }
    if (media.matches) { finish(); return; }
    const animation = { progress: 0 };
    const tween = gsap.to(animation, {
      progress: 1,
      duration: 0.9,
      ease: 'sine.inOut',
      onUpdate: () => {
        manualReveal.current = animation.progress;
        drawRef.current();
      },
      onComplete: finish,
    });
    function onPreferenceChange() {
      if (media.matches) { tween.kill(); finish(); }
    }
    media.addEventListener('change', onPreferenceChange);
    return () => {
      tween.kill();
      manualReveal.current = 0;
      media.removeEventListener('change', onPreferenceChange);
    };
  }, [keepingHarmony, finishKeepingHarmony]);

  useLayoutEffect(() => { drawRef.current(); }, [options.progress, options.layerCount, options.harmonyKeptManually, keepingHarmony]);
}
