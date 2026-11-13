import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = { title: 'BAILEYOS · Show up. Get placed.', description: 'Privacy-first placement.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className="min-h-screen antialiased">{children}<Analytics /></body></html>);
}
