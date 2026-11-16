'use client';

import { useEffect, useRef, useState } from 'react';
import { ART_COLORS, defaultRecordArt, prepareArtwork, recordArt, type RecordArt } from '../lib/record-art';
import { RecordDisc, RecordSleeve } from './record-artwork';

export function RecordCustomizer({ title, artwork, onDone, onClose }: {title:string; artwork?:RecordArt; onDone:(art:RecordArt)=>void; onClose:()=>void}) {
  const [draft,setDraft]=useState(()=>({...recordArt(artwork)}));
  const [side,setSide]=useState<'sleeve'|'vinyl'>('sleeve');
  const [error,setError]=useState(''); const [loading,setLoading]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null); const uploadRun=useRef(0);
  useEffect(()=>{ const element=dialog.current!; element.showModal(); const previous=document.body.style.overflow; document.body.style.overflow='hidden'; return()=>{uploadRun.current++; element.close(); document.body.style.overflow=previous;}; },[]);
  const patch=(value:Partial<RecordArt>)=>setDraft(current=>({...current,...value}));
  async function photo(file?:File) {
    if(!file)return;
    const run=++uploadRun.current; const target=side;
    setError('');setLoading(true);
    try {const image=await prepareArtwork(file);if(uploadRun.current===run)patch(target==='sleeve'?{sleevePhoto:image,sleeveStyle:'photo',sleeveX:50,sleeveY:50,sleeveZoom:1}:{labelPhoto:image,labelX:50,labelY:50,labelZoom:1});}
    catch(reason){if(uploadRun.current===run)setError(reason instanceof Error?reason.message:'Could not open that photo.');}
    finally{if(uploadRun.current===run)setLoading(false);}
  }
  const selectedPhoto=side==='sleeve'?draft.sleeveStyle==='photo'&&draft.sleevePhoto:draft.labelPhoto;
  function colors(label:string,field:'sleeveColor'|'vinylColor'|'labelColor',values=ART_COLORS) {
    return <fieldset className="art-colors"><legend>{label}</legend><div>{values.map(color=><button type="button" key={color} aria-label={`${label} ${color}`} aria-pressed={draft[field]===color} style={{background:color}} onClick={()=>patch({[field]:color})} />)}<label className="art-color-custom" title={`Choose ${label.toLowerCase()}`}>+<input type="color" aria-label={`Custom ${label.toLowerCase()}`} value={draft[field]} onChange={event=>patch({[field]:event.target.value})} /></label></div></fieldset>;
  }
  return <dialog ref={dialog} className="record-customizer" aria-labelledby="customize-record-title" onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===dialog.current){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)onClose();}}}>
    <div className="customizer-sheet">
      <header><button className="text-button" onClick={onClose}>Cancel</button><h2 id="customize-record-title">Your record</h2><button className="art-done" disabled={loading} onClick={()=>onDone(draft)}>Done</button></header>
      <div className="art-segments" aria-label="Customize part"><button aria-pressed={side==='sleeve'} onClick={()=>setSide('sleeve')}>Sleeve</button><button aria-pressed={side==='vinyl'} onClick={()=>setSide('vinyl')}>Vinyl</button></div>
      <div className={`art-preview preview-${side}`} aria-label={`${side==='sleeve'?'Sleeve':'Vinyl'} preview for ${title}`}>
        <div className="art-preview-sleeve"><RecordSleeve artwork={draft} title={title} /></div><div className="art-preview-disc"><RecordDisc artwork={draft} /></div>
      </div>
      <p className="art-preview-caption">{side==='sleeve'?'A cover for your next idea.':'Make the record yours, down to the label.'}</p>
      <div className="art-options">
        {side==='sleeve'?<>
          <div className="art-styles" aria-label="Sleeve design">{(['orbit','waves','plain'] as const).map(style=><button key={style} aria-pressed={draft.sleeveStyle===style} onClick={()=>patch({sleeveStyle:style})}><span className={`art-style-sample sample-${style}`} />{style==='orbit'?'Orbit':style==='waves'?'Soundwaves':'Minimal'}</button>)}{draft.sleevePhoto && <button aria-pressed={draft.sleeveStyle==='photo'} onClick={()=>patch({sleeveStyle:'photo'})}><span className="art-style-sample" style={{backgroundImage:`url("${draft.sleevePhoto}")`,backgroundSize:'cover'}} />Photo</button>}</div>
          {colors('Sleeve color','sleeveColor')}
          <fieldset className="art-fonts"><legend>Lettering</legend>{(['sans','serif','mono'] as const).map(font=><button className={`type-${font}`} key={font} aria-label={`${font} lettering`} aria-pressed={draft.typeface===font} onClick={()=>patch({typeface:font})}>Aa</button>)}</fieldset>
        </>:<>{colors('Vinyl color','vinylColor',['#273028','#784c45','#5b687d','#947d9e','#d0b787','#c5d0bd','#394e4b','#a17a67'])}{colors('Label color','labelColor')}{draft.sleevePhoto && <button className="art-photo-button" onClick={()=>patch({labelPhoto:draft.sleevePhoto,labelX:draft.sleeveX,labelY:draft.sleeveY,labelZoom:draft.sleeveZoom})}>Use sleeve photo on label</button>}</>}
        <div className="art-photo-actions"><label className="art-photo-button">{loading?'Preparing photo…':selectedPhoto?'Change photo':'Choose a photo'}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Choose ${side==='sleeve'?'sleeve':'label'} photo`} disabled={loading} onChange={event=>{void photo(event.target.files?.[0]);event.target.value='';}} /></label>{selectedPhoto && <button className="text-button" onClick={()=>patch(side==='sleeve'?{sleeveStyle:'orbit',sleevePhoto:undefined}:{labelPhoto:undefined})}>Remove photo</button>}</div>
        {selectedPhoto && <fieldset className="art-crop"><legend>Frame your photo</legend>{(['X','Y','Zoom'] as const).map((axis)=>{const field=`${side==='sleeve'?'sleeve':'label'}${axis}` as 'sleeveX'|'sleeveY'|'sleeveZoom'|'labelX'|'labelY'|'labelZoom';return <label key={axis}>{axis==='X'?'Left / right':axis==='Y'?'Up / down':'Zoom'}<input aria-label={`Photo ${axis==='X'?'horizontal position':axis==='Y'?'vertical position':'zoom'}`} type="range" min={axis==='Zoom'?1:0} max={axis==='Zoom'?3:100} step={axis==='Zoom'?.01:1} value={draft[field]} onChange={event=>patch({[field]:Number(event.target.value)})} /></label>;})}</fieldset>}
        {error && <p className="cloud-error" role="alert">{error}</p>}
        <button className="text-button art-reset" onClick={()=>{uploadRun.current++;setLoading(false);setError('');setDraft({...defaultRecordArt});}}>Reset appearance</button>
      </div>
      <footer>Your changes save when you tap Done.</footer>
    </div>
  </dialog>;
}
