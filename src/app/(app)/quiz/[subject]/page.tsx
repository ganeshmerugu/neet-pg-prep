"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { fetchQuestionsPage, fetchSubjectQuestionCount } from "@/lib/supabaseDb";
import type { Question } from "@/lib/types";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  fetchAttemptedQuestionIds,
  fetchQuizState,
  fetchUserSubjectStats,
  isBookmarked,
  recordAttemptAndUpdateStats,
  resetSubjectProgress,
  saveBookmark,
  subscribeUserSubjectStats,
  upsertQuizState,
} from "@/lib/supabaseUserDb";

function letter(i: number) {
  return String.fromCharCode(65 + i);
}

function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e && typeof (e as any).message === "string") {
    return (e as any).message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

export default function QuizPage() {
  const params = useParams<{ subject: string }>();
  const searchParams = useSearchParams();
  const subject = decodeURIComponent(params.subject);

  const dbSubject = useMemo(() => {
    if (subject === "Orthopedics") return "Orthopaedics";
    if (subject === "Dermatology") return "Skin";
    return subject;
  }, [subject]);

  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "error" | "info"; message: string } | null>(null);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [pendingNext, setPendingNext] = useState(false);
  const [initialStartDone, setInitialStartDone] = useState(false);

  const targetQid = searchParams.get("qid");
  const [jumpedToQid, setJumpedToQid] = useState<string | null>(null);
  const [resumeQid, setResumeQid] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [durationSec, setDurationSec] = useState(20 * 60);
  const [remainingSec, setRemainingSec] = useState(20 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [loggedIds, setLoggedIds] = useState<Record<string, true>>({});

  const [subjectTotal, setSubjectTotal] = useState<number | null>(null);
  const [subjectMarks, setSubjectMarks] = useState<{ attempted: number; marks: number }>({
    attempted: 0,
    marks: 0,
  });

  const [attemptedIds, setAttemptedIds] = useState<Record<string, true>>({});
  const [attemptedLoaded, setAttemptedLoaded] = useState(false);

  const q = questions[index];
  const isAttempted = Boolean(q?.id && attemptedIds[q.id]);

  const nextUnattemptedIndex = useCallback(
    (fromIndexExclusive: number) => {
      for (let i = fromIndexExclusive + 1; i < questions.length; i += 1) {
        if (!attemptedIds[questions[i].id]) return i;
      }
      return -1;
    },
    [questions, attemptedIds],
  );

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      setLoadError(null);
      const res = await fetchQuestionsPage({ subject, pageSize: 15, offset });
      setQuestions((prev) => [...prev, ...res.questions]);
      setOffset(res.nextOffset);
      setHasMore(res.hasMore);
    } catch (e: unknown) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [subject, offset]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    setJumpedToQid(null);
    setResumeQid(null);
    setHydrated(false);
    setAttemptedIds({});
    setAttemptedLoaded(false);
    setPendingNext(false);
    setInitialStartDone(false);
  }, [subject]);

  useEffect(() => {
    if (!pendingNext) return;
    const nextUnattempted = nextUnattemptedIndex(index);
    if (nextUnattempted >= 0) {
      setIndex(nextUnattempted);
      setSelected([]);
      setRevealed(false);
      setPendingNext(false);
      return;
    }

    if (hasMore && !loading) {
      void loadMore();
      return;
    }

    if (!hasMore && !loading) {
      setPendingNext(false);
      setToast({ type: "info", message: "No more unattempted questions" });
    }
  }, [pendingNext, index, nextUnattemptedIndex, hasMore, loading]);

  const desiredQid = useMemo(() => targetQid ?? resumeQid, [targetQid, resumeQid]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const ids = questions.map((qq) => qq.id);
        const set = await fetchAttemptedQuestionIds(user.id, ids);
        if (cancelled) return;
        const next: Record<string, true> = {};
        for (const id of set) next[id] = true;
        setAttemptedIds((prev) => ({ ...prev, ...next }));
        setAttemptedLoaded(true);
      } catch (e: unknown) {
        if (cancelled) return;
        setToast({ type: "error", message: errorMessage(e) });
        setAttemptedLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, questions]);

  useEffect(() => {
    if (!user) return;
    if (!hydrated) return;
    if (initialStartDone) return;
    if (desiredQid) return;
    if (questions.length === 0) return;
    if (!attemptedLoaded) return;
    const first = questions.findIndex((qq) => !attemptedIds[qq.id]);
    if (first >= 0 && first !== index) {
      setIndex(first);
      setSelected([]);
      setRevealed(false);
    }
    setInitialStartDone(true);
  }, [user, hydrated, initialStartDone, desiredQid, questions, attemptedIds, attemptedLoaded, index]);

  useEffect(() => {
    if (!desiredQid) return;
    if (jumpedToQid === desiredQid) return;

    const idx = questions.findIndex((qq) => qq.id === desiredQid);
    if (idx >= 0) {
      setIndex(idx);
      setSelected([]);
      setRevealed(false);
      setJumpedToQid(desiredQid);
      return;
    }

    if (hasMore && !loading) {
      void loadMore();
    }
  }, [desiredQid, jumpedToQid, questions, hasMore, loading, loadMore]);

  useEffect(() => {
    setQuestions([]);
    setOffset(0);
    setHasMore(true);
    setIndex(0);
    setSelected([]);
    setRevealed(false);

    void (async () => {
      setLoading(true);
      try {
        setLoadError(null);
        const res = await fetchQuestionsPage({ subject, pageSize: 15, offset: 0 });
        setQuestions(res.questions);
        setOffset(res.nextOffset);
        setHasMore(res.hasMore);
      } catch (e: unknown) {
        setLoadError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [subject]);

  const correctSet = useMemo(() => new Set(q?.correctIndices ?? []), [q]);

  async function toggleOption(i: number) {
    if (!q) return;
    if (revealed) return;
    if (busy) return;
    if (!attemptedLoaded) {
      setToast({ type: "info", message: "Loading progress..." });
      return;
    }
    if (attemptedIds[q.id]) {
      setToast({ type: "info", message: "Already attempted" });
      return;
    }
    if (!user) {
      setToast({ type: "error", message: "Please login again" });
      return;
    }
    if (loggedIds[q.id]) return;

    setBusy(true);

    setSelected([i]);
    setRevealed(true);

    const pickedCorrect = correctSet.has(i);
    try {
      await recordAttemptAndUpdateStats({
        userId: user.id,
        questionId: q.id,
        subject: q.subject,
        selectedIndices: [i],
        isCorrect: pickedCorrect,
      });
      setLoggedIds((prev) => ({ ...prev, [q.id]: true }));
      setAttemptedIds((prev) => ({ ...prev, [q.id]: true }));

      const rows = await fetchUserSubjectStats(user.id);
      const r = rows.find((x) => x.subject === dbSubject);
      const attempted = Number(r?.total ?? 0);
      const marks = Number(r?.marks ?? 0);
      setSubjectMarks({ attempted, marks });
    } catch (e: unknown) {
      setToast({ type: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const isCorrect = useMemo(() => {
    if (!q) return false;
    if (!revealed) return false;
    if (selected.length !== 1) return false;
    return correctSet.has(selected[0]);
  }, [q, revealed, selected, correctSet]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    setDurationSec(20 * 60);
    setRemainingSec(20 * 60);
    setTimerRunning(false);
    setLoggedIds({});
  }, [subject]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const rows = await fetchUserSubjectStats(user.id);
        if (cancelled) return;
        const r = rows.find((x) => x.subject === dbSubject);
        const attempted = Number(r?.total ?? 0);
        const marks = Number(r?.marks ?? 0);
        setSubjectMarks({ attempted, marks });
      } catch {
        if (cancelled) return;
        setSubjectMarks({ attempted: 0, marks: 0 });
      }
    };

    void refresh();
    const ch = subscribeUserSubjectStats(user.id, () => void refresh());
    return () => {
      cancelled = true;
      void ch.unsubscribe();
    };
  }, [user, dbSubject]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const st = await fetchQuizState(user.id, subject);
        if (cancelled) return;
        if (!st) {
          setHydrated(true);
          return;
        }

        if (st.timerRemainingSec > 0) {
          setDurationSec(Math.max(60, st.timerRemainingSec));
          setRemainingSec(st.timerRemainingSec);
        }
        setTimerRunning(Boolean(st.timerRunning));

        setResumeQid(st.currentQuestionId);
        setHydrated(true);

      } catch {
        if (cancelled) return;
        setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, subject]);

  useEffect(() => {
    if (!user) return;
    if (!q) return;
    if (!hydrated) return;
    if (desiredQid && jumpedToQid !== desiredQid) return;
    const t = window.setTimeout(() => {
      void upsertQuizState({
        userId: user.id,
        subject,
        currentQuestionId: q.id,
        timerRemainingSec: remainingSec,
        timerRunning,
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [user, subject, q?.id, remainingSec, timerRunning, hydrated, desiredQid, jumpedToQid]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const c = await fetchSubjectQuestionCount(subject);
        if (cancelled) return;
        setSubjectTotal(c);
      } catch {
        if (cancelled) return;
        setSubjectTotal(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject]);

  const timerText = useMemo(() => {
    const m = Math.floor(remainingSec / 60);
    const s = remainingSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [remainingSec]);

  const subjectScorePct = useMemo(() => {
    if (!subjectTotal || subjectTotal <= 0) return null;
    const maxMarks = subjectTotal * 4;
    const pct = maxMarks > 0 ? Math.max(0, Math.min(100, (subjectMarks.marks / maxMarks) * 100)) : 0;
    return pct;
  }, [subjectTotal, subjectMarks.marks]);

  const scorePctText = useMemo(() => {
    if (typeof subjectScorePct !== "number") return null;
    if (subjectScorePct === 0) return "0.000%";
    if (subjectScorePct < 0.01) return `${subjectScorePct.toFixed(4)}%`;
    if (subjectScorePct < 0.1) return `${subjectScorePct.toFixed(3)}%`;
    if (subjectScorePct < 1) return `${subjectScorePct.toFixed(2)}%`;
    return `${subjectScorePct.toFixed(1)}%`;
  }, [subjectScorePct]);

  async function onResetExam() {
    if (!user) return;
    const ok = window.confirm(
      "Are you sure you want to reset this exam? All progress for this topic will be lost and the exam will restart.",
    );
    if (!ok) return;

    try {
      await resetSubjectProgress(user.id, dbSubject);
      setIndex(0);
      setSelected([]);
      setRevealed(false);
      setLoggedIds({});
      setSubjectMarks({ attempted: 0, marks: 0 });
      setAttemptedIds({});

      setTimerRunning(false);
      setDurationSec(20 * 60);
      setRemainingSec(20 * 60);
    } catch (e: unknown) {
      setToast({ type: "error", message: errorMessage(e) });
    }
  }

  async function onNext() {
    if (!q) return;
    if (busy || loading) return;

    const nextUnattempted = nextUnattemptedIndex(index);
    if (nextUnattempted >= 0) {
      setIndex(nextUnattempted);
      setSelected([]);
      setRevealed(false);
      return;
    }

    if (hasMore) {
      setPendingNext(true);
      await loadMore();
      return;
    }

    setToast({ type: "info", message: "No more unattempted questions" });
  }

  async function onPrev() {
    if (index <= 0) return;
    setIndex((prev) => Math.max(0, prev - 1));
    setSelected([]);
    setRevealed(false);
  }

  async function onBookmark() {
    if (!q || !user) return;
    if (bookmarkBusy) return;
    setBookmarkBusy(true);
    try {
      const already = await isBookmarked(user.id, q.id);
      if (already) {
        setToast({ type: "info", message: "Already bookmarked" });
        return;
      }
      await saveBookmark(user.id, q.id, q.subject);
      setToast({ type: "info", message: "Bookmarked" });
    } catch (e: unknown) {
      setToast({ type: "error", message: errorMessage(e) });
    } finally {
      setBookmarkBusy(false);
    }
  }

  if (loadError && questions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--shadow)] sm:p-6">
          <div className="text-base font-semibold text-[var(--app-fg)]">Unable to load questions</div>
          <div className="mt-2 text-sm text-[var(--muted-fg)]">{loadError}</div>
          <div className="mt-4 text-xs text-[var(--muted-fg)]">
            Netlify: Site settings → Build & deploy → Environment → add required NEXT_PUBLIC_SUPABASE_* variables, then redeploy.
          </div>
        </div>
      </div>
    );
  }

  if (loading && questions.length === 0) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] px-6 py-5 text-sm text-[var(--muted-fg)] shadow-[var(--shadow)]">
          Loading questions...
        </div>
      </div>
    );
  }

  if (!q) {
    return (
      <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--shadow)] sm:p-6">
        <div className="text-base font-semibold">No questions found</div>
        <div className="mt-1 text-sm text-[var(--muted-fg)]">
          Check if the subject has data in Supabase.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {toast ? (
        <div
          className={
            toast.type === "error"
              ? "rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
              : "rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-200"
          }
        >
          <div className="font-semibold">{toast.type === "error" ? "Error" : "Done"}</div>
          <div className="mt-1 opacity-90">{toast.message}</div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-[var(--accent)]">QUIZ</div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--app-fg)]">
            {subject}
          </h1>
          <div className="mt-1 text-sm text-[var(--muted-fg)]">
            Question {index + 1} / {subjectTotal ? subjectTotal.toLocaleString() : Math.max(questions.length, index + 1)}
          </div>
          <div className="mt-1 text-sm text-[var(--muted-fg)]">
            Loaded {questions.length.toLocaleString()}
            {subjectTotal ? ` / ${subjectTotal.toLocaleString()}` : ""}
            {hasMore ? " (more available)" : ""}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--muted-fg)]">
            <div className="rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] px-3 py-1.5 shadow-sm">
              Attempted: <span className="font-semibold text-[var(--app-fg)]">{subjectMarks.attempted.toLocaleString()}</span>
            </div>
            <div className="rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] px-3 py-1.5 shadow-sm">
              Marks: <span className="font-semibold text-[var(--app-fg)]">{subjectMarks.marks.toLocaleString()}</span>
            </div>
            {isAttempted ? (
              <div className="rounded-xl border border-[color:var(--card-border)] bg-[var(--soft-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--muted-fg)] shadow-sm">
                Attempted
              </div>
            ) : null}
            {typeof subjectScorePct === "number" ? (
              <div className="rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] px-3 py-1.5 shadow-sm">
                Score: <span className="font-semibold text-[var(--app-fg)]">{scorePctText}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-sm font-semibold text-[var(--app-fg)] shadow-sm">
            {timerText}
          </div>
          <button
            type="button"
            onClick={() => setTimerRunning((v) => !v)}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] px-3 text-sm font-semibold text-[var(--app-fg)] shadow-sm transition active:scale-[0.98] hover:bg-[var(--soft-bg)] focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
          >
            {timerRunning ? "Pause" : "Start"}
          </button>
          <button
            type="button"
            onClick={() => {
              void onResetExam();
            }}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] px-3 text-sm font-semibold text-[var(--app-fg)] shadow-sm transition active:scale-[0.98] hover:bg-[var(--soft-bg)] focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
          >
            Reset Exam
          </button>
          <button
            type="button"
            onClick={onBookmark}
            disabled={bookmarkBusy}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] px-4 text-sm font-semibold text-[var(--app-fg)] shadow-sm transition active:scale-[0.98] hover:bg-[var(--soft-bg)] focus:outline-none focus:ring-4 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bookmarkBusy ? "Saving..." : "Bookmark"}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4 shadow-[var(--shadow)] sm:p-6">
        <div className="text-base font-semibold text-[var(--app-fg)]">{q.text}</div>

        <div className="mt-5 space-y-3">
          {q.options.map((opt, i) => {
            const picked = selected.includes(i);
            const isCorrectOption = correctSet.has(i);

            const bg = !revealed
              ? picked
                ? "bg-[var(--soft-bg)]"
                : "bg-[var(--card-bg)]"
              : isCorrectOption
                ? "bg-emerald-500/10"
                : picked
                  ? "bg-rose-500/10"
                  : "bg-[var(--card-bg)]";

            const border = !revealed
              ? picked
                ? "border-[var(--accent)]"
                : "border-[color:var(--card-border)]"
              : isCorrectOption
                ? "border-emerald-500/30"
                : picked
                  ? "border-rose-500/30"
                  : "border-[color:var(--card-border)]";

            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleOption(i)}
                disabled={busy || revealed || !attemptedLoaded || (q?.id ? Boolean(attemptedIds[q.id]) : false)}
                className={`flex w-full items-start gap-3 rounded-2xl border ${border} ${bg} px-4 py-3 text-left transition hover:-translate-y-[1px] hover:bg-[var(--soft-bg)] focus:outline-none focus:ring-4 focus:ring-[var(--ring)]`}
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-xs font-semibold text-white">
                  {letter(i)}
                </div>
                <div className="text-sm text-[var(--app-fg)]">{opt}</div>
              </button>
            );
          })}
        </div>

        {revealed ? (
          <div className="mt-6 rounded-2xl border border-[color:var(--card-border)] bg-[var(--soft-bg)] p-4">
            <div className="text-xs font-semibold text-[var(--muted-fg)]">Explanation</div>
            <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--app-fg)]">
              {q.explanation}
            </div>
            <div
              className={`mt-3 inline-flex rounded-xl px-3 py-1 text-xs font-semibold ${
                isCorrect ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"
              }`}
            >
              {isCorrect ? "Correct" : "Incorrect"}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onPrev}
            disabled={index <= 0}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] px-5 text-sm font-semibold text-[var(--app-fg)] shadow-sm hover:bg-[var(--soft-bg)] focus:outline-none focus:ring-4 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={busy || loading}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[color:var(--card-border)] bg-[var(--card-bg)] px-5 text-sm font-semibold text-[var(--app-fg)] shadow-sm hover:bg-[var(--soft-bg)] focus:outline-none focus:ring-4 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving..." : "Next Question"}
          </button>
        </div>

        {hasMore && index + 2 >= questions.length ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--card-border)] bg-[var(--soft-bg)] p-4 text-sm text-[var(--muted-fg)]">
            You’re reaching the end of the loaded set. More questions will load automatically as you continue.
          </div>
        ) : null}

      </div>
    </div>
  );
}
