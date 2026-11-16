export const recordsPerBasket = 6;
export type ArchiveOrder = 'title' | 'archived' | 'created';

interface ArchiveSortFields {
  title: string;
  archivedAt?: number | null;
  createdAt?: number;
}

const titleOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function archiveBaskets<Song extends ArchiveSortFields>(songs: Song[], order: ArchiveOrder) {
  const dateOf = (song: Song) => {
    const date = order === 'archived' ? song.archivedAt : song.createdAt;
    return typeof date === 'number' && Number.isFinite(new Date(date).getTime()) ? date : undefined;
  };
  const sorted = [...songs].sort((first, second) => {
    const title = titleOrder.compare(first.title, second.title);
    if (order === 'title') return title;
    const firstDate = dateOf(first) ?? -Infinity;
    const secondDate = dateOf(second) ?? -Infinity;
    return firstDate === secondDate ? title : secondDate - firstDate;
  });
  const groups = order === 'title' ? [sorted] : [
    sorted.filter(song => dateOf(song) !== undefined),
    sorted.filter(song => dateOf(song) === undefined),
  ];
  return groups.flatMap(group => Array.from({ length: Math.ceil(group.length / recordsPerBasket) }, (_, index) => {
    const records = group.slice(index * recordsPerBasket, (index + 1) * recordsPerBasket);
    const first = records[0];
    const last = records[records.length - 1];
    if (order === 'title') {
      const start = Array.from(first.title)[0]?.toLocaleUpperCase() ?? '–';
      const end = Array.from(last.title)[0]?.toLocaleUpperCase() ?? '–';
      return { records, label: start === end ? start : `${start}–${end}`, description: first.title === last.title ? first.title : `${first.title} to ${last.title}` };
    }
    const newest = dateOf(first);
    const oldest = dateOf(last);
    if (newest === undefined || oldest === undefined) {
      const label = order === 'created' ? 'Creation date unavailable' : 'Archive date unavailable';
      return { records, label, description: label };
    }
    const start = dateLabel.format(oldest);
    const end = dateLabel.format(newest);
    const label = start === end ? start : `${start} – ${end}`;
    return { records, label, description: label };
  }));
}
