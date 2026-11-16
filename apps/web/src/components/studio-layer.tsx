import { useId, useState, type ComponentPropsWithoutRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Download, LoaderCircle, Mic, Pause, Play, Scissors, Volume2 } from 'lucide-react';
import type { Studio } from '../hooks/use-studio';
import { layerColors, type Layer, type LayerColor } from '../lib/session';
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
  const [trimOpen, setTrimOpen] = useState(false);
  const trimId = useId();
  const color = layer.color ?? 'moss';
  const playbackLabel = studio.playing ? 'Pause mix' : cueing ? 'Cueing mix…' : 'Play mix from cursor';
  const PlaybackIcon = studio.playing ? Pause : cueing ? LoaderCircle : Play;
  return <div className="studio-layer-options" id={id} role="region" aria-label={`${layer.name} options`} data-layer-color={layer.color}>
    <div className="studio-layer-settings">
      <TakePicker layer={layer} studio={studio} />
      <div className="studio-layer-adjustments">
        <label className="studio-layer-volume" title="Layer volume">
          <Volume2 size={16} aria-hidden="true" />
          <input aria-label={`${layer.name} volume`} aria-valuetext={`${Math.round(layer.volume * 100)}%`}
            type="range" min="0" max="1" step=".01" disabled={studio.locked} value={layer.volume}
            onChange={event => studio.setLayerVolume(layer.id, Number(event.target.value))} />
        </label>
        <button className="studio-layer-trim" type="button" aria-expanded={trimOpen} aria-controls={trimId}
          onClick={() => setTrimOpen(open => !open)}>
          <Scissors size={14} aria-hidden="true" />Trim &amp; timing
          <ChevronDown className="clip-details-chevron" size={13} aria-hidden="true" />
        </button>
      </div>
      <div className="studio-layer-tools">
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <LayerIconButton label={`${layer.name} color`} hint="Layer color" disabled={disabled}>
              <span className="studio-layer-swatch" data-layer-color={color} aria-hidden="true" />
            </LayerIconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="library-menu" align="end" sideOffset={5} collisionPadding={12} aria-label="Layer color">
              <DropdownMenu.RadioGroup value={color} onValueChange={value => studio.setLayerColor(layer.id, value as LayerColor)}>
                {Object.entries(layerColors).map(([value, label]) =>
                  <DropdownMenu.RadioItem className="library-menu-item" key={value} value={value}>
                    <span className="studio-layer-swatch" data-layer-color={value} aria-hidden="true" />
                    {label}
                    <DropdownMenu.ItemIndicator className="studio-layer-color-check"><Check aria-hidden="true" /></DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                )}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
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
    <div className="clip-details" id={trimId} hidden={!trimOpen}>
      {trimOpen && <ClipEditor layer={layer} studio={studio} span={span} />}
    </div>
  </div>;
}
