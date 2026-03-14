import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const _geist = Geist({ subsets: ['latin'] });
const _geistMono = Geist_Mono({ subsets: ['latin'] });

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
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
