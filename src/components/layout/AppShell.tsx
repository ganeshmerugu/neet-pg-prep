"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";
import {
  Bookmark,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  { href: "/prepdna", label: "Stat", icon: ClipboardList },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout } = useAuth();

  const q = searchParams.get("q") ?? "";
  const [search, setSearch] = React.useState(q);

  React.useEffect(() => {
    setSearch(q);
  }, [q]);

  const [theme, setTheme] = React.useState<"system" | "light" | "dark">("system");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("puppy_web_app_theme");
    if (saved === "light" || saved === "dark" || saved === "system") {
      setTheme(saved);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("puppy_web_app_theme", theme);
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] px-3 sm:px-4 md:px-6">
        <aside className="hidden w-72 shrink-0 border-r border-black/5 bg-[var(--card-bg)]/80 p-5 backdrop-blur md:block">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-slate-900 text-white shadow-sm">
              PP
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Puppy Prep</div>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {nav.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-black/70 hover:bg-black/[0.04]",
                  )}
                >
                  <Icon className={cn("size-4", active ? "text-white" : "text-black/60")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto pt-6">
            <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-3">
              <div className="text-xs text-black/50">Signed in</div>
              <div className="mt-1 truncate text-sm font-medium">
                Chandana
              </div>
              <button
                type="button"
                onClick={logout}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-black/70 shadow-sm hover:bg-black/[0.03]"
              >
                <LogOut className="size-4" />
                Logout
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-black/5 bg-[var(--card-bg)]/70 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
              <div className="flex items-center gap-3 md:hidden">
                <div className="grid size-9 place-items-center rounded-xl bg-slate-900 text-white">
                  PP
                </div>
                <div className="text-sm font-semibold">Puppy Prep</div>
              </div>

              <div className="hidden flex-1 sm:block">
                <div className="relative max-w-xl">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/40" />
                  <input
                    placeholder="Search subjects, questions..."
                    className="h-10 w-full rounded-xl border border-black/10 bg-black/[0.02] pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-[var(--ring)]"
                    value={search}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSearch(next);
                      const trimmed = next.trim();
                      const url = trimmed.length ? `/dashboard?q=${encodeURIComponent(trimmed)}` : "/dashboard";
                      router.replace(url);
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-2 rounded-xl border border-black/10 bg-[var(--card-bg)] px-3 py-2 shadow-sm md:flex">
                  {theme === "light" ? (
                    <Sun className="size-4 text-black/60" />
                  ) : theme === "dark" ? (
                    <Moon className="size-4 text-black/60" />
                  ) : (
                    <Monitor className="size-4 text-black/60" />
                  )}
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as "system" | "light" | "dark")}
                    className="bg-transparent text-xs font-semibold text-black/60 outline-none"
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-black/5 bg-[var(--card-bg)]/90 backdrop-blur md:hidden">
        <div className="grid grid-cols-3">
          {nav.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-3 text-xs font-medium",
                  active ? "text-indigo-600" : "text-black/60",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="h-16 md:hidden" />
    </div>
  );
}
