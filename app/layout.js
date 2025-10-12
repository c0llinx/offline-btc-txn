import './globals.css';
import Link from 'next/link';
import ActiveWalletBadge from '@/components/ActiveWalletBadge.jsx';

export const metadata = {
  title: 'Offline Bitcoin Wallet v0.4',
  description: 'Mode-based wallet for Bitcoin Testnet4',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Link href="/" className="text-lg font-semibold">
              Offline Bitcoin Wallet
            </Link>
            <div className="flex items-center gap-4 text-sm text-zinc-500">
              <Link href="/wallets" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                Wallets
              </Link>
              <Link href="/cold" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                Cold Mode
              </Link>
              <Link href="/receiver" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                Receiver
              </Link>
              <Link href="/refund" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                Refund
              </Link>
            </div>
          </header>
          <ActiveWalletBadge />
          {children}
        </div>
      </body>
    </html>
  );
}
