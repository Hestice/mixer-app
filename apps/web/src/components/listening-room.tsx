'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Mic, X } from './icons';
import { useStudio } from '../hooks/use-studio';
import { chapterFromProgress, harmonyLayer, mixChapterFromProgress } from '../lib/session';
import { STORY_STOPS, CHAPTER_STOPS, layerReveal, tourBuildStage } from '../lib/story-motion';
import { Deck } from './deck';
import { LayerStrip } from './layer-strip';
import { RecordingConsole } from './recording-console';
import { useStoryMotion } from '../hooks/use-story-motion';
import { useStoryScroll } from '../hooks/use-story-scroll';

const chapters = [
  { label: 'Listen', title: 'Find your way back to music.', description: 'The platter turns the record. Press Play to set it in motion.', next: 'See what a layer is' },
  { label: 'One layer', title: 'Follow the sound out of the groove.', description: 'On vinyl, instruments are mixed together in the groove. Here, they unfold into separate audio layers.', next: 'Bring in other sounds' },
  { label: 'Build a song', title: 'Build the mix.', description: 'Keys join the guitar, then rhythm follows. Switch a layer off to hear what it adds to the mix.', next: 'Try a new layer' },
  { label: 'Try a layer', title: 'Try a part before you keep it.', description: 'Harmony joins on the right: a higher melody that fits the chords. Keep it or scroll to move it into your song, then add a part of your own.', next: 'Bring harmony into the song' },
  { label: 'Your turn', title: 'Now bring your own sound.', description: 'All four layers are in the song. Sing or play a part over them, or start with an empty song.', next: '' },
];

