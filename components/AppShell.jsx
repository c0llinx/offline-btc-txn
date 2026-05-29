"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bitcoin,
  Info,
  Radio,
  ScanQrCode,
  Send,
  WalletCards,
} from "lucide-react";
import ActiveWalletBadge from "@/components/ActiveWalletBadge.jsx";

const primaryTabs = [
  {
    href: "/cold",
    label: "Send",
    title: "Send Payment",
    subtitle: "Create a claim bundle and lock sats for offline transfer.",
    icon: Send,
  },
  {
    href: "/receiver",
    label: "Receive",
    title: "Receive Payment",
    subtitle: "Scan or paste a claim bundle, then sweep funds to a wallet.",
    icon: ScanQrCode,
  },
  {
    href: "/wallets",
    label: "Wallets",
    title: "Wallets",
    subtitle: "Generate, import, refresh, and manage local Taproot wallets.",
    icon: WalletCards,
  },
  {
    href: "/refund",
    label: "Activity",
    title: "Activity",
    subtitle: "Track pending commitments and execute refunds after expiry.",
    icon: Activity,
  },
];

const secondaryTabs = [
  {
    href: "/watch",
    label: "Broadcast",
    title: "Broadcast TX",
    subtitle: "Publish raw transactions without exposing wallet keys.",
    icon: Radio,
  },
  {
    href: "/about",
    label: "About",
    title: "Protocol",
    subtitle: "Schemas and protocol references for offline transfers.",
    icon: Info,
  },
];

function getRouteMeta(pathname) {
  const all = [...primaryTabs, ...secondaryTabs];
  return (
    all.find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`)) ||
    primaryTabs[0]
  );
}

function isActive(pathname, href) {
  if (href === "/cold") {
    return pathname === "/" || pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ tab, pathname, compact = false }) {
  const Icon = tab.icon;
  const active = isActive(pathname, tab.href);

  return (
    <Link
      href={tab.href}
      className={[
        "group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-semibold transition",
        compact ? "min-w-0 flex-1 flex-col gap-1 px-2 py-2 text-[11px]" : "",
        active
          ? "border-[#F7931A] bg-[#F7931A]/15 text-[#F7931A]"
          : "border-transparent text-[#8B949E] hover:border-[#30363D] hover:bg-[#161B22] hover:text-[#F0F6FC]",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
    >
      <Icon className={compact ? "h-5 w-5" : "h-4 w-4"} strokeWidth={2.2} />
      <span className="truncate">{tab.label}</span>
    </Link>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname() || "/cold";
  const route = getRouteMeta(pathname);

  return (
    <div className="min-h-screen bg-[#0D1117] text-[#F0F6FC]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl">
        <aside className="hidden w-64 shrink-0 border-r border-[#30363D] bg-[#0D1117] px-4 py-5 md:sticky md:top-0 md:flex md:h-screen md:flex-col">
          <Link href="/cold" className="mb-6 flex items-center gap-3 px-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#F7931A] text-white shadow-lg shadow-[#F7931A]/10">
              <Bitcoin className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[#F0F6FC]">Offline BTC</span>
              <span className="block text-xs text-[#8B949E]">Testnet transfer wallet</span>
            </span>
          </Link>

          <nav className="space-y-1" aria-label="Primary">
            {primaryTabs.map((tab) => (
              <NavLink key={tab.href} tab={tab} pathname={pathname} />
            ))}
          </nav>

          <div className="mt-5 border-t border-[#30363D] pt-4">
            <nav className="space-y-1" aria-label="Utilities">
              {secondaryTabs.map((tab) => (
                <NavLink key={tab.href} tab={tab} pathname={pathname} />
              ))}
            </nav>
          </div>

          <div className="mt-auto rounded-xl border border-[#30363D] bg-[#161B22] p-3">
            <ActiveWalletBadge compact />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-[#30363D] bg-[#0D1117]/95 px-4 py-3 backdrop-blur md:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#F7931A] md:hidden">
                  <Bitcoin className="h-4 w-4" />
                  Offline BTC
                </div>
                <h1 className="text-[22px] font-bold leading-tight text-[#F0F6FC]">
                  {route.title}
                </h1>
                <p className="mt-0.5 max-w-2xl text-sm text-[#8B949E]">{route.subtitle}</p>
              </div>
              <div className="md:hidden">
                <ActiveWalletBadge compact />
              </div>
              <div className="hidden max-w-sm md:block">
                <ActiveWalletBadge compact />
              </div>
            </div>
          </header>

          <div className="app-content w-full max-w-5xl flex-1 px-4 py-5 pb-28 md:px-8 md:py-8 md:pb-10">
            {children}
          </div>
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#30363D] bg-[#161B22] px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-2xl md:hidden"
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-xl gap-1">
          {primaryTabs.map((tab) => (
            <NavLink key={tab.href} tab={tab} pathname={pathname} compact />
          ))}
        </div>
      </nav>
    </div>
  );
}
