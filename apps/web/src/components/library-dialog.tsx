'use client';

import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Pencil, Trash2 } from 'lucide-react';
import type { LibraryAction } from '../lib/library-entry';

export function LibraryDialog({ kind, title, action, onAction, onClose, restoreFocus }: {
  kind: 'song' | 'layer';
  title: string;
  action: 'rename' | 'delete';
  onAction: (action: LibraryAction) => Promise<void> | void;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const nameInput = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState(title);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const deleting = action === 'delete';
  const validName = !!name.trim() && name.trim() !== title;
  const Icon = deleting ? Trash2 : Pencil;

  async function apply() {
    if (pending || (!deleting && !validName)) return;
    setPending(true);
    setError('');
    try {
      await onAction(deleting ? { type: 'delete' } : { type: 'rename', title: name });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the change. Try again.');
      setPending(false);
    }
  }

  return <Dialog.Root open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="library-dialog-overlay" />
      <Dialog.Content className="library-dialog" {...(!deleting && { 'aria-describedby': undefined })}
        onOpenAutoFocus={event => {
          event.preventDefault();
          if (deleting) cancel.current?.focus();
          else { nameInput.current?.focus(); nameInput.current?.select(); }
        }}
        onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}>
        <form onSubmit={event => { event.preventDefault(); void apply(); }}>
          <div className="library-dialog-title">
            <span data-destructive={deleting || undefined}><Icon size={16} aria-hidden="true" /></span>
            <Dialog.Title>{deleting ? `Delete ${kind}?` : `Rename ${kind}`}</Dialog.Title>
          </div>
          {deleting
            ? <Dialog.Description><strong>{title}</strong> will be removed from the archive. Its recordings will stay stored.</Dialog.Description>
            : <label className="library-name-edit"><span>{kind === 'song' ? 'Song name' : 'Layer name'}</span><input ref={nameInput} value={name} maxLength={70} required disabled={pending} onChange={event => setName(event.target.value)} /></label>}
          {error && <p className="cloud-error" role="alert">{error}</p>}
          <div className="library-dialog-actions">
            <Dialog.Close asChild><button ref={cancel} className="library-dialog-button" type="button" disabled={pending}>Cancel</button></Dialog.Close>
            <button className="library-dialog-button" data-variant={deleting ? 'destructive' : 'primary'} disabled={pending || (!deleting && !validName)}>
              {pending ? 'Saving…' : deleting ? `Delete ${kind}` : 'Save name'}
            </button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
