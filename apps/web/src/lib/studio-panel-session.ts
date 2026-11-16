import type { StudioDeckControls } from '../hooks/use-studio-deck-controls';
import { panelPath, type StudioPanel } from './studio-layout';

export type StudioPanelSession = {
  panel: StudioPanel;
  subscribe: (listener: () => void) => () => void;
  read: () => StudioDeckControls | null;
  publish: (controls: StudioDeckControls | null) => void;
  redock: () => void;
};

type StudioWindow = Window & { studioPanelSessions?: Map<string, StudioPanelSession> };

export function registerPanelSession(id: string, panel: StudioPanel, initial: StudioDeckControls, redock: () => void) {
  let current: StudioDeckControls | null = initial;
  const listeners = new Set<() => void>();
  const session: StudioPanelSession = {
    panel,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    read: () => current,
    publish(controls) {
      current = controls;
      listeners.forEach(listener => listener());
    },
    redock,
  };
  const owner = window as StudioWindow;
  (owner.studioPanelSessions ??= new Map()).set(id, session);
  return session;
}

export function endPanelSession(id: string) {
  const sessions = (window as StudioWindow).studioPanelSessions;
  const session = sessions?.get(id);
  sessions?.delete(id);
  session?.publish(null);
}

export function readOpenerSession(id: string, panel: StudioPanel) {
  try {
    const owner = window.opener as StudioWindow | null;
    if (owner && !owner.closed && owner.location.origin === location.origin) {
      const session = owner.studioPanelSessions?.get(id);
      if (session?.panel === panel) return session;
    }
  } catch {
    // The opener may have navigated to a different site.
  }
  return null;
}

export function isPanelTab(tab: Window, id: string) {
  try {
    return !tab.closed && (tab.location.href === 'about:blank'
      || (tab.location.origin === location.origin && tab.location.pathname === panelPath && tab.location.hash === '#' + id));
  } catch {
    return false;
  }
}
