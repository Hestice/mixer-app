'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Mic, Volume2, X } from './icons';
import { useStudio } from '../hooks/use-studio';
import { chapterFromProgress } from '../lib/session';
import { STORY_STOPS } from '../lib/story-motion';
import { Deck } from './deck';
import { LayerStrip } from './layer-strip';
import { RecordingPanel } from './recording-panel';
import { useStoryMotion } from '../hooks/use-story-motion';
import { useStoryScroll } from '../hooks/use-story-scroll';
import { LayerFlight, type Flight } from './layer-flight';

const chapters = [
  { label: 'Listen', title: 'Find your way back to music.', description: 'The platter turns the record. Press Play to set it in motion.', next: 'See what a layer is' },
  { label: 'One layer', title: 'Follow the sound out of the groove.', description: 'On vinyl, instruments are mixed together in the groove. Here, they unfold into separate audio layers.', next: 'Bring in other sounds' },
  { label: 'Build a song', title: 'Build the mix.', description: 'A mix is the layers heard together. Bring in rhythm and keys with their switches.', next: 'Try a new layer' },
  { label: 'Try a layer', title: 'Try a part before you keep it.', description: 'Harmony is another layer: a higher melody that fits the chords. Try it on the right, then add it to your song.', next: 'Record a part of your own' },
  { label: 'Your turn', title: 'Now bring your own sound.', description: 'Sing or play a part over this song. Your recording becomes the next layer.', next: '' },
];

const recordingCopy = {
  idle: ['Your next layer starts here.', 'Use the microphone button to connect your input.'],
  requesting: ['Connect your microphone.', 'Allow microphone access in your browser to continue.'],
  ready: ['Ready when you are.', 'Use headphones. Press Record for a three-second count-in.'],
  countdown: ['Get ready.', 'Recording starts after the count-in.'],
  recording: ['Your part is recording.', 'Press Stop when you are finished.'],
  processing: ['Preparing your take.', ''],
  review: ['Hear what you just made.', 'Play your take on the right. Keep it to add it to the song on the left.'],
};

