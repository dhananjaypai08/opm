import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OPM | On-chain Package Manager',
  description: 'Cryptographically signed, AI-audited, on-chain verified package security for the npm ecosystem.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'OPM | On-chain Package Manager',
    description: 'Cryptographically signed, AI-audited, on-chain verified package security.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-accent antialiased">
        <div className="noise-overlay" />
        {children}
      </body>
    </html>
  );
}
