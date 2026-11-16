'use client';

import { useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Archive, ArchiveRestore, CloudUpload, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import type { LibraryAction } from '../lib/library-entry';
import { LibraryDialog } from './library-dialog';

export function LibraryActions({ kind, title, archived = false, disabled, onAction, onBackup, onError }: {
  kind: 'song' | 'layer';
  title: string;
  archived?: boolean;
  disabled?: boolean;
  onAction: (action: LibraryAction) => Promise<void> | void;
  onBackup?: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const handingOffFocus = useRef(false);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [pending, setPending] = useState(false);

  function openDialog(action: 'rename' | 'delete') {
    handingOffFocus.current = true;
    setDialog(action);
  }

  async function run(action: () => void | Promise<void>) {
    if (pending) return;
    setPending(true);
    try { await action(); }
    catch (reason) { onError(reason instanceof Error ? reason.message : 'Could not save the change. Try again.'); }
    finally { setPending(false); }
  }

  return <>
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button ref={trigger} className="library-menu-trigger" type="button" aria-label={`Manage ${title}`} title={`Manage ${title}`} disabled={disabled || pending}>
          <Ellipsis size={19} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="library-menu" align="end" sideOffset={5} collisionPadding={12} onCloseAutoFocus={event => {
          if (handingOffFocus.current) { event.preventDefault(); handingOffFocus.current = false; }
        }}>
          <DropdownMenu.Item className="library-menu-item" onSelect={() => openDialog('rename')}><Pencil aria-hidden="true" />Rename</DropdownMenu.Item>
          {onBackup && <DropdownMenu.Item className="library-menu-item" onSelect={() => void run(onBackup)}><CloudUpload aria-hidden="true" />Back up to cloud</DropdownMenu.Item>}
          {archived ? <>
            <DropdownMenu.Item className="library-menu-item" onSelect={() => void run(() => onAction({ type: 'restore' }))}><ArchiveRestore aria-hidden="true" />Restore</DropdownMenu.Item>
            <DropdownMenu.Separator className="library-menu-divider" />
            <DropdownMenu.Item className="library-menu-item" data-variant="destructive" onSelect={() => openDialog('delete')}><Trash2 aria-hidden="true" />Delete…</DropdownMenu.Item>
          </> : <DropdownMenu.Item className="library-menu-item" onSelect={() => void run(() => onAction({ type: 'archive' }))}><Archive aria-hidden="true" />Archive</DropdownMenu.Item>}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    {dialog && <LibraryDialog kind={kind} title={title} action={dialog} onAction={onAction} onClose={() => setDialog(null)} restoreFocus={() => trigger.current?.focus()} />}
  </>;
}
