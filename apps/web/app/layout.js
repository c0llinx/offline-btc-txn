import './globals.css';

export const metadata = {
  title: 'Offline Bitcoin Wallet v0.4',
  description: 'Mode-based wallet for Signet',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <div className="max-w-5xl mx-auto p-6">{children}</div>
      </body>
    </html>
  );
}
