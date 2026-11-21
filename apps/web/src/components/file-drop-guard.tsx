'use client';

import { useEffect } from 'react';
import { preventFileNavigation } from '../lib/file-drop';

/** Let upload targets handle the file, while preventing native file navigation anywhere. */
export function FileDropGuard() {
  useEffect(() => {
    window.addEventListener('dragover', preventFileNavigation, true);
    window.addEventListener('drop', preventFileNavigation, true);
    return () => {
      window.removeEventListener('dragover', preventFileNavigation, true);
      window.removeEventListener('drop', preventFileNavigation, true);
    };
  }, []);
  return null;
}
