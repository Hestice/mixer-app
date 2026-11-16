export const ART_COLORS = ['#718064', '#d2ab86', '#788b9b', '#b97b75', '#aca1bc', '#d5c78c', '#343e38', '#efe9da'];
export type CoverStyle = 'orbit' | 'plain' | 'waves' | 'photo';
export interface RecordArt {
  sleeveColor: string;
  sleeveStyle: CoverStyle;
  sleevePhoto?: string;
  sleeveX: number;
  sleeveY: number;
  sleeveZoom: number;
  vinylColor: string;
  labelColor: string;
  labelPhoto?: string;
  labelX: number;
  labelY: number;
  labelZoom: number;
  typeface: 'sans' | 'serif' | 'mono';
}
export const defaultRecordArt: RecordArt = {
  sleeveColor: '#718064', sleeveStyle: 'orbit', sleeveX: 50, sleeveY: 50, sleeveZoom: 1,
  vinylColor: '#273028', labelColor: '#d9cba6', labelX: 50, labelY: 50, labelZoom: 1, typeface: 'sans',
};
export function validRecordArt(value: unknown): value is RecordArt {
  if (!value || typeof value !== 'object') return false;
  const art = value as RecordArt;
  const color = (value: unknown) => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value);
  const photo = (value: unknown) => value === undefined || typeof value === 'string' && value.length <= 220_000 && /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(value);
  return color(art.sleeveColor) && color(art.vinylColor) && color(art.labelColor)
    && ['orbit','plain','waves','photo'].includes(art.sleeveStyle) && ['sans','serif','mono'].includes(art.typeface)
    && photo(art.sleevePhoto) && photo(art.labelPhoto)
    && [art.sleeveX,art.sleeveY,art.labelX,art.labelY].every(value => Number.isFinite(value) && value >= 0 && value <= 100)
    && [art.sleeveZoom,art.labelZoom].every(value => Number.isFinite(value) && value >= 1 && value <= 3);
}
export function recordArt(value?: RecordArt): RecordArt { return validRecordArt(value) ? value : defaultRecordArt; }

/** Resize and re-encode locally: no remote image URL, original file or metadata is stored. */
export async function prepareArtwork(file: File): Promise<string> {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP photo.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 720 / Math.max(image.naturalWidth,image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height = Math.max(1,Math.round(image.naturalHeight*scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Photo editing is unavailable in this browser.');
    context.fillStyle = '#eee9de'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height);
    for (const quality of [.85,.7,.5,.3]) { const photo = canvas.toDataURL('image/jpeg',quality); if (photo.length <= 220_000) return photo; }
    throw new Error('This photo could not be prepared. Try a smaller image.');
  } finally { URL.revokeObjectURL(url); }
}

export function artInk(hex: string) {
  const [r,g,b] = [1,3,5].map(index=>parseInt(hex.slice(index,index+2),16));
  return r*.299+g*.587+b*.114 > 155 ? '#293129' : '#fff8e7';
}
