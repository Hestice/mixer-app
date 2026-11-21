/** Safari may expose file items before populating DataTransfer.files. */
export function isFileDrop(data: Pick<DataTransfer, 'types' | 'items' | 'files'> | null) {
  return !!data && (Array.from(data.types).includes('Files')
    || Array.from(data.items).some(item => item.kind === 'file') || data.files.length > 0);
}

export function preventFileNavigation(event: Pick<DragEvent, 'dataTransfer' | 'preventDefault'>) {
  if (isFileDrop(event.dataTransfer)) event.preventDefault();
}
