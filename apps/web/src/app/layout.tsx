import type { Metadata } from 'next';
import './globals.css';
import { RecordTransitionProvider } from '../components/record-transition';
import { CloudProvider } from '../components/cloud-provider';

export const metadata: Metadata = {
  title: 'Listening room',
  description: 'Discover the parts of a song. Find your own sound. An interactive music sketchbook for everyday music makers.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><CloudProvider><RecordTransitionProvider>{children}</RecordTransitionProvider></CloudProvider></body></html>;
}
