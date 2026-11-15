import type { SVGProps } from 'react';
type Props = SVGProps<SVGSVGElement> & { size?: number };
function symbol(path: string) {
  return function Symbol({ size = 20, strokeWidth = 1.5, ...props }: Props) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={path} /></svg>;
  };
}
export const Play = symbol('M7 4 21 12 7 20Z');
export const Pause = symbol('M6 4h4v16H6zM14 4h4v16h-4z');
export const Square = symbol('M5 5h14v14H5z');
export const Plus = symbol('M12 4v16M4 12h16');
export const X = symbol('m5 5 14 14M19 5 5 19');
export const Check = symbol('m4 12 5 6L21 6');
export const ArrowRight = symbol('M3 12h17m-7-7 7 7-7 7');
export const ArrowDown = symbol('M12 3v17m-7-7 7 7 7-7');
export const ChevronDown = symbol('m5 9 7 7 7-7');
export const Download = symbol('M12 2v13m-5-5 5 5 5-5M4 16v5h16v-5');
export const RotateCcw = symbol('M5 7a8 8 0 1 1-1 9M5 2v6h6');
export const LoaderCircle = symbol('M12 3a9 9 0 1 1-9 9');
export const Headphones = symbol('M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H3zM17 13h4v8h-4z');
export const Volume2 = symbol('M3 9h4l6-5v16l-6-5H3zM17 8a7 7 0 0 1 0 8M20 5a12 12 0 0 1 0 14');
export const Mic = symbol('M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8');
export const Guitar = symbol('m14 10 6-7 2 2-7 7M12 10c-4-3-6 1-5 3-6 0-6 8-1 9 4 1 7-2 6-5 4 1 6-4 3-5M7 17h.01');
export const Piano = symbol('M2 5h20v14H2zM7 5v14M12 5v14M17 5v14M5 5h3v8H5zM15 5h3v8h-3z');
export const Drum = symbol('M3 9q9-5 18 0v10q-9 5-18 0zM3 9q9 5 18 0M5 10l3 10 4-8 4 8 3-10M4 2l11 4M20 2 9 6');
