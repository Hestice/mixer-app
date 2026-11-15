import { Download } from './icons';
import { Waveform } from './waveform';
import type { Studio } from '../hooks/use-studio';

export function LayerStrip({ studio, chapter, advanced, arrivingId }: { studio: Studio; chapter: number; advanced: boolean; arrivingId?: string }) {
  const visible = studio.layers;
  return <div className="layer-strip" aria-label="Layers in your song">
    {!visible.length && <p className="empty-layers">Your first recording will appear here when you keep it.</p>}
    {visible.map((layer) => {
      const audible = studio.soloId ? studio.soloId === layer.id : layer.enabled;
      return <div className={`layer ${audible ? 'enabled' : ''} layer-${layer.kind} ${arrivingId === layer.id ? 'layer-arriving' : ''}`} key={layer.id} data-layer-id={layer.id}>
        <button className="layer-toggle" aria-label={`${layer.name} layer`} aria-pressed={layer.enabled} disabled={studio.locked || studio.busy} onClick={() => void studio.toggleLayer(layer.id)}>
          <span className={`layer-color ${layer.kind}-color`} />
          <span className="layer-name">{layer.name}</span>
          <Waveform active={audible && studio.playing} compact peaks={layer.peaks} progress={studio.position / studio.duration} />
          <span className={`layer-switch ${layer.enabled ? 'on' : ''}`}><span />{layer.enabled ? 'On' : 'Off'}</span>
        </button>
        {layer.recorded && !advanced && <button className="text-button layer-download" onClick={() => studio.download(layer)}><Download size={14} />Download {layer.name}</button>}
        {advanced && <div className="layer-extras"><button className="text-button" aria-pressed={studio.soloId === layer.id} disabled={studio.locked} onClick={() => studio.setSoloId(studio.soloId === layer.id ? null : layer.id)}>Hear {layer.name} alone</button><label>Volume<input type="range" min="0" max="1" step=".05" value={layer.volume} aria-label={`${layer.name} volume`} disabled={studio.locked} onChange={(event) => studio.setLayerVolume(layer.id, Number(event.target.value))} /></label>{layer.recorded && <button className="text-button" onClick={() => studio.download(layer)}><Download size={14} />Download</button>}</div>}
      </div>;
    })}
  </div>;
}
