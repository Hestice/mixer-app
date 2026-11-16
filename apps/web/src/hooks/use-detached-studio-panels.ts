import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { panelNames, panelPath, type StudioPanel } from '../lib/studio-layout';
import { endPanelSession, isPanelTab, registerPanelSession, type StudioPanelSession } from '../lib/studio-panel-session';
import type { StudioDeckControls } from './use-studio-deck-controls';

type DetachedTab = { id: string; tab: Window; session: StudioPanelSession };

export function useDetachedStudioPanels(controls: StudioDeckControls) {
  const [panels, setPanels] = useState<StudioPanel[]>([]);
  const tabs = useRef(new Map<StudioPanel, DetachedTab>());

  const redock = useCallback((panel: StudioPanel, close = false) => {
    const entry = tabs.current.get(panel);
    if (!entry) return;
    tabs.current.delete(panel);
    endPanelSession(entry.id);
    if (close && isPanelTab(entry.tab, entry.id)) entry.tab.close();
    setPanels([...tabs.current.keys()]);
  }, []);

  useLayoutEffect(() => {
    for (const { session } of tabs.current.values()) session.publish(controls);
  }, [controls]);

  useEffect(() => {
    const closeSessions = () => {
      for (const { id } of tabs.current.values()) endPanelSession(id);
      tabs.current.clear();
    };
    const checkTabs = () => {
      for (const [panel, { id, tab }] of tabs.current) {
        if (!isPanelTab(tab, id)) redock(panel);
      }
    };
    const leave = () => {
      closeSessions();
      setPanels([]);
    };
    window.addEventListener('pagehide', leave);
    window.addEventListener('focus', checkTabs);
    const interval = window.setInterval(checkTabs, 450);
    return () => {
      clearInterval(interval);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('focus', checkTabs);
      closeSessions();
    };
  }, [redock]);

  function focus(panel: StudioPanel) {
    const entry = tabs.current.get(panel);
    if (entry && isPanelTab(entry.tab, entry.id)) entry.tab.focus();
    else if (entry) redock(panel);
  }

  function detach(panel: StudioPanel) {
    const previous = tabs.current.get(panel);
    if (previous && isPanelTab(previous.tab, previous.id)) {
      previous.tab.focus();
      return;
    }
    if (previous) redock(panel);

    const id = crypto.randomUUID();
    const url = new URL(panelPath, location.origin);
    url.searchParams.set('panel', panel);
    url.searchParams.set('song', controls.studio.songId);
    url.hash = id;
    const session = registerPanelSession(id, panel, controls, () => {
      redock(panel, true);
      window.focus();
    });
    const tab = window.open(url, '_blank');
    if (!tab) {
      endPanelSession(id);
      controls.studio.setError('Your browser blocked the ' + panelNames[panel].toLowerCase() + ' tab. Allow pop-ups for Listening room and try again.');
      return;
    }
    tabs.current.set(panel, { id, tab, session });
    setPanels([...tabs.current.keys()]);
  }

  return { panels, detach, redock, focus };
}
