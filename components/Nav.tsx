"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/raise", label: "Raise" },
  { href: "/deals", label: "Deals" },
  { href: "/watchlist", label: "Watchlist" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex flex-col leading-none">
          <span className="font-playfair text-xl font-semibold text-text-primary tracking-wide">
            Meridian
          </span>
          <span className="text-[10px] text-text-secondary tracking-widest uppercase mt-0.5">
            by Ali Chaudhry
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm tracking-wide transition-colors duration-200 ${
                pathname === link.href
                  ? "text-gold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Mobile menu */}
        <div className="flex md:hidden items-center gap-4">
          {links.slice(1).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-xs tracking-wide transition-colors duration-200 ${
                pathname === link.href
                  ? "text-gold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
