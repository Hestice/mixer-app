import type { ComponentPropsWithoutRef } from 'react';
import { Download, LoaderCircle, Mic, Pause, Play, Volume2 } from 'lucide-react';
import type { Studio } from '../hooks/use-studio';
import type { Layer } from '../lib/session';
import { ClipEditor, TakePicker } from './clip-editor';
import { LibraryActions } from './library-actions';

export function LayerIconButton({ hint, label, ...button }: ComponentPropsWithoutRef<'button'> & { label: string; hint: string }) {
  return <button className="studio-layer-icon" type="button" aria-label={label} data-hint={hint} {...button} />;
}

export function LayerActions({ layer, studio, archived }: { layer: Layer; studio: Studio; archived?: boolean }) {
  return <LibraryActions kind="layer" title={layer.name} archived={archived}
    disabled={studio.locked || studio.busy || studio.retakeLayerId === layer.id}
    onAction={action => action.type === 'rename' ? studio.renameLayer(layer.id, action.title) : studio.manageLayer(layer.id, action.type)}
    onError={studio.setError} />;
}

export function LayerOptions({ id, layer, studio, span, onRetake, cueing, onToggleMix }: {
  id: string;
  layer: Layer;
  studio: Studio;
  span: number;
  onRetake: (id: string) => void;
  cueing: boolean;
  onToggleMix: () => void;
}) {
  const disabled = studio.locked || studio.busy;
  const playbackLabel = studio.playing ? 'Pause mix' : cueing ? 'Cueing mix…' : 'Play mix from cursor';
  const PlaybackIcon = studio.playing ? Pause : cueing ? LoaderCircle : Play;
  return <div className="studio-layer-options" id={id} role="region" aria-label={`${layer.name} options`}>
    <div className="studio-layer-settings">
      <TakePicker layer={layer} studio={studio} />
      <label className="studio-layer-volume" title="Layer volume">
        <Volume2 size={16} aria-hidden="true" />
        <input aria-label={`${layer.name} volume`} aria-valuetext={`${Math.round(layer.volume * 100)}%`}
          type="range" min="0" max="1" step=".01" disabled={studio.locked} value={layer.volume}
          onChange={event => studio.setLayerVolume(layer.id, Number(event.target.value))} />
      </label>
      <div className="studio-layer-tools">
        <LayerIconButton label={playbackLabel} hint={playbackLabel} disabled={disabled} onClick={onToggleMix}>
          <PlaybackIcon aria-hidden="true" />
        </LayerIconButton>
        {layer.recorded && <>
          <LayerIconButton label={`Record another take for ${layer.name}`} hint="Record another take"
            disabled={disabled || !!studio.candidate} onClick={() => onRetake(layer.id)}>
            <Mic aria-hidden="true" />
          </LayerIconButton>
          <LayerIconButton label={`Download ${layer.name} original audio`} hint="Download original audio" onClick={() => studio.download(layer)}>
            <Download aria-hidden="true" />
          </LayerIconButton>
        </>}
        <LayerActions layer={layer} studio={studio} />
      </div>
    </div>
    <ClipEditor layer={layer} studio={studio} span={span} />
  </div>;
}
