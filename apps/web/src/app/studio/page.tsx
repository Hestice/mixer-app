'use client';

import { RecordingConsole } from '../../components/recording-console';
import { useStudio } from '../../hooks/use-studio';

export default function StudioPage() {
  const studio = useStudio(true);
  return <RecordingConsole studio={studio} />;
}
