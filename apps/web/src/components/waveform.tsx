import type { CSSProperties } from 'react';

export function Waveform({ active = false, peaks, progress = 0, compact = false }: { active?: boolean; peaks?: number[]; progress?: number; compact?: boolean }) {
  const count = compact ? 18 : 64;
  return <div className={`waveform ${active ? 'is-active' : ''}`} aria-hidden="true">
    {Array.from({ length: count }, (_, i) => {
      const height = peaks?.length ? 5 + (peaks[Math.floor(i / count * peaks.length)] ?? 0) * 90 : 5;
      return <i key={i} style={{ '--bar-height': `${height.toFixed(2)}%` } as CSSProperties} className={i / count < progress ? 'played' : ''} />;
    })}
    {!compact && <span className="wave-playhead" style={{ left: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />}
  </div>;
}
