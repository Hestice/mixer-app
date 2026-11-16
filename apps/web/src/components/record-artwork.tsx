import type { CSSProperties, ReactNode } from 'react';
import { artInk, recordArt, type RecordArt } from '../lib/record-art';

export function ArtPhoto({ src, x, y, zoom }: {src:string; x:number; y:number; zoom:number}) {
  return <span className="art-photo" style={{ backgroundImage:`url("${src}")`, backgroundPosition:`${x}% ${y}%`, transform:`scale(${zoom})`, transformOrigin:`${x}% ${y}%` }} />;
}
export function RecordDisc({ artwork, children }: { artwork?:RecordArt; children?:ReactNode }) {
  const art=recordArt(artwork);
  return <span className="custom-vinyl" style={{'--vinyl-color':art.vinylColor,'--label-color':art.labelColor,'--label-ink':artInk(art.labelColor)} as CSSProperties}>
    <span className="vinyl-grooves" /><span className="vinyl-label">{art.labelPhoto && <ArtPhoto src={art.labelPhoto} x={art.labelX} y={art.labelY} zoom={art.labelZoom} />}<span className="vinyl-label-content">{children ?? <><small>SIDE A</small><span className="vinyl-mark">lr.</span><small>33⅓ RPM</small></>}</span></span><span className="vinyl-spindle" />
  </span>;
}
export function RecordSleeve({ artwork, title, className='' }: { artwork?:RecordArt; title:string; className?:string }) {
  const art=recordArt(artwork);
  return <span className={`record-sleeve sleeve-${art.sleeveStyle} type-${art.typeface} ${className}`} style={{'--sleeve-color':art.sleeveColor,'--sleeve-ink':art.sleeveStyle==='photo'?'#fff8e7':artInk(art.sleeveColor)} as CSSProperties}>
    {art.sleeveStyle==='photo' && art.sleevePhoto && <ArtPhoto src={art.sleevePhoto} x={art.sleeveX} y={art.sleeveY} zoom={art.sleeveZoom} />}
    <span className="sleeve-design" /><span className="sleeve-type"><small>LISTENING ROOM / ORIGINAL</small><strong>{title || 'Untitled song'}</strong><span>ONE PART AT A TIME</span></span><span className="sleeve-edge" />
  </span>;
}