export function ListeningRoom() {
  const studio = useStudio();
  const storyRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [harmonyKeptManually, setHarmonyKeptManually] = useState(false);
  const [keepingHarmony, setKeepingHarmony] = useState(false);
  const finishKeepingHarmony = useCallback(() => setKeepingHarmony(false), []);
  const keptFocus = useRef<{ id: string; source: Element | null } | null>(null);
  const { progress, goToStop } = useStoryScroll(storyRef, studio.workspace);
  const chapter = chapterFromProgress(progress);
  const buildStage = tourBuildStage(progress);
  const mixChapter = mixChapterFromProgress(progress);
  const harmonyTransfer = layerReveal('harmony', progress);
  const transferringHarmony = keepingHarmony || (!harmonyKeptManually && harmonyTransfer > 0 && harmonyTransfer < 1);
  const [showParts, setShowParts] = useState(false);
  const [credits, setCredits] = useState(false);
  const creditsRef = useRef<HTMLDialogElement>(null);
  const harmonyKept = studio.layers.some((layer) => layer.id === 'harmony');
  const showRight = studio.workspace || chapter >= 3;
  useStoryMotion({ scene: sceneRef, progress, workspace: studio.workspace, layerCount: studio.layers.length, harmonyKeptManually, keepingHarmony, finishKeepingHarmony });
  const copy = chapters[chapter];
  const nextStop = STORY_STOPS.find((stop) => stop > progress + .001) ?? 1;
  const nextLabel = chapter === 2 && nextStop <= .50 ? nextStop === .40 ? 'Hear the keys' : 'Bring in rhythm' : copy.next;
  const applyTourScene = studio.applyTourScene;

  useLayoutEffect(() => {
    if (studio.workspace) return;
    setKeepingHarmony(false);
    keptFocus.current = null;
    setHarmonyKeptManually(false);
    applyTourScene(mixChapter, buildStage);
  }, [mixChapter, buildStage, studio.workspace, applyTourScene]);

  useEffect(() => {
    if (credits) creditsRef.current?.showModal();
    else creditsRef.current?.close();
  }, [credits]);


  useEffect(() => {
    const pending = keptFocus.current;
    if (keepingHarmony || !pending || !studio.layers.some((layer) => layer.id === pending.id)) return;
    keptFocus.current = null;
    // Follow the kept layer unless the user has already moved focus elsewhere.
    if (document.activeElement === document.body || document.activeElement === pending.source) {
      sceneRef.current?.querySelector<HTMLButtonElement>(`[data-layer-id="${pending.id}"] .layer-toggle`)?.focus({ preventScroll: true });
    }
  }, [keepingHarmony, studio.layers]);

  function keepLayer() {
    if (!studio.candidate || studio.locked || studio.busy || transferringHarmony) return;
    keptFocus.current = { id: studio.candidate.id, source: document.activeElement };
    setHarmonyKeptManually(true);
    setKeepingHarmony(!matchMedia('(prefers-reduced-motion: reduce)').matches);
    studio.keepCandidate();
  }

  function enter(demo: boolean) {
    if (studio.busy || studio.locked) return;
    studio.enterWorkspace(demo);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  if (studio.workspace) return <RecordingConsole studio={studio} />;

  return <>
    <a className="skip-link" href="#instrument">Skip to music controls</a>
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="Listening room home"><span className="brand-icon" aria-hidden="true"><i /><i /><i /><i /></span>listening room.</a>
      {!studio.workspace ? <nav className="tour-steps" aria-label="Story chapters">{chapters.map((item, index) => <button key={item.label} aria-label={`${index + 1}. ${item.label}`} aria-current={chapter === index ? 'step' : undefined} className={chapter === index ? 'current' : index < chapter ? 'visited' : ''} onClick={() => goToStop(CHAPTER_STOPS[index])}><span>{index + 1}</span><span>{item.label}</span></button>)}</nav> : <span className="session-label">Your recording session</span>}
      <a className="text-button landing-library-link" href="/songs">My songs</a>
    </header>

    <main className={`story ${studio.workspace ? 'workspace' : ''}`} ref={storyRef}>
      {!studio.workspace && STORY_STOPS.map((stop) => <div key={stop} className="story-anchor" data-story-stop={stop} aria-hidden="true" style={{ top: `calc(var(--story-travel) * ${stop})` }} />)}
      <div ref={sceneRef} className={`scene motion-tour chapter-${chapter} ${showRight ? 'two-decks' : 'one-deck'}`}>
        <div className="scene-copy">
          <div className="mobile-step">{studio.workspace ? 'Your session' : `${chapter + 1} of 5 / ${copy.label}`}</div>
          <h1>{copy.title}</h1>
          <p>{chapter === 0 && studio.playing ? 'The tonearm carries the stylus, the tiny needle that follows the groove.' : copy.description}</p>
        </div>

        <section className="instrument" id="instrument" aria-label="Music console">
          <div className="console-object">
            {!studio.workspace && <div className="console-shell" aria-hidden="true" />}
            <div className="song-side">
              <Deck side="left" studio={studio} chapter={chapter} showParts={showParts} />
              <div className="song-layers"><h2>Layers in your song</h2><LayerStrip studio={studio} advanced={false} pendingLayer={!harmonyKept ? harmonyLayer : undefined} /></div>
            </div>
            <>
              <div className="deck-separator" aria-hidden="true"><span>+</span></div>
              <div className="new-side">
                <Deck side="right" studio={studio} chapter={chapter} />
                {chapter === 3 && !studio.workspace && <div className="candidate-slot">
                  {transferringHarmony ? <p role="status">Harmony is moving into your song.</p> : harmonyKept ? <p className="transfer-confirmation" role="status">Added to your song <span>Look for Harmony on the left.</span></p> : <><div className="layer-identity"><span className="layer-color harmony-color" /><span>Harmony<small>High melody / new layer</small></span></div>{studio.candidate ? <div className="candidate-decision"><button className="button button-dark" onClick={keepLayer} disabled={studio.busy}>Keep in my song <ArrowRight size={16} /></button><button className="text-button" onClick={studio.discardDemoPreview}>Remove this layer</button></div> : <p>Listen on the record above.</p>}</>}
                </div>}
                {!studio.workspace && chapter === 4 && <div className="record-entry"><button className="button button-record" disabled={studio.busy} onClick={() => enter(true)}><Mic size={18} />Record over this song <ArrowRight size={16} /></button><button className="text-button" disabled={studio.busy} onClick={() => enter(false)}>Start with an empty song</button></div>}
              </div>
            </>
          </div>
        </section>

        {!studio.workspace && <div className="scene-note">
          {chapter === 0 && <button className="part-names-toggle" aria-pressed={showParts} onClick={() => setShowParts(!showParts)}>{showParts ? 'Hide part names' : 'Show part names'}</button>}
        </div>}
        {!studio.workspace && <footer className="tour-footer">
          <div className="tour-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
          <button className="credits-link" onClick={() => setCredits(true)}>After hours / Original demo</button>
          {chapter < 4 ? <button className="next-chapter" onClick={() => goToStop(nextStop)}><span>Scroll to continue</span><strong>{nextLabel}</strong><ArrowDown size={20} /></button> : <span className="tour-finish">The next layer is yours.</span>}
          <span className="chapter-count">{chapter + 1} / 5</span>
        </footer>}
      </div>
    </main>

    {studio.error && <div className="error-toast" role="alert"><span>{studio.error}</span><button onClick={() => studio.setError('')} aria-label="Dismiss message"><X size={18} /></button></div>}
    <dialog ref={creditsRef} className="credits-modal" onClose={() => setCredits(false)} aria-labelledby="credits-title"><button className="modal-close" onClick={() => setCredits(false)} aria-label="Close sound credits"><X size={20} /></button><h2 id="credits-title">After hours</h2><p>Original composition, D major, 84 BPM.</p><p>The guitar was recorded for this project. The keys, rhythm and harmony are synthesized.</p><h3>The turntable</h3><dl><dt>Platter</dt><dd>The rotating platform beneath the record.</dd><dt>Tonearm</dt><dd>The arm that holds the cartridge and stylus.</dd><dt>Stylus</dt><dd>The needle that follows the record groove.</dd><dt>Groove</dt><dd>The path in the vinyl that carries the recorded sound.</dd></dl><p>Unfolding the instrument layers is how this app shows its mix; a real vinyl groove plays the mixed recording.</p><a className="text-button" href="https://www.audio-technica.co.jp/document/AT-LP2022/en/Content/Turntable/AT-LP2022/part-names/names-tonearm.html" target="_blank" rel="noreferrer">Turntable anatomy / Audio-Technica</a></dialog>
  </>;
}
