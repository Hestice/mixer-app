'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { PanelTop } from 'lucide-react';
import { panelIcons, RecorderPanel, StudioFeedback, TimelinePanel, TurntablePanel } from '../../../components/studio-panel-content';
import { useStudioTransportShortcut } from '../../../hooks/use-studio-transport-shortcut';
import { isStudioPanel, panelNames } from '../../../lib/studio-layout';
import { readOpenerSession, type StudioPanelSession } from '../../../lib/studio-panel-session';
import '../../studio.css';

const readEmpty = () => null;
const subscribeEmpty = () => () => {};

export default function StudioPanelPage() {
  const [connected, setConnected] = useState<{ session: StudioPanelSession | null; song: string | null } | null>(null);
  const session = connected?.session;
  const deck = useSyncExternalStore(session?.subscribe ?? subscribeEmpty, session?.read ?? readEmpty, readEmpty);
  useStudioTransportShortcut(deck);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const panel = params.get('panel');
    const song = params.get('song');
    const id = location.hash.slice(1);
    if (!id || !isStudioPanel(panel)) { setConnected({ session: null, song }); return; }
    const session = readOpenerSession(id, panel);
    setConnected({ session, song });
    if (!session) return;
    const checkOwner = () => {
      if (!readOpenerSession(id, panel)) setConnected({ session: null, song });
    };
    const interval = window.setInterval(checkOwner, 500);
    window.addEventListener('focus', checkOwner);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkOwner);
    };
  }, []);

  useEffect(() => {
    if (session && deck) document.title = panelNames[session.panel] + ' · ' + deck.studio.title;
  }, [session, deck?.studio.title]);

  const advanceClock = deck?.studio.advanceClock;
  useEffect(() => {
    if (!advanceClock) return;
    const interval = window.setInterval(() => { if (!document.hidden) advanceClock(true); }, 40);
    return () => clearInterval(interval);
  }, [advanceClock]);

  if (!session || !deck || !deck.studio.localReady) {
    const href = connected?.song ? '/studio?song=' + encodeURIComponent(connected.song) : '/songs';
    return <div className="studio-app studio-workspace"><main className="studio-desk studio-loading">
      <h1>{connected ? 'This panel is disconnected' : 'Opening studio panel…'}</h1>
      {connected && <><p>Open the song in Studio to detach a panel again.</p><a className="button button-secondary" href={href}>Open Studio</a></>}
    </main></div>;
  }

  const { panel } = session;
  const Icon = panelIcons[panel];
  return <div className="studio-app studio-workspace studio-detached-workspace">
    <main className="studio-desk" aria-label={panelNames[panel]}>
      <header className="studio-detached-header">
        <Icon size={18} aria-hidden="true" />
        <div><h1>{panelNames[panel]}</h1><p>{deck.studio.title}</p></div>
        <button type="button" className="studio-toolbar-button" onClick={session.redock}><PanelTop size={16} aria-hidden="true" />Dock back</button>
      </header>
      <div className="studio-deck-panel" data-panel={panel} data-detached="true">
        {panel === 'turntable' ? <TurntablePanel deck={deck} /> : panel === 'timeline'
          ? <TimelinePanel deck={deck} detached /> : <RecorderPanel deck={deck} detached />}
      </div>
    </main>
    <StudioFeedback deck={deck} countIn={panel === 'recorder'} />
  </div>;
}
