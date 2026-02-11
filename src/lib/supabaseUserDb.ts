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

function subjectAliases(subject: string): string[] {
  if (subject === "Orthopaedics") return [subject, "Orthopedics"];
  if (subject === "Skin") return [subject, "Dermatology"];
  return [subject];
}

async function fetchQuestionIdsBySubjects(subjects: string[]): Promise<string[]> {
  const supabase = requireSupabase();
  const out: string[] = [];
  const pageSize = 1000;
  let from = 0;

  for (; ;) {
    const { data, error } = await (supabase as any)
      .from("questions")
      .select("id")
      .in("subject", subjects)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ id?: unknown }>;
    for (const r of rows) {
      if (r.id != null) out.push(String(r.id));
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return out;
}

export async function fetchSubjectQuestionMap(
  subject: string,
): Promise<Array<{ id: string; index: number }>> {
  const supabase = requireSupabase();
  const subjects = subjectAliases(subject);

  // We need all IDs ordered by created_at desc (same as quiz pages)
  // This allows us to map Index <-> ID
  const { data, error } = await (supabase as any)
    .from("questions")
    .select("id")
    .in("subject", subjects)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ id: unknown }>;
  return rows.map((r, i) => ({
    id: String(r.id),
    index: i,
  }));
}

export async function fetchAllSubjectAttempts(
  userId: string,
  subject: string,
): Promise<Record<string, { isCorrect: boolean }>> {
  const supabase = requireSupabase();
  const subjects = subjectAliases(subject);

  // We need to know which questions are attempted and their result
  const { data, error } = await (supabase as any)
    .from("user_question_attempts")
    .select("question_id, is_correct")
    .eq("user_id", userId)
    .in("subject", subjects);

  if (error) throw new Error(error.message);

  const out: Record<string, { isCorrect: boolean }> = {};
  const rows = (data ?? []) as Array<{ question_id?: unknown; is_correct?: unknown }>;

  for (const r of rows) {
    if (r.question_id) {
      out[String(r.question_id)] = { isCorrect: Boolean(r.is_correct) };
    }
  }
  return out;
}

