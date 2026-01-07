"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { SubjectStat } from "@/lib/types";
import { SUBJECTS } from "@/lib/subjects";
import { fetchSubjectQuestionCount } from "@/lib/supabaseDb";
import { fetchUserSubjectStats, subscribeUserSubjectStats } from "@/lib/supabaseUserDb";

function color(score: number) {
  if (score < 0.4) return "bg-rose-100 text-rose-700";
  if (score < 0.7) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

export default function PrepDNAPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SubjectStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countError, setCountError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      try {
        const next = await fetchUserSubjectStats(user.id);
        if (cancelled) return;
        setRows(next);
      } finally {
        if (!cancelled) setLoading(false);
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

  const normalized = useMemo(() => {
    return rows
      .map((r) => {
        const correct = Number(r.correct ?? 0);
        const total = Number(r.total ?? 0);
        const score = total > 0 ? correct / total : 0;
        const wrong = typeof r.wrong === "number" ? r.wrong : Math.max(0, total - correct);
        const marks = typeof r.marks === "number" ? r.marks : correct * 4 - wrong;
        return { ...r, correct, total, wrong, marks, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [rows]);

  const overall = useMemo(() => {
    let attempted = 0;
    let marks = 0;
    let totalQuestions = 0;
    for (const s of SUBJECTS) {
      const t = typeof counts[s] === "number" ? counts[s] : 0;
      totalQuestions += t;
    }
    for (const r of normalized) {
      attempted += Number(r.total ?? 0);
      marks += Number(r.marks ?? 0);
    }
    const maxMarks = totalQuestions * 4;
    const pct = maxMarks > 0 ? Math.max(0, Math.min(100, (marks / maxMarks) * 100)) : 0;
    const prog = totalQuestions > 0 ? Math.max(0, Math.min(100, (attempted / totalQuestions) * 100)) : 0;
    return { attempted, marks, totalQuestions, pct, prog };
  }, [normalized, counts]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stat</h1>
        <p className="mt-1 text-sm text-[var(--muted-fg)]">
          Your accuracy by subject.
        </p>
      </div>

      {countError ? (
        <div className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4 text-sm text-[var(--muted-fg)] shadow-[var(--shadow)] sm:p-6">
          {countError}
        </div>
      ) : null}

      <div className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--shadow)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[var(--accent)]">OVERALL</div>
            <div className="mt-1 text-lg font-semibold text-[var(--app-fg)]">Progress</div>
            <div className="mt-1 text-sm text-[var(--muted-fg)]">
              Attempted {overall.attempted.toLocaleString()} / {overall.totalQuestions.toLocaleString()} questions
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--muted-fg)]">Marks</div>
            <div className="mt-1 text-lg font-semibold text-[var(--app-fg)]">{overall.marks.toLocaleString()}</div>
            <div className="mt-1 text-sm text-[var(--muted-fg)]">{overall.pct.toFixed(1)}%</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted-fg)]">
            <div>Completion</div>
            <div>{overall.prog.toFixed(1)}%</div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--soft-bg)]">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${overall.prog}%` }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-6 shadow-[var(--shadow)]">
            <div className="text-sm text-[var(--muted-fg)]">Loading...</div>
          </div>
        ) : normalized.length === 0 ? (
          <div className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-6 shadow-[var(--shadow)]">
            <div className="text-sm text-[var(--muted-fg)]">
              No stats yet. Answer some questions to build your PrepDNA.
            </div>
          </div>
        ) : (
          normalized.map((r) => (
            <div
              key={r.subject}
              className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-6 shadow-[var(--shadow)]"
            >
              <div className="text-xs font-semibold text-[var(--accent)]">SUBJECT</div>
              <div className="mt-1 text-base font-semibold text-[var(--app-fg)]">
                {r.subject}
              </div>

              <div className="mt-2 text-sm text-[var(--muted-fg)]">
                {typeof counts[r.subject] === "number"
                  ? `${counts[r.subject].toLocaleString()} questions` 
                  : "Loading questions..."}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--soft-bg)] p-3">
                  <div className="text-xs text-[var(--muted-fg)]">Attempted</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--app-fg)]">{r.total.toLocaleString()}</div>
                </div>
                <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--soft-bg)] p-3">
                  <div className="text-xs text-[var(--muted-fg)]">Marks</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--app-fg)]">{Number(r.marks ?? 0).toLocaleString()}</div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-[var(--muted-fg)]">Accuracy</div>
                <div
                  className={`rounded-xl px-3 py-1 text-xs font-semibold ${color(r.score)}`}
                >
                  {(r.score * 100).toFixed(1)}%
                </div>
              </div>

              {typeof counts[r.subject] === "number" ? (
                (() => {
                  const maxMarks = counts[r.subject] * 4;
                  const pct = maxMarks > 0 ? Math.max(0, Math.min(100, (Number(r.marks ?? 0) / maxMarks) * 100)) : 0;
                  const prog = counts[r.subject] > 0 ? Math.max(0, Math.min(100, (Number(r.total ?? 0) / counts[r.subject]) * 100)) : 0;
                  return (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-[var(--muted-fg)]">
                        <div>Completion</div>
                        <div>{prog.toFixed(1)}%</div>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--soft-bg)]">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${prog}%` }} />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted-fg)]">
                        <div>Marks %</div>
                        <div>{pct.toFixed(1)}%</div>
                      </div>
                    </div>
                  );
                })()
              ) : null}

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--soft-bg)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${Math.round(r.score * 100)}%` }}
                />
              </div>

              <div className="mt-3 text-xs text-[var(--muted-fg)]">
                {r.correct}/{r.total} correct
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
