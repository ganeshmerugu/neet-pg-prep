"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Bookmark } from "@/lib/types";
import { fetchUserBookmarks, subscribeUserBookmarks } from "@/lib/supabaseUserDb";

export default function BookmarksPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      try {
        const next = await fetchUserBookmarks(user.id);
        if (cancelled) return;
        setRows(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void refresh();
    const ch = subscribeUserBookmarks(user.id, () => void refresh());
    return () => {
      cancelled = true;
      void ch.unsubscribe();
    };
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bookmarks</h1>
        <p className="mt-1 text-sm text-[var(--muted-fg)]">Your saved questions.</p>
      </div>

      <div className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-6 shadow-[var(--shadow)]">
        {loading ? (
          <div className="text-sm text-[var(--muted-fg)]">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-[var(--muted-fg)]">No bookmarks saved yet.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((b) => (
              <Link
                key={b.id}
                href={`/quiz/${encodeURIComponent(b.subject ?? "General")}?qid=${encodeURIComponent(b.id)}`}
                className="block rounded-2xl border border-[color:var(--card-border)] bg-[var(--soft-bg)] p-4 transition hover:-translate-y-[1px] hover:bg-[var(--card-bg)] focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
              >
                <div className="text-sm font-semibold text-[var(--app-fg)]">{b.text ?? "-"}</div>
                <div className="mt-1 text-xs text-[var(--muted-fg)]">Subject: {b.subject ?? "General"}</div>
                <div className="mt-2 text-xs font-semibold text-[var(--accent)]">Open in quiz</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
