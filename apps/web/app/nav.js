"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname() || "/";

  const links = [
    { href: "/cold", label: "Cold" },
    { href: "/watch", label: "Watch" },
    { href: "/receiver", label: "Receiver" },
    { href: "/signer", label: "Signer" },
    { type: "sep" },
    { href: "/tools/address", label: "Address" },
    { href: "/tools/keyfinder", label: "Key Finder" },
    { type: "sep" },
    { href: "/docs/buyer-merchant", label: "Docs" },
    { href: "/about", label: "About" },
  ];

  function isActive(href) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="flex flex-wrap items-center gap-3 text-sm">
      {links.map((l, i) => {
        if (l.type === "sep") {
          return (
            <span key={`sep-${i}`} className="mx-1 text-zinc-400">
              |
            </span>
          );
        }
        const active = isActive(l.href);
        const base = "px-1 rounded";
        const cls = active
          ? `${base} text-blue-600 font-medium underline`
          : `${base} hover:underline`;
        return (
          <Link key={l.href} href={l.href} className={cls}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
