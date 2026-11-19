'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { setUsageSignedIn, startUsageTracking, trackUsage, type UsageSurface } from '../lib/usage-tracking';

export function UsageTracking({ enabled, signedIn }: { enabled: boolean; signedIn: boolean }) {
  const pathname = usePathname();
  const previousPath = useRef<string | null>(null);

  useEffect(() => startUsageTracking(enabled), [enabled]);
  useEffect(() => { setUsageSignedIn(signedIn); }, [signedIn]);
  useEffect(() => {
    const surface: UsageSurface | undefined = pathname === '/' ? 'landing' : pathname === '/studio' ? 'studio' : pathname === '/songs' ? 'songs' : undefined;
    if (!enabled || !surface) return;
    const page = () => trackUsage('page_viewed', { surface });
    if (previousPath.current !== pathname) { previousPath.current = pathname; page(); }
    const visible = () => { if (!document.hidden) page(); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [enabled, pathname]);

  return null;
}
