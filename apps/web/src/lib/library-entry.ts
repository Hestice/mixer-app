export interface Lifecycle {
  archivedAt?: number | null;
  deletedAt?: number;
}

export type LifecycleAction = 'archive' | 'restore' | 'delete';
export type LibraryAction = { type: LifecycleAction } | { type: 'rename'; title: string };

export function lifecycle(entry: Lifecycle) {
  return entry.deletedAt != null ? 'deleted' : entry.archivedAt != null ? 'archived' : 'active';
}

export function lifecycleEdit(entry: Lifecycle, action: LifecycleAction, now = Date.now()): Lifecycle {
  const state = lifecycle(entry);
  if (state === 'active' && action === 'archive') return { archivedAt: now };
  if (state === 'archived' && action === 'restore') return { archivedAt: null };
  if (state === 'archived' && action === 'delete') return { deletedAt: now };
  throw new Error('This item changed. Reopen the list and try again.');
}

export function layerLifecycleEdit(entry: Lifecycle, action: LifecycleAction, now = Date.now()): Lifecycle {
  if (action === 'delete' && lifecycle(entry) === 'active') return { deletedAt: now };
  if (action === 'archive') throw new Error('Layers can be deleted from the song.');
  return lifecycleEdit(entry, action, now);
}

export type LibraryPatch = Lifecycle & { title?: string };

export function libraryEdit(entry: Lifecycle, action: LibraryAction): LibraryPatch {
  if (action.type !== 'rename') return lifecycleEdit(entry, action.type);
  if (lifecycle(entry) === 'deleted') throw new Error('This song has been deleted.');
  const title = action.title.trim();
  if (!title || title.length > 70) throw new Error('Enter a name between 1 and 70 characters.');
  return { title };
}
