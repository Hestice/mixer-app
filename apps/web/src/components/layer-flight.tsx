import { useLayoutEffect, useRef } from 'react';
import { Waveform } from './waveform';
import type { Layer } from '../lib/session';

export interface Flight { layer: Layer; from: { x: number; y: number }; }
export function LayerFlight({ flight, finish }: { flight: Flight; finish: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const ghost = ref.current;
    const target = document.querySelector<HTMLElement>(`[data-layer-id="${flight.layer.id}"]`);
    if (!ghost || !target) { finish(); return; }
    const rect = target.getBoundingClientRect();
    ghost.style.left = `${rect.left}px`; ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`; ghost.style.height = `${rect.height}px`;
    const dx = flight.from.x - rect.left - rect.width / 2;
    const dy = flight.from.y - rect.top - rect.height / 2;
    const animation = ghost.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(.42) rotate(-10deg)`, opacity: .7 },
      { transform: `translate(${dx * .5}px, ${dy * .4 - 45}px) scale(.92) rotate(-4deg)`, opacity: 1, offset: .5 },
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: 950, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' });
    animation.onfinish = finish;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', finish, { once: true });
    // Keep the committed layer visible if the destination moves during the flight.
    window.addEventListener('resize', finish, { once: true });
    window.addEventListener('scroll', finish, { once: true, passive: true });
    return () => { media.removeEventListener('change', finish); animation.onfinish = null; animation.cancel(); window.removeEventListener('resize', finish); window.removeEventListener('scroll', finish); };
  }, [flight, finish]);
  return <div className="layer-flight" ref={ref} aria-hidden="true"><span className={`layer-color ${flight.layer.kind}-color`} /><span className="layer-name">{flight.layer.name}</span><Waveform compact peaks={flight.layer.peaks} /><span className="flight-kept">On</span></div>;
}
