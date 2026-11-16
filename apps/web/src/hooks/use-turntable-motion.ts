import { gsap } from 'gsap';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TONEARM } from '../lib/story-motion';
import { SECONDS_PER_TURN, vinylAngle } from '../lib/turntable-position';

type SongClock = { position: number; readPosition: () => number; stopVersion: number };

export function useTurntableMotion(playing: boolean, clock?: SongClock) {
  const record = useRef<HTMLSpanElement>(null);
  const arm = useRef<SVGGElement>(null);
  const pose = useRef({ angle: TONEARM.restAngle });
  const resetTimeline = useRef<gsap.core.Timeline | null>(null);
  const clocked = !!clock;
  const stopVersion = clock?.stopVersion ?? 0;
  const lastStop = useRef(stopVersion);
  const [cueing, setCueing] = useState(false);
  const releaseCue = useRef<(() => void) | null>(null);
  const readPosition = clock?.readPosition;

  function cuePlayback() {
    return new Promise<void>(resolve => {
      releaseCue.current = resolve;
      setCueing(true);
    });
  }

  function closeCue() {
    releaseCue.current?.();
    releaseCue.current = null;
    setCueing(false);
  }

  useEffect(() => () => releaseCue.current?.(), []);

  useLayoutEffect(() => {
    const disc = record.current;
    const assembly = arm.current;
    if (!disc || !assembly) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const target = playing || cueing ? TONEARM.playAngle : TONEARM.restAngle;
    const position = pose.current;
    const drawArm = () => {
      assembly.style.transform = `rotate(${position.angle}deg)`;
      assembly.toggleAttribute('data-on-groove', position.angle === TONEARM.playAngle);
    };
    const requestedStop = lastStop.current !== stopVersion;
    const reset = requestedStop || !!resetTimeline.current;
    lastStop.current = stopVersion;
    const rotate = gsap.quickSetter(disc, 'rotation', 'deg');
    const followClock = () => {
      if (!motion.matches && !resetTimeline.current && position.angle === TONEARM.playAngle && readPosition) {
        rotate(vinylAngle(readPosition()));
      }
    };
    let timeline: gsap.core.Timeline | undefined;

    function update() {
      timeline?.kill();
      resetTimeline.current = null;
      if (motion.matches) {
        position.angle = target;
        drawArm();
        if (reset) rotate(0);
        releaseCue.current?.();
        return;
      }

      const angle = gsap.utils.wrap(0, 360, Number(gsap.getProperty(disc, 'rotation')));
      rotate(angle);
      drawArm();
      timeline = gsap.timeline();
      let nextAngle = position.angle;
      function moveArm(to: number) {
        const travel = Math.abs(to - nextAngle);
        const range = TONEARM.playAngle - TONEARM.restAngle;
        if (travel) timeline!.to(position, { angle: to, duration: .7 * travel / range, ease: 'power2.inOut', onUpdate: drawArm });
        nextAngle = to;
      }

      if (reset) {
        moveArm(TONEARM.restAngle);
        if (angle > 0) timeline.to(disc, { rotation: 0, duration: .22 + .33 * angle / 360, ease: 'power2.out' });
        resetTimeline.current = timeline;
        timeline.call(() => { resetTimeline.current = null; });
      }
      moveArm(target);
      if (cueing) timeline.call(() => releaseCue.current?.());
      if (playing && !clocked) timeline.to(disc, { rotation: angle + 360, duration: SECONDS_PER_TURN, ease: 'none', repeat: -1 });
    }

    update();
    if (playing && readPosition) gsap.ticker.add(followClock);
    motion.addEventListener('change', update);
    return () => {
      motion.removeEventListener('change', update);
      gsap.ticker.remove(followClock);
      timeline?.kill();
    };
  }, [playing, cueing, stopVersion, clocked, readPosition]);

  const cursor = clock?.position;
  useLayoutEffect(() => {
    const disc = record.current;
    if (!disc || cursor === undefined || playing || cueing) return;
    if (resetTimeline.current) {
      if (cursor === 0) return;
      resetTimeline.current.killTweensOf(disc);
      resetTimeline.current = null;
    }
    gsap.set(disc, { rotation: vinylAngle(cursor) });
  }, [cursor, playing, cueing, stopVersion]);

  return { record, arm, cueing, cuePlayback, closeCue };
}
