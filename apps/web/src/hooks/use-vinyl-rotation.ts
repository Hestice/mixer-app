import { gsap } from 'gsap';
import { useLayoutEffect, useRef } from 'react';

export function useVinylRotation(playing?: boolean) {
  const grooves = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = grooves.current;
    if (playing === undefined || !node) return;

    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let tween: gsap.core.Tween | undefined;
    const update = () => {
      tween?.kill();
      if (motion.matches) {
        gsap.set(node, { rotation: 0 });
        return;
      }

      // Keep the current visual angle, dropping complete turns before rewinding.
      const angle = gsap.utils.wrap(0, 360, Number(gsap.getProperty(node, 'rotation')));
      gsap.set(node, { rotation: angle });
      tween = playing
        ? gsap.to(node, { rotation: angle + 360, duration: 16, ease: 'none', repeat: -1 })
        : gsap.to(node, { rotation: 0, duration: .22 + .33 * angle / 360, ease: 'power2.out' });
    };

    update();
    motion.addEventListener('change', update);
    return () => {
      motion.removeEventListener('change', update);
      tween?.kill();
    };
  }, [playing]);

  return grooves;
}
