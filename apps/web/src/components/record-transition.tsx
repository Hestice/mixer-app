'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { RecordArt } from '../lib/record-art';
import { RecordDisc } from './record-artwork';

type Flight = { key: number; direction: 'studio' | 'songs'; songId: string; artwork?: RecordArt; from: DOMRect };
const EXIT_MS = 460;
const GROW_MS = 360;
const DOCK_MS = 440;
const SETTLE_MS = 540;
const easing = 'cubic-bezier(.22,.74,.25,1)';
const motionAllowed = () => !matchMedia('(prefers-reduced-motion: reduce)').matches && typeof Element.prototype.animate === 'function';

function discIn(element: Element | null) { return element?.querySelector<HTMLElement>('.custom-vinyl'); }
function sleeveFor(songId: string) { return document.querySelector<HTMLElement>(`[data-song-sleeve="${CSS.escape(songId)}"]`); }
function studioDisc(songId: string) { return discIn(document.querySelector(`[data-studio-record="${CSS.escape(songId)}"]`)); }
function usable(rect?: DOMRect): rect is DOMRect { return !!rect && rect.width > 0 && rect.height > 0; }
function translate(x: number, y: number) { return `translate(${x}px, ${y}px)`; }
function growInPlace(from: DOMRect, size: number) {
  const inset = (size - from.width) / 2;
  return `${translate(from.left - inset, from.top - inset)} scale(${size / from.width})`;
}

function viewportRect(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) node.scrollIntoView({ block: 'center', behavior: 'instant' });
  return node.getBoundingClientRect();
}

interface RecordNavigation {
  flight: Flight | null;
  enterStudio(resolveSong: () => Promise<string>, sleeve?: HTMLElement | null, artwork?: RecordArt): Promise<void>;
  returnToSongs(songId: string, artwork?: RecordArt): void;
  arrive(direction: Flight['direction'], songId?: string): void;
  finish(): void;
  rememberArtwork(songId: string, artwork?: RecordArt): void;
}
const Context = createContext<RecordNavigation | null>(null);
export const useRecordNavigation = () => useContext(Context)!;

