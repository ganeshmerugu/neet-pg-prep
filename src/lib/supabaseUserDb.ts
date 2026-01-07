import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import type { Bookmark, SubjectStat } from "@/lib/types";

function requireSupabase() {
  const supabase = getSupabaseClient() as any;
  if (!supabase) {
    throw new Error(
      "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Netlify and redeploy.",
    );
  }
  return supabase;
}

function errorToMessage(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e && typeof (e as any).message === "string") {
    return String((e as any).message);
  }
  return fallback;
}

export async function fetchUserSubjectStats(userId: string): Promise<SubjectStat[]> {
  const supabase = requireSupabase();
  const { data, error } = await (supabase as any)
    .from("user_subject_stats")
    .select("subject, attempted, correct, wrong, marks")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    subject: unknown;
    attempted?: unknown;
    correct?: unknown;
    wrong?: unknown;
    marks?: unknown;
  }>;

  return rows.map((r) => ({
    subject: String(r.subject ?? ""),
    total: Number(r.attempted ?? 0),
    correct: Number(r.correct ?? 0),
    wrong: Number(r.wrong ?? 0),
    marks: Number(r.marks ?? 0),
  }));
}

export function subscribeUserSubjectStats(userId: string, onChange: () => void): RealtimeChannel {
  const supabase = requireSupabase();
  return (supabase as any)
    .channel(`user_subject_stats:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_subject_stats", filter: `user_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe();
}

export async function fetchUserBookmarks(userId: string): Promise<Bookmark[]> {
  const supabase = requireSupabase();

  const { data, error } = await (supabase as any)
    .from("user_bookmarks")
    .select("question_id, subject, created_at, questions(text,subject)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    question_id: unknown;
    subject?: unknown;
    created_at?: unknown;
    questions?: { text?: unknown; subject?: unknown } | null;
  }>;

  return rows.map((r) => ({
    id: String(r.question_id ?? ""),
    text: String(r.questions?.text ?? "-"),
    subject: String(r.subject ?? r.questions?.subject ?? ""),
    savedAt: r.created_at ? new Date(String(r.created_at)) : null,
  }));
}

export function subscribeUserBookmarks(userId: string, onChange: () => void): RealtimeChannel {
  const supabase = requireSupabase();
  return (supabase as any)
    .channel(`user_bookmarks:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_bookmarks", filter: `user_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe();
}

export async function saveBookmark(userId: string, questionId: string, subject: string) {
  const supabase = requireSupabase();
  const { error } = await (supabase as any).from("user_bookmarks").upsert(
    {
      user_id: userId,
      question_id: questionId,
      subject,
    },
    { onConflict: "user_id,question_id" },
  );
  if (error) throw new Error(error.message);
}

export async function removeBookmark(userId: string, questionId: string) {
  const supabase = requireSupabase();
  const { error } = await (supabase as any)
    .from("user_bookmarks")
    .delete()
    .eq("user_id", userId)
    .eq("question_id", questionId);
  if (error) throw new Error(error.message);
}

export async function isBookmarked(userId: string, questionId: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { data, error } = await (supabase as any)
    .from("user_bookmarks")
    .select("question_id")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function recordAttemptAndUpdateStats(opts: {
  userId: string;
  questionId: string;
  subject: string;
  selectedIndices: number[];
  isCorrect: boolean;
}) {
  const supabase = requireSupabase();
  const marksDelta = opts.isCorrect ? 4 : -1;

  const { data: existing, error: existingError } = await (supabase as any)
    .from("user_question_attempts")
    .select("question_id")
    .eq("user_id", opts.userId)
    .eq("question_id", opts.questionId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing) {
    const { error: updError } = await (supabase as any)
      .from("user_question_attempts")
      .update({
        selected_indices: opts.selectedIndices,
        is_correct: opts.isCorrect,
        marks_delta: marksDelta,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", opts.userId)
      .eq("question_id", opts.questionId);

    if (updError) throw new Error(updError.message);
    return;
  }

  const { error: insError } = await (supabase as any).from("user_question_attempts").insert({
    user_id: opts.userId,
    question_id: opts.questionId,
    subject: opts.subject,
    selected_indices: opts.selectedIndices,
    is_correct: opts.isCorrect,
    marks_delta: marksDelta,
    attempted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (insError) throw new Error(insError.message);

  const { data: statRow, error: statErr } = await (supabase as any)
    .from("user_subject_stats")
    .select("attempted, correct, wrong, marks")
    .eq("user_id", opts.userId)
    .eq("subject", opts.subject)
    .maybeSingle();

  if (statErr) throw new Error(statErr.message);

  const prevAttempted = Number((statRow as any)?.attempted ?? 0);
  const prevCorrect = Number((statRow as any)?.correct ?? 0);
  const prevWrong = Number((statRow as any)?.wrong ?? 0);
  const prevMarks = Number((statRow as any)?.marks ?? 0);

  const nextAttempted = prevAttempted + 1;
  const nextCorrect = prevCorrect + (opts.isCorrect ? 1 : 0);
  const nextWrong = prevWrong + (opts.isCorrect ? 0 : 1);
  const nextMarks = prevMarks + marksDelta;

  const { error: upsertErr } = await (supabase as any).from("user_subject_stats").upsert(
    {
      user_id: opts.userId,
      subject: opts.subject,
      attempted: nextAttempted,
      correct: nextCorrect,
      wrong: nextWrong,
      marks: nextMarks,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,subject" },
  );

  if (upsertErr) throw new Error(upsertErr.message);
}

export async function fetchQuizState(userId: string, subject: string): Promise<{
  currentQuestionId: string | null;
  timerRemainingSec: number;
  timerRunning: boolean;
} | null> {
  const supabase = requireSupabase();

  const { data, error } = await (supabase as any)
    .from("user_quiz_state")
    .select("subject,current_question_id,timer_remaining_sec,timer_running")
    .eq("user_id", userId)
    .eq("subject", subject)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    currentQuestionId: (data as any).current_question_id ? String((data as any).current_question_id) : null,
    timerRemainingSec: Number((data as any).timer_remaining_sec ?? 0),
    timerRunning: Boolean((data as any).timer_running ?? false),
  };
}

export async function upsertQuizState(opts: {
  userId: string;
  subject: string;
  currentQuestionId: string | null;
  timerRemainingSec: number;
  timerRunning: boolean;
}) {
  const supabase = requireSupabase();

  const { error } = await (supabase as any).from("user_quiz_state").upsert(
    {
      user_id: opts.userId,
      subject: opts.subject,
      current_question_id: opts.currentQuestionId,
      timer_remaining_sec: opts.timerRemainingSec,
      timer_running: opts.timerRunning,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,subject" },
  );

  if (error) throw new Error(errorToMessage(error, "Failed to save quiz state"));
}

export async function resetSubjectProgress(userId: string, subject: string) {
  const supabase = requireSupabase();

  const { error: attemptsErr } = await (supabase as any)
    .from("user_question_attempts")
    .delete()
    .eq("user_id", userId)
    .eq("subject", subject);
  if (attemptsErr) throw new Error(attemptsErr.message);

  const { error: statsErr } = await (supabase as any)
    .from("user_subject_stats")
    .delete()
    .eq("user_id", userId)
    .eq("subject", subject);
  if (statsErr) throw new Error(statsErr.message);

  const { error: stateErr } = await (supabase as any)
    .from("user_quiz_state")
    .delete()
    .eq("user_id", userId)
    .eq("subject", subject);
  if (stateErr) throw new Error(stateErr.message);
}

export async function fetchAttemptedQuestionIds(userId: string, questionIds: string[]): Promise<Set<string>> {
  if (questionIds.length === 0) return new Set();
  const supabase = requireSupabase();

  const { data, error } = await (supabase as any)
    .from("user_question_attempts")
    .select("question_id")
    .eq("user_id", userId)
    .in("question_id", questionIds);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ question_id?: unknown }>;
  const out = new Set<string>();
  for (const r of rows) {
    if (r.question_id != null) out.add(String(r.question_id));
  }
  return out;
}
