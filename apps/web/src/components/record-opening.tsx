'use client';

import { useEffect, useRef } from 'react';
import type { RecordArt } from '../lib/record-art';
import { RecordDisc, RecordSleeve } from './record-artwork';

export function RecordOpening({title,artwork,onCancel}:{title:string;artwork?:RecordArt;onCancel:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close();},[]);
  return <dialog ref={dialog} className="record-opening" aria-label={`Opening ${title}`} onCancel={event=>{event.preventDefault();onCancel();}}><div className="opening-content"><div className="opening-record"><div className="opening-vinyl"><RecordDisc artwork={artwork} /></div><RecordSleeve artwork={artwork} title={title} /></div><p role="status">Opening <strong>{title}</strong></p><button className="text-button" autoFocus onClick={onCancel}>Cancel</button></div></dialog>;
}
