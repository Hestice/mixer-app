import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Listening room',
  description: 'Discover the parts of a song. Find your own sound. An interactive music sketchbook for everyday music makers.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
