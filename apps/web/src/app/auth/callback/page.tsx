'use client';

import { useEffect, useState } from 'react';
import { useCloud } from '../../../components/cloud-provider';
import '../../studio.css';

export default function AuthCallback() {
  const cloud = useCloud();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (cloud.user) window.location.replace('/songs');
  }, [cloud.user]);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 20000);
    return () => clearTimeout(timer);
  }, []);
  const failed = !!cloud.error || timedOut;
  return <div className="studio-app"><main className="songs-page studio-loading"><span className="studio-eyebrow">LISTENING ROOM</span><h1>{failed ? 'Let’s try signing in again.' : 'Finishing sign-in…'}</h1><p role="status">{failed ? 'The link may have expired or opened in a different browser. Request a new email and open it in the browser where you started. Your local songs are still saved.' : 'Your songs stay on this device until you choose to back them up.'}</p><a className="button button-secondary" href="/songs">Back to My songs</a></main></div>;
}
