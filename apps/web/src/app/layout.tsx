import type { Metadata } from 'next';
import './globals.css';
import { RecordTransitionProvider } from '../components/record-transition';
import { FileDropGuard } from '../components/file-drop-guard';
import { CloudProvider } from '../components/cloud-provider';

export const metadata: Metadata = {
  title: 'Listening room',
  description: 'Discover the parts of a song. Find your own sound. An interactive music sketchbook for everyday music makers.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const usageEnabled = process.env.NEXT_PUBLIC_USAGE_TRACKING === 'true'
    || (process.env.VERCEL_ENV === 'production' && process.env.NEXT_PUBLIC_USAGE_TRACKING !== 'false');
  return <html lang="en">
    <head>
      <link rel="stylesheet" crossOrigin="anonymous" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;450;500;550;600;650;700&family=Manrope:wght@400;500;600;650;700&display=swap" />
    </head>
    <body><FileDropGuard /><CloudProvider usageEnabled={usageEnabled}><RecordTransitionProvider>{children}</RecordTransitionProvider></CloudProvider></body>
  </html>;
}