export function ListeningRoom() {
  const studio = useStudio();
  const storyRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const finishFlight = useCallback(() => setFlight(null), []);
  const keptFocus = useRef<{ id: string; source: Element | null } | null>(null);
  const progress = useStoryScroll(storyRef, studio.workspace);
  const chapter = chapterFromProgress(progress);
  const [showParts, setShowParts] = useState(false);
  const [mixOpen, setMixOpen] = useState(false);
  const [credits, setCredits] = useState(false);
  const creditsRef = useRef<HTMLDialogElement>(null);
  const harmonyKept = studio.layers.some((layer) => layer.id === 'harmony');
  const enabled = studio.layers.filter((layer) => layer.enabled);
  const showRight = studio.workspace || chapter >= 3;
  useStoryMotion({ scene: sceneRef, progress, workspace: studio.workspace, layerCount: studio.layers.length });
  const copy = chapters[chapter];
  const revisiting = chapter <= 1 && (!!studio.candidate || enabled.some((layer) => layer.id !== 'guitar'));
  const recording = recordingCopy[studio.recordingState];
  const status = studio.workspace ? '' : chapter === 0
    ? studio.playing ? `${enabled.map((layer) => layer.name).join(' + ') || 'All layers muted'}` : 'Sound starts when you press play.'
    : chapter === 1 ? (studio.layers[0]?.enabled ? 'Guitar is on. Switch it off to hear the difference.' : 'Guitar is off. Switch it back on.')
    : chapter === 2 ? `${enabled.length} of ${studio.layers.length} layers on${enabled.length > 1 ? '. Hear how they fit together.' : '. Try turning on Rhythm.'}`
    : chapter === 3 ? harmonyKept ? 'Harmony is now in your song, on the left.' : studio.candidate ? 'Still trying it? Turn it on and off before you keep it.' : 'The right record holds a new part to try.'
    : 'Your microphone captures the next part.';

  useEffect(() => {
    if (credits) creditsRef.current?.showModal();
    else creditsRef.current?.close();
  }, [credits]);

  function goTo(index: number) {
    const element = storyRef.current;
    if (!element) return;
    const anchor = element.querySelector<HTMLElement>(`[data-story-stop="${index}"]`);
    if (!anchor) return;
    window.scrollTo({ top: element.offsetTop + anchor.offsetTop, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  useEffect(() => {
    const pending = keptFocus.current;
    if (flight || !pending || !studio.layers.some((layer) => layer.id === pending.id)) return;
    keptFocus.current = null;
    // Follow the kept layer unless the user has already moved focus elsewhere.
    if (document.activeElement === document.body || document.activeElement === pending.source) {
      sceneRef.current?.querySelector<HTMLButtonElement>(`[data-layer-id="${pending.id}"] .layer-toggle`)?.focus({ preventScroll: true });
    }
  }, [flight, studio.layers]);

  function keepLayer() {
    if (!studio.candidate || studio.locked || studio.busy || flight) return;
    keptFocus.current = { id: studio.candidate.id, source: document.activeElement };
    const source = sceneRef.current?.querySelector('.deck-right .record-label')?.getBoundingClientRect();
    if (source && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFlight({ layer: studio.candidate, from: { x: source.left + source.width / 2, y: source.top + source.height / 2 } });
    }
    studio.keepCandidate();
  }

  function enter(demo: boolean) {
    if (studio.busy || studio.locked) return;
    studio.enterWorkspace(demo);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return <>
    <a className="skip-link" href="#instrument">Skip to music controls</a>
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="Listening room home"><span className="brand-icon" aria-hidden="true"><i /><i /><i /><i /></span>listening room.</a>
      {!studio.workspace ? <nav className="tour-steps" aria-label="Story chapters">{chapters.map((item, index) => <button key={item.label} aria-label={`${index + 1}. ${item.label}`} aria-current={chapter === index ? 'step' : undefined} className={chapter === index ? 'current' : index < chapter ? 'visited' : ''} onClick={() => goTo(index)}><span>{index + 1}</span><span>{item.label}</span></button>)}</nav> : <span className="session-label">Your recording session</span>}
    </header>

    <main className={`story ${studio.workspace ? 'workspace' : ''}`} ref={storyRef}>
      {!studio.workspace && STORY_STOPS.map((stop, index) => <div key={index} className="story-anchor" data-story-stop={index} aria-hidden="true" style={{ top: `calc((100% - 100svh) * ${stop})` }} />)}
      <div ref={sceneRef} className={`scene ${studio.workspace ? '' : 'motion-tour'} ${flight ? 'flight-active' : ''} chapter-${chapter} ${showRight ? 'two-decks' : 'one-deck'} ${studio.workspace ? 'workspace-scene' : ''}`}>
        <div className="scene-copy">
          <div className="mobile-step">{studio.workspace ? 'Your session' : `${chapter + 1} of 5 / ${copy.label}`}</div>
          <h1>{studio.workspace ? recording[0] : copy.title}</h1>
          <p>{studio.workspace ? recording[1] : revisiting ? chapter === 0 ? 'Your mix is still here. Scroll to unfold its layers again.' : 'Your mix is still here. Each sound is a layer you can turn on or off.' : chapter === 4 && studio.candidate ? 'Keep the harmony in your song or remove it before recording your own part.' : chapter === 0 && studio.playing ? 'The tonearm carries the stylus, the tiny needle that follows the groove.' : copy.description}</p>
        </div>

        <section className="instrument" id="instrument" aria-label="Music console">
          <div className="console-object">
            {!studio.workspace && <div className="console-shell" aria-hidden="true" />}
            <div className="song-side">
              <Deck side="left" studio={studio} chapter={chapter} showParts={showParts} />
              <div className="song-layers"><h2>Layers in your song</h2><LayerStrip studio={studio} chapter={chapter} advanced={mixOpen} arrivingId={flight?.layer.id} /></div>
            </div>
            <>
              <div className="deck-separator" aria-hidden="true"><span>+</span></div>
              <div className="new-side">
                <Deck side="right" studio={studio} chapter={chapter} />
                {(chapter <= 3 || studio.candidate) && !studio.workspace && <div className="candidate-slot">
                  {harmonyKept ? <p className="transfer-confirmation" role="status">Added to your song <span>Look for Harmony on the left.</span></p> : <><div className="layer-identity"><span className="layer-color harmony-color" /><span>Harmony<small>High melody / new layer</small></span></div>{studio.candidate ? <div className="candidate-decision"><button className="button button-dark" onClick={keepLayer} disabled={studio.busy || !!flight}>Keep in my song <ArrowRight size={16} /></button><button className="text-button" onClick={studio.discardDemoPreview}>Remove this layer</button></div> : <p>Listen on the record above.</p>}</>}
                </div>}
                {!studio.workspace && chapter === 4 && !studio.candidate && <div className="record-entry"><button className="button button-record" disabled={studio.busy} onClick={() => enter(true)}><Mic size={18} />Record over this song <ArrowRight size={16} /></button><button className="text-button" disabled={studio.busy} onClick={() => enter(false)}>Start with an empty song</button></div>}
                {studio.workspace && <RecordingPanel studio={studio} onKeep={keepLayer} />}
              </div>
            </>
          </div>
        </section>

        {!studio.workspace && <div className="scene-note">
          {chapter === 0 && <button className="part-names-toggle" aria-pressed={showParts} onClick={() => setShowParts(!showParts)}>{showParts ? 'Hide part names' : 'Show part names'}</button>}
          {chapter < 3 && studio.candidate && <button className="preview-return" onClick={() => goTo(3)}>{studio.candidate.name} is still in preview <ArrowRight size={13} /></button>}
        </div>}
        {!studio.workspace && (chapter === 1 || chapter === 2) && <p className="action-feedback" aria-live="polite">{revisiting ? 'Your song is unchanged as you explore the earlier chapters.' : chapter === 1 && !studio.playing ? 'Start playback on the record above.' : status}</p>}
        {studio.workspace && <div className="workspace-tools"><button className="text-button" aria-expanded={mixOpen} onClick={() => setMixOpen(!mixOpen)}>{mixOpen ? 'Hide mix controls' : 'Mix controls'}</button><span>Takes stay in this tab. Download before closing.</span></div>}
        {studio.workspace && mixOpen && <label className="master-volume"><Volume2 size={17} />Song volume<input type="range" min="0" max="1" step=".01" value={studio.volume} onChange={(event) => studio.setVolume(Number(event.target.value))} /></label>}
        {!studio.workspace && <footer className="tour-footer">
          <div className="tour-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
          <button className="credits-link" onClick={() => setCredits(true)}>After hours / Original demo</button>
          {chapter < 4 ? <button className="next-chapter" onClick={() => goTo(chapter + 1)}><span>Scroll to continue</span><strong>{copy.next}</strong><ArrowDown size={20} /></button> : <span className="tour-finish">The next layer is yours.</span>}
          <span className="chapter-count">{chapter + 1} / 5</span>
        </footer>}
      </div>
    </main>

    {flight && <LayerFlight flight={flight} finish={finishFlight} />}
    {studio.error && <div className="error-toast" role="alert"><span>{studio.error}</span><button onClick={() => studio.setError('')} aria-label="Dismiss message"><X size={18} /></button></div>}
    <dialog ref={creditsRef} className="credits-modal" onClose={() => setCredits(false)} aria-labelledby="credits-title"><button className="modal-close" onClick={() => setCredits(false)} aria-label="Close sound credits"><X size={20} /></button><h2 id="credits-title">After hours</h2><p>Original composition, D major, 84 BPM.</p><p>The guitar, keys, rhythm and harmony are synthesized for this project.</p><h3>The turntable</h3><dl><dt>Platter</dt><dd>The rotating platform beneath the record.</dd><dt>Tonearm</dt><dd>The arm that holds the cartridge and stylus.</dd><dt>Stylus</dt><dd>The needle that follows the record groove.</dd><dt>Groove</dt><dd>The path in the vinyl that carries the recorded sound.</dd></dl><p>Unfolding the instrument layers is how this app shows its mix; a real vinyl groove plays the mixed recording.</p><a className="text-button" href="https://www.audio-technica.co.jp/document/AT-LP2022/en/Content/Turntable/AT-LP2022/part-names/names-tonearm.html" target="_blank" rel="noreferrer">Turntable anatomy / Audio-Technica</a></dialog>
  </>;
}
