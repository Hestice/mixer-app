'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { RecordArt } from '../lib/record-art';
import { RecordDisc } from './record-artwork';

type Flight = { direction: 'studio' | 'songs'; songId: string; artwork?: RecordArt; from: DOMRect };
const FLIGHT_MS = 560;
const REVEAL_MS = 220;
const easing = 'cubic-bezier(.22,.74,.25,1)';
const motionAllowed = () => !matchMedia('(prefers-reduced-motion: reduce)').matches && typeof Element.prototype.animate === 'function';

function discIn(element: Element | null) { return element?.querySelector<HTMLElement>('.custom-vinyl'); }
function sleeveFor(songId: string) { return document.querySelector<HTMLElement>(`[data-song-sleeve="${CSS.escape(songId)}"]`); }
function studioDisc(songId: string) { return discIn(document.querySelector(`[data-studio-record="${CSS.escape(songId)}"]`)); }
function usable(rect?: DOMRect): rect is DOMRect { return !!rect && rect.width > 0 && rect.height > 0; }
function viewportRect(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) node.scrollIntoView({ block: 'center', behavior: 'instant' });
  return node.getBoundingClientRect();
}

interface RecordNavigation {
  flight: Flight | null;
  enterStudio(songId: string, from?: DOMRect, artwork?: RecordArt): void;
  returnToSongs(songId: string, artwork?: RecordArt): void;
  arrive(direction: Flight['direction'], songId?: string): void;
  finish(): void;
  rememberArtwork(songId: string, artwork?: RecordArt): void;
}
const Context = createContext<RecordNavigation | null>(null);
export const useRecordNavigation = () => useContext(Context)!;

export function RecordTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [flight, setFlight] = useState<Flight | null>(null);
  const [revealing, setRevealing] = useState(false);
  const flightRef = useRef<Flight | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const landing = useRef(false);
  // Only a studio entered from the collection uses browser Back for My songs.
  const studioArtwork = useRef<{ songId: string; artwork?: RecordArt } | null>(null);
  const enteredFromList = useRef<{ songId: string; artwork?: RecordArt } | null>(null);

  const finish = useCallback(() => {
    flightRef.current = null; landing.current = false;
    clearTimeout(timer.current);
    for (const animation of animations.current) animation.cancel();
    animations.current = [];
    setFlight(null); setRevealing(false);
  }, []);
  const begin = useCallback((next: Flight) => {
    finish(); flightRef.current = next; setFlight(next);
    // A blocked or interrupted route must never leave controls hidden.
    timer.current = setTimeout(finish, 6000);
  }, [finish]);

  function enterStudio(songId: string, from?: DOMRect, artwork?: RecordArt) {
    enteredFromList.current = { songId, artwork };
    if (motionAllowed() && usable(from)) begin({ direction: 'studio', songId, artwork, from });
    router.push(`/studio?song=${encodeURIComponent(songId)}`, { scroll: false });
  }
  const startReturn = useCallback((songId: string, artwork?: RecordArt) => {
    const disc = studioDisc(songId);
    if (motionAllowed() && disc) {
      const from = viewportRect(disc);
      if (usable(from)) begin({ direction: 'songs', songId, artwork, from });
    }
  }, [begin]);

  function returnToSongs(songId: string, artwork?: RecordArt) {
    startReturn(songId, artwork);
    if (enteredFromList.current?.songId === songId) router.back();
    else router.push('/songs', { scroll: false });
  }

  useEffect(() => {
    const onBack = () => {
      if (location.pathname !== '/songs' || flightRef.current?.direction === 'songs') return;
      const id = document.querySelector<HTMLElement>('[data-studio-record]')?.dataset.studioRecord;
      if (id) startReturn(id, studioArtwork.current?.songId === id ? studioArtwork.current.artwork : undefined);
    };
    window.addEventListener('popstate', onBack);
    return () => { window.removeEventListener('popstate', onBack); clearTimeout(timer.current); };
  }, [startReturn]);

  const arrive = useCallback((direction: Flight['direction'], songId?: string) => {
    const move = flightRef.current;
    const node = overlay.current;
    if (!move || move.direction !== direction || !node || landing.current || songId && songId !== move.songId) return;
    const sleeve = direction === 'songs' ? sleeveFor(move.songId) : null;
    const destination = direction === 'studio' ? studioDisc(move.songId) : sleeve;
    if (!destination) { finish(); return; }
    landing.current = true;
    const done = () => { if (flightRef.current === move) finish(); };
    if (direction === 'studio') window.scrollTo({ top: 0, behavior: 'instant' });
    else viewportRect(destination);
    const bounds = (sleeve?.parentElement ?? destination).getBoundingClientRect();
    const edge = sleeve?.offsetWidth ?? bounds.width;
    const size = direction === 'studio' ? bounds.width : edge * .96;
    if (!usable(bounds)) { finish(); return; }
    const left = bounds.left + (direction === 'songs' ? edge * .36 : 0);
    const top = bounds.top + (edge - size) / 2;
    const position = (x: number, y: number, scale: number, degrees: number) => `translate(${x}px, ${y}px) scale(${scale}) rotate(${degrees}deg)`;
    const placed = position(left, top, size / move.from.width, 0);
    const animation = node.animate([
      { transform: position(move.from.left, move.from.top, 1, 0) },
      { transform: placed },
    ], { duration: FLIGHT_MS, easing, fill: 'forwards' });
    animations.current.push(animation);
    const label = node.querySelector('.vinyl-label');
    if (label) animations.current.push(label.animate(
      [{ inset: direction === 'studio' ? '31%' : '24%' }, { inset: direction === 'studio' ? '24%' : '31%' }],
      { duration: FLIGHT_MS, easing, fill: 'forwards' },
    ));
    animation.onfinish = () => {
      if (flightRef.current !== move) return;
      if (direction === 'studio') {
        clearTimeout(timer.current);
        setRevealing(true); timer.current = setTimeout(done, REVEAL_MS + 20);
      } else {
        node.dataset.tucking = 'true';
        const tuck = node.animate([{ transform: placed }, { transform: position(bounds.left + edge * .02, top, size / move.from.width, -14) }], { duration: 340, easing, fill: 'forwards' });
        animations.current.push(tuck); tuck.onfinish = done;
      }
    };
  }, [finish]);

  // The overlay is mounted in the root layout, so the same disc survives route changes.
  const rememberArtwork = useCallback((songId: string, artwork?: RecordArt) => { studioArtwork.current = { songId, artwork }; }, []);
  const stage = flight?.direction === 'studio' && pathname === '/studio' ? revealing ? 'reveal' : 'landing' : undefined;
  const returnRow = flight?.direction === 'songs' ? flight.songId : undefined;
  return <Context.Provider value={{ flight, enterStudio, returnToSongs, arrive, finish, rememberArtwork }}>
    <div data-record-stage={stage} data-record-return={returnRow} data-record-flight={flight?.direction}>
      {children}
      {flight && <div key={flight.direction} ref={overlay} className="record-flight" data-direction={flight.direction} aria-hidden="true" style={{ width: flight.from.width, height: flight.from.height, transform: `translate(${flight.from.left}px, ${flight.from.top}px)` }}><RecordDisc artwork={flight.artwork} /></div>}
    </div>
  </Context.Provider>;
}
