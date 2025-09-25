import './globals.css';
import Link from 'next/link';
import Nav from './nav';

export const metadata = {
  title: 'Offline Bitcoin Wallet v0.4',
  description: 'Mode-based wallet for Signet',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <header className="sticky top-0 z-40 border-b bg-white/80 dark:bg-zinc-900/70 backdrop-blur">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold">Offline BTC</Link>
            <Nav />
          </div>
        </header>
        <div className="max-w-5xl mx-auto p-6">{children}</div>
      </body>
    </html>
  );
}
