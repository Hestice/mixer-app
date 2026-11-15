import { TONEARM, stylusPosition } from '../lib/story-motion';

export function Tonearm({ playing, teach = false }: { playing: boolean; teach?: boolean }) {
  const tip = stylusPosition(playing ? TONEARM.playAngle : TONEARM.restAngle);
  return <svg className={`turntable-arm ${playing ? 'engaged' : 'resting'}`} viewBox="0 0 100 100" aria-hidden="true">
    <path className="arm-rest" d="M102 41v3h5v-3" fill="none" stroke="#a5b198" strokeWidth="1.2" />
    <circle cx="96" cy="4" r="3.8" fill="#c1cbb7" stroke="#edf1e7" strokeWidth="1.2" />
    <g className="arm-assembly" style={{ transform: `rotate(${playing ? TONEARM.playAngle : TONEARM.restAngle}deg)` }}>
      <path d="M96.8 4.8V59" stroke="#39472e" strokeOpacity=".22" strokeWidth="3.2" />
      <path d="M96 4V59" stroke="#879679" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M96 4V59" stroke="#edf1e5" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="93.3" y="56" width="5.4" height="8.3" rx=".6" fill="#dce5cf" stroke="#94a282" strokeWidth=".65" />
      <path d="M96 63v3" stroke="#6b795a" strokeWidth=".8" />
      <circle className="stylus-tip" cx="96" cy="66" r=".8" fill="#c7a261" />
    </g>
    <circle cx="96" cy="4" r="1.45" fill="#eff2e8" stroke="#aebaa1" strokeWidth=".45" />
    {teach && <g className="hardware-labels"><path d={`M96 -1V-7H84M${tip.x} ${tip.y + 2}L107 75`} fill="none" stroke="#879779" strokeWidth=".35" /><text x="82" y="-5.4" textAnchor="end">Tonearm</text><text x="109" y="80" textAnchor="end">Stylus</text></g>}
  </svg>;
}
