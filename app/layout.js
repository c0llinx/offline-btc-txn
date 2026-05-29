import './globals.css';
import AppShell from '@/components/AppShell.jsx';

export const metadata = {
  title: 'Offline BTC',
  description: 'Offline Bitcoin transfer wallet for web and mobile browsers',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
