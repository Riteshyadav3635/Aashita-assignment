import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { ThemeToggle } from '@/components/theme-toggle';
import { AppProviders } from './providers';
import { ServerWarmupBanner } from '@/components/server-warmup-banner';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Workspace',
  description: 'Real-time collaborative workspace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={geist.variable}>
      <body className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] antialiased">
        <div className="sr-only">Theme controls</div>
        <AppProviders>
          <ServerWarmupBanner />
          <div className="pointer-events-none fixed right-4 top-4 z-50">
            <ThemeToggle />
          </div>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
