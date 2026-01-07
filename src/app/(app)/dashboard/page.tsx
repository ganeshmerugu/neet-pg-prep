"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SUBJECTS } from "@/lib/subjects";
import { fetchSubjectQuestionCount } from "@/lib/supabaseDb";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchUserSubjectStats, subscribeUserSubjectStats } from "@/lib/supabaseUserDb";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const subjects = q.length
    ? SUBJECTS.filter((s) => s.toLowerCase().includes(q))
    : SUBJECTS;

  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countError, setCountError] = useState<string | null>(null);
  const [statError, setStatError] = useState<string | null>(null);
  const [statsRows, setStatsRows] = useState<Array<{ subject: string; total: number; marks: number; correct: number }>>([]);

  const statsMap = useMemo(() => {
    if (!user) return {} as Record<string, { correct: number; total: number; marks: number }>;
    const out: Record<string, { correct: number; total: number; marks: number }> = {};
    for (const r of statsRows) {
      const correct = Number(r.correct ?? 0);
      const total = Number(r.total ?? 0);
      const marks = typeof r.marks === "number" ? r.marks : correct * 4 - Math.max(0, total - correct);
      out[r.subject] = { correct, total, marks };
    }
    return out;
  }, [user, statsRows]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        setStatError(null);
        const rows = await fetchUserSubjectStats(user.id);
        if (cancelled) return;
        setStatsRows(rows.map((r) => ({ subject: r.subject, total: r.total, marks: Number(r.marks ?? 0), correct: r.correct })));
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Unable to load stats";
        setStatError(msg);
      }
    };

    void refresh();
    const ch = subscribeUserSubjectStats(user.id, () => void refresh());
    return () => {
      cancelled = true;
      void ch.unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setCountError(null);
      try {
        const entries = await Promise.all(
          SUBJECTS.map(async (s) => {
            const c = await fetchSubjectQuestionCount(s);
            return [s, c] as const;
          }),
        );
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const [s, c] of entries) next[s] = c;
        setCounts(next);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Unable to load question counts";
        setCountError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted-fg)]">
            Pick a subject to start practicing MCQs.
          </p>
        </div>
      </div>

      {countError ? (
        <div className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4 text-sm text-[var(--muted-fg)] shadow-[var(--shadow)] sm:p-6">
          {countError}
        </div>
      ) : null}

      {statError ? (
        <div className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4 text-sm text-[var(--muted-fg)] shadow-[var(--shadow)] sm:p-6">
          {statError}
        </div>
      ) : null}

      {subjects.length === 0 ? (
        <div className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--shadow)] sm:p-6">
          <div className="text-base font-semibold text-[var(--app-fg)]">No subjects found</div>
          <div className="mt-1 text-sm text-[var(--muted-fg)]">Try a different search.</div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            (() => {
              const totalQuestions = counts[s];
              const stat = statsMap[s];
              const attempted = stat?.total ?? 0;
              const marks = stat?.marks ?? 0;
              const maxMarks = typeof totalQuestions === "number" ? totalQuestions * 4 : 0;
              const pct = maxMarks > 0 ? Math.max(0, Math.min(100, (marks / maxMarks) * 100)) : 0;

              return (
            <Link
              key={s}
              href={`/quiz/${encodeURIComponent(s)}`}
              className="group rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] sm:p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold text-[var(--accent)]">SUBJECT</div>
                  <div className="mt-1 text-base font-semibold text-[var(--app-fg)]">{s}</div>
                  <div className="mt-1 text-sm text-[var(--muted-fg)]">
                    {typeof totalQuestions === "number" ? `${totalQuestions.toLocaleString()} questions` : "Loading questions..."}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--soft-bg)] p-3">
                      <div className="text-xs text-[var(--muted-fg)]">Attempted</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--app-fg)]">
                        {attempted.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--soft-bg)] p-3">
                      <div className="text-xs text-[var(--muted-fg)]">Marks</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--app-fg)]">
                        {marks.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {typeof totalQuestions === "number" ? (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-[var(--muted-fg)]">
                        <div>Score</div>
                        <div>{pct.toFixed(1)}%</div>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--soft-bg)]">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="grid size-10 place-items-center rounded-2xl bg-[var(--soft-bg)] text-[var(--app-fg)] transition group-hover:bg-[var(--soft-bg)]">
                  →
                </div>
              </div>
            </Link>
              );
            })()
          ))}
        </div>
      )}
    </div>
  );
}
