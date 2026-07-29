"use client";

// Shared header + footer for every page that appears after login.
// Pulled into one file for the same reason lib/roleRouting.js exists —
// so the same chrome isn't hand-copied into 6 different page files.

import Link from "next/link";

export function PortalHeader({ email, navItems = [], activeHref, onLogout }) {
  return (
    <header className="border-b border-white/10 bg-stone-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Real brand mark from seiikiretreat.com (white variant, made
              for dark backgrounds) — replaces the placeholder "S" badge. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/seiiki-logo.png" alt="Seiiki" className="h-9 w-9 object-contain shrink-0" />
          <div>
            <p className="font-serif text-xl text-stone-100 tracking-wide leading-tight">
              Seiiki Ops Network
            </p>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">
              Operations Portal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          {navItems.length > 0 && (
            <nav className="hidden md:flex gap-6 text-sm font-medium text-stone-400">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    item.href === activeHref
                      ? "border-b-2 border-emerald-500 text-emerald-400 pb-1"
                      : "border-b-2 border-transparent hover:text-stone-200 transition-colors pb-1"
                  }
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="h-6 w-px bg-white/10 hidden md:block" />
          <div className="flex items-center gap-3 text-sm text-stone-400">
            <span className="hidden sm:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {email}
            </span>
            {onLogout && (
              <button
                onClick={onLogout}
                className="text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
              >
                Log out
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export function PortalFooter() {
  return (
    <footer className="border-t border-white/10 bg-stone-950 py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-2 text-center md:text-left">
        <p className="text-xs text-stone-600">
          Seiiki Ops Network — invite-only, Phase 2.
        </p>
        <p className="text-xs text-stone-600">
          Advisory, coordination, and curation — not legal or financial advice.
        </p>
      </div>
    </footer>
  );
}
