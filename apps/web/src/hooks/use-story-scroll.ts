import { useLayoutEffect, useState, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { STORY_STOPS } from '../lib/story-motion';

/** One smoothed playhead drives the layout, copy, and chapter indicator together. */
export function useStoryScroll(story: RefObject<HTMLElement | null>, workspace: boolean) {
  const [progress, setProgress] = useState(0);

  useLayoutEffect(() => {
    const element = story.current;
    if (workspace || !element) return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();

    media.add({ all: 'all', reduced: '(prefers-reduced-motion: reduce)' }, (context) => {
      const reduced = !!context.conditions?.reduced;
      const playhead = { progress: 0 };
      const animation = gsap.to(playhead, {
        progress: 1,
        duration: 1,
        ease: 'none',
        paused: true,
        // Numeric scrub keeps moving after a scroll event, so render from the
        // animation rather than ScrollTrigger's raw scroll progress.
        onUpdate: () => setProgress(playhead.progress),
      });
      const trigger = ScrollTrigger.create({
        trigger: element,
        start: 'top top',
        end: () => `+=${element.querySelector<HTMLElement>('[data-story-stop="4"]')?.offsetTop || 1}`,
        animation,
        scrub: reduced ? true : .3,
        snap: {
          snapTo: [...STORY_STOPS],
          directional: false,
          inertia: false,
          delay: .4,
          duration: reduced ? .01 : { min: .65, max: 1.05 },
          ease: 'power2.inOut',
        },
        // Restore the correct scene after resize or a browser-restored scroll.
        onRefresh: (self) => animation.progress(self.progress),
      });

      return () => {
        trigger.kill();
        animation.kill();
      };
    });

    return () => media.revert();
  }, [story, workspace]);

  return progress;
}