export function RecordTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [flight, setFlight] = useState<Flight | null>(null);
  const flightRef = useRef<Flight | null>(null);
  const flightKey = useRef(0);
  const overlay = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  const stagedDesk = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const landing = useRef(false);
  // Only a studio entered from the collection uses browser Back for My songs.
  const studioArtwork = useRef<{ songId: string; artwork?: RecordArt } | null>(null);
  const enteredFromList = useRef<{ songId: string; artwork?: RecordArt } | null>(null);

  const finish = useCallback(() => {
    flightRef.current = null;
    landing.current = false;
    clearTimeout(timer.current);
    if (overlay.current) overlay.current.style.visibility = 'hidden';
    for (const animation of animations.current) animation.cancel();
    animations.current = [];
    if (stagedDesk.current) {
      stagedDesk.current.inert = false;
      stagedDesk.current.dataset.recordDocking = 'seated';
    }
    setFlight(null);
  }, []);

  const animate = useCallback((node: HTMLElement, frames: Keyframe[], duration: number) => {
    const animation = node.animate(frames, { duration, easing, fill: 'forwards' });
    animations.current.push(animation);
    return animation;
  }, []);

  const begin = useCallback((next: Flight) => {
    finish();
    flightRef.current = next;
    setFlight(next);
  }, [finish]);

  async function enterStudio(resolveSong: () => Promise<string>, sleeve?: HTMLElement | null, artwork?: RecordArt) {
    const collection = sleeve?.closest<HTMLElement>('[data-song-collection]');
    const from = discIn(sleeve?.parentElement ?? null)?.getBoundingClientRect();
    const next: Flight | null = motionAllowed() && collection && usable(from)
      ? { key: ++flightKey.current, direction: 'studio', songId: '', artwork, from }
      : null;

    try {
      let openSleeve = Promise.resolve(true);
      if (next && collection && sleeve) {
        const covered = sleeve.getBoundingClientRect().right - next.from.left;
        const distance = Math.max(112, covered + 15);
        // Mount the copy before starting the sleeve and its matching mask on the same frame.
        flushSync(() => begin(next));
        const node = overlay.current!;
        const mask = (offset: number) => `inset(0 0 0 ${offset}px)`;
        const slide = animate(collection, [
          { transform: translate(0, 0), opacity: 1 },
          { offset: .38, opacity: 1 },
          { transform: translate(-distance, 0), opacity: 0 },
        ], EXIT_MS);
        const sleeveMask = animate(node, [{ clipPath: mask(covered) }, { clipPath: mask(covered - distance) }], EXIT_MS);
        openSleeve = slide.finished.then(async () => {
          if (flightRef.current !== next) return false;
          sleeveMask.cancel();
          const size = parseFloat(getComputedStyle(collection).getPropertyValue('--studio-vinyl-size'));
          const grown = growInPlace(next.from, size);
          const growth = animate(node, [
            { transform: translate(next.from.left, next.from.top) },
            { transform: grown },
          ], GROW_MS);
          await growth.finished;
          node.style.transform = grown;
          growth.cancel();
          return true;
        }).catch(() => false);
      }
      const [songId, opened] = await Promise.all([resolveSong(), openSleeve]);
      if (next && flightRef.current !== next) return;
      if (location.pathname !== '/songs') {
        if (next) finish();
        return;
      }
      enteredFromList.current = { songId, artwork };
      if (next && opened) {
        const ready = { ...next, songId };
        flightRef.current = ready;
        setFlight(ready);
        // A failed route must never leave the interface hidden.
        timer.current = setTimeout(finish, 6000);
      } else if (next) finish();
      router.push(`/studio?song=${encodeURIComponent(songId)}`, { scroll: !next || !opened });
    } catch (error) {
      if (next && flightRef.current === next) finish();
      throw error;
    }
  }

  const startReturn = useCallback((songId: string, artwork?: RecordArt) => {
    if (!motionAllowed()) return false;
    const node = overlay.current;
    const flyingIn = flightRef.current?.direction === 'studio' && node && node.style.visibility !== 'hidden';
    const from = (flyingIn ? node : studioDisc(songId))?.getBoundingClientRect();
    if (!usable(from) || from.bottom <= 0 || from.top >= window.innerHeight) return false;

    begin({ key: ++flightKey.current, direction: 'songs', songId, artwork, from });
    timer.current = setTimeout(finish, 6000);
    return true;
  }, [begin, finish]);

  function returnToSongs(songId: string, artwork?: RecordArt) {
    startReturn(songId, artwork);
    if (enteredFromList.current?.songId === songId) router.back();
    else router.push('/songs', { scroll: false });
  }

  useEffect(() => {
    const onBack = () => {
      if (location.pathname !== '/songs') {
        if (flightRef.current) finish();
        return;
      }
      if (flightRef.current?.direction === 'songs') return;
      const id = document.querySelector<HTMLElement>('[data-studio-record]')?.dataset.studioRecord;
      if (id && startReturn(id, studioArtwork.current?.songId === id ? studioArtwork.current.artwork : undefined)) return;
      if (flightRef.current) finish();
    };
    window.addEventListener('popstate', onBack);
    return () => { window.removeEventListener('popstate', onBack); clearTimeout(timer.current); };
  }, [finish, startReturn]);

  const landInStudio = useCallback(async (move: Flight, node: HTMLElement, destination: HTMLElement, desk: HTMLElement) => {
    const bounds = destination.getBoundingClientRect();
    if (!usable(bounds)) { finish(); return; }

    const x = move.from.left + move.from.width / 2 - bounds.left - bounds.width / 2;
    const y = move.from.top + move.from.height / 2 - bounds.top - bounds.height / 2;
    const docked = translate(x, y);
    node.style.transform = growInPlace(move.from, bounds.width);

    stagedDesk.current = desk;
    desk.inert = true;
    desk.dataset.recordDocking = 'true';
    await animate(desk, [
      { transform: translate(x + 84, y), opacity: 0 },
      { transform: docked, opacity: 1 },
    ], DOCK_MS).finished;
    if (flightRef.current !== move) return;

    // The platter and the floating disc now share the same bounds.
    desk.dataset.recordDocking = 'seated';
    node.style.visibility = 'hidden';
    await animate(desk, [{ transform: docked }, { transform: translate(0, 0) }], SETTLE_MS).finished;
    if (flightRef.current === move) finish();
  }, [animate, finish]);

  const arrive = useCallback((direction: Flight['direction'], songId?: string) => {
    const move = flightRef.current;
    const node = overlay.current;
    if (!move || move.direction !== direction || !node || landing.current || songId && songId !== move.songId) return;
    landing.current = true;

    if (direction === 'studio') {
      const destination = studioDisc(move.songId);
      const desk = destination?.closest<HTMLElement>('.studio-desk');
      if (!destination || !desk) { finish(); return; }
      void landInStudio(move, node, destination, desk).catch(() => { if (flightRef.current === move) finish(); });
      return;
    }

    const sleeve = sleeveFor(move.songId);
    const thumbnail = sleeve?.parentElement?.querySelector<HTMLElement>('.song-artwork-disc');
    if (!sleeve || !thumbnail) { finish(); return; }
    viewportRect(sleeve);
    const bounds = thumbnail.getBoundingClientRect();
    if (!usable(bounds)) { finish(); return; }

    // Take over with the row's own disc so the sleeve can cover it for the entire return.
    const from = `${translate(move.from.left - bounds.left, move.from.top - bounds.top)} scale(${move.from.width / bounds.width})`;
    const outside = translate(sleeve.getBoundingClientRect().right - bounds.left, 0);
    const glide = animate(thumbnail, [
      { transform: from, visibility: 'visible' },
      { transform: outside, visibility: 'visible' },
    ], 560);
    node.style.visibility = 'hidden';
    glide.onfinish = () => {
      if (flightRef.current !== move) return;
      animate(thumbnail, [
        { transform: outside, visibility: 'visible' },
        { transform: translate(0, 0), visibility: 'visible' },
      ], 340).onfinish = () => {
        if (flightRef.current === move) finish();
      };
    };
  }, [animate, finish, landInStudio]);

  // The overlay is mounted in the root layout, so the same disc survives route changes.
  const rememberArtwork = useCallback((songId: string, artwork?: RecordArt) => { studioArtwork.current = { songId, artwork }; }, []);
  const staging = flight?.direction === 'studio';
  useLayoutEffect(() => {
    if (staging || !stagedDesk.current) return;
    // Keep the seated record visible until React removes the stage's visibility rules.
    delete stagedDesk.current.dataset.recordDocking;
    stagedDesk.current = null;
  }, [staging]);
  return <Context.Provider value={{ flight, enterStudio, returnToSongs, arrive, finish, rememberArtwork }}>
    <div data-record-flight={flight?.direction}>
      {children}
      {flight && <div key={flight.key} ref={overlay} className="record-flight" data-direction={flight.direction} aria-hidden="true" style={{ width: flight.from.width, height: flight.from.height, transform: translate(flight.from.left, flight.from.top) }}><RecordDisc artwork={flight.artwork} /></div>}
    </div>
  </Context.Provider>;
}