export async function recomputeSubjectStatsFromAttempts(userId: string, subject: string): Promise<{
  attempted: number;
  correct: number;
  wrong: number;
  marks: number;
}> {
  const supabase = requireSupabase();

  const pageSize = 1000;
  let from = 0;

  let attempted = 0;
  let correct = 0;
  let wrong = 0;
  let marks = 0;

  // We compute from attempts table as the source of truth to avoid drift.
  // Pagination keeps this safe even if a subject has many attempts.
  for (; ;) {
    const { data, error } = await (supabase as any)
      .from("user_question_attempts")
      .select("is_correct, marks_delta")
      .eq("user_id", userId)
      .eq("subject", subject)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ is_correct?: unknown; marks_delta?: unknown }>;
    for (const r of rows) {
      attempted += 1;
      const ok = Boolean(r.is_correct);
      if (ok) correct += 1;
      else wrong += 1;
      marks += Number(r.marks_delta ?? 0);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const { error: upsertErr } = await (supabase as any).from("user_subject_stats").upsert(
    {
      user_id: userId,
      subject,
      attempted,
      correct,
      wrong,
      marks,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,subject" },
  );
  if (upsertErr) throw new Error(upsertErr.message);

  return { attempted, correct, wrong, marks };
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
    // This app treats attempts as immutable: once attempted, do not change stats/marks.
    // This also prevents double-clicks from re-writing attempts.
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

  await recomputeSubjectStatsFromAttempts(opts.userId, opts.subject);
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

  // Try to find existing state
  const { data: existing, error: fetchErr } = await (supabase as any)
    .from("user_quiz_state")
    .select("id")
    .eq("user_id", opts.userId)
    .eq("subject", opts.subject)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);

  if (existing) {
    // Update existing
    const { error: updateErr } = await (supabase as any)
      .from("user_quiz_state")
      .update({
        current_question_id: opts.currentQuestionId,
        timer_remaining_sec: opts.timerRemainingSec,
        timer_running: opts.timerRunning,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateErr) throw new Error(updateErr.message);
  } else {
    // Insert new
    const { error: insertErr } = await (supabase as any)
      .from("user_quiz_state")
      .insert({
        user_id: opts.userId,
        subject: opts.subject,
        current_question_id: opts.currentQuestionId,
        timer_remaining_sec: opts.timerRemainingSec,
        timer_running: opts.timerRunning,
        updated_at: new Date().toISOString(),
      });

    if (insertErr) throw new Error(insertErr.message);
  }
}

export async function resetSubjectProgress(userId: string, subject: string) {
  const supabase = requireSupabase();
  const subjects = subjectAliases(subject);

  // 1. Get all question IDs for this subject
  const questionIds = await fetchQuestionIdsBySubjects(subjects);

  if (questionIds.length > 0) {
    const chunkSize = 1000;
    for (let i = 0; i < questionIds.length; i += chunkSize) {
      const chunk = questionIds.slice(i, i + chunkSize);
      // Delete attempts for these questions
      const { error: attemptsByIdErr } = await (supabase as any)
        .from("user_question_attempts")
        .delete()
        .eq("user_id", userId)
        .in("question_id", chunk);
      if (attemptsByIdErr) throw new Error(attemptsByIdErr.message);

      // Also delete bookmarks? Usually reset clears everything.
      // Let's keep bookmarks for now unless requested.
      // The user said "All progress for this topic will be lost".
    }
  }

  // 2. Delete ALL attempts for subject (redundant safety catch)
  // This ensures even if question ID fetching missed something, we wipe by subject tag
  const { error: attemptsErr } = await (supabase as any)
    .from("user_question_attempts")
    .delete()
    .eq("user_id", userId)
    .in("subject", subjects);
  if (attemptsErr) throw new Error(attemptsErr.message);

  // 3. Delete stats
  const { error: statsErr } = await (supabase as any)
    .from("user_subject_stats")
    .delete()
    .eq("user_id", userId)
    .in("subject", subjects);
  if (statsErr) throw new Error(statsErr.message);

  // 4. Delete quiz state (timer, current question)
  const { error: stateErr } = await (supabase as any)
    .from("user_quiz_state")
    .delete()
    .eq("user_id", userId)
    .in("subject", subjects);
  if (stateErr) throw new Error(stateErr.message);
}

export async function fetchAttemptedQuestionIds(userId: string, questionIds: string[]): Promise<Set<string>> {
  if (questionIds.length === 0) return new Set();
  const supabase = requireSupabase();

  const chunkSize = 200;
  const out = new Set<string>();

  for (let i = 0; i < questionIds.length; i += chunkSize) {
    const chunk = questionIds.slice(i, i + chunkSize);
    const { data, error } = await (supabase as any)
      .from("user_question_attempts")
      .select("question_id")
      .eq("user_id", userId)
      .in("question_id", chunk);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ question_id?: unknown }>;
    for (const r of rows) {
      if (r.question_id != null) out.add(String(r.question_id));
    }
  }

  return out;
}

export async function fetchAttemptDetails(
  userId: string,
  questionIds: string[],
): Promise<Record<string, { selectedIndices: number[]; isCorrect: boolean }>> {
  if (questionIds.length === 0) return {};
  const supabase = requireSupabase();

  const chunkSize = 200;
  const out: Record<string, { selectedIndices: number[]; isCorrect: boolean }> = {};

  for (let i = 0; i < questionIds.length; i += chunkSize) {
    const chunk = questionIds.slice(i, i + chunkSize);
    const { data, error } = await (supabase as any)
      .from("user_question_attempts")
      .select("question_id, selected_indices, is_correct")
      .eq("user_id", userId)
      .in("question_id", chunk);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{
      question_id?: unknown;
      selected_indices?: unknown;
      is_correct?: unknown;
    }>;

    for (const r of rows) {
      if (r.question_id == null) continue;
      const id = String(r.question_id);
      const selected = Array.isArray(r.selected_indices)
        ? (r.selected_indices as number[]).map((v) => Number(v))
        : [];
      out[id] = { selectedIndices: selected, isCorrect: Boolean(r.is_correct) };
    }
  }

  return out;
}
