'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LibraryAction } from '../lib/library-entry';

export function LibraryDialog({ kind, title, archived, onAction, onClose }: {
  kind: 'song' | 'layer';
  title: string;
  archived: boolean;
  onAction: (action: LibraryAction) => Promise<void> | void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState(title);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => { if (node?.open) node.close(); };
  }, []);
  useLayoutEffect(() => {
    if (confirm) cancelDelete.current?.focus();
  }, [confirm]);

  async function apply(action: LibraryAction) {
    if (pending) return;
    setPending(true);
    setError('');
    try { await onAction(action); onClose(); }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the change. Try again.');
      setPending(false);
    }
  }

  return <dialog ref={dialog} className="library-dialog" aria-labelledby="library-dialog-title" onCancel={event => {
    event.preventDefault();
    if (!pending) onClose();
  }}>
    <div className="library-dialog-body">
      <h2 id="library-dialog-title">{confirm ? `Delete ${kind}?` : `Manage ${kind}`}</h2>
      {confirm ? <>
        <p><strong>{title}</strong> will disappear from the archive. The app retains the recordings.</p>
        <div className="library-dialog-actions">
          <button ref={cancelDelete} className="button button-secondary" disabled={pending} onClick={() => setConfirm(false)}>Cancel</button>
          <button className="button library-delete" disabled={pending} onClick={() => void apply({ type: 'delete' })}>Delete {kind}</button>
        </div>
      </> : <>
        <form onSubmit={event => { event.preventDefault(); void apply({ type: 'rename', title: name }); }}>
          <label htmlFor="library-name">{kind === 'song' ? 'Song name' : 'Layer name'}</label>
          <div className="library-name-edit">
            <input id="library-name" autoFocus value={name} maxLength={70} required disabled={pending} onChange={event => setName(event.target.value)} />
            <button className="button button-primary" disabled={pending || !name.trim() || name.trim() === title}>Rename</button>
          </div>
        </form>
        <div className="library-dialog-actions">
          <button className="text-button" disabled={pending} onClick={onClose}>Cancel</button>
          {archived && <button className="text-button library-delete-link" disabled={pending} onClick={() => setConfirm(true)}>Delete…</button>}
          <button className="button button-secondary" disabled={pending} onClick={() => void apply({ type: archived ? 'restore' : 'archive' })}>{archived ? 'Restore' : 'Archive'}</button>
        </div>
      </>}
      {error && <p className="cloud-error" role="alert">{error}</p>}
    </div>
  </dialog>;
}
