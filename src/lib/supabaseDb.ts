import { getSupabaseClient } from "@/lib/supabase";
import type { Question } from "@/lib/types";

type QuestionRow = {
  id: unknown;
  text?: unknown;
  options?: unknown;
  correct_indices?: unknown;
  type?: unknown;
  explanation?: unknown;
  subject?: unknown;
};

 const SUBJECT_DB_MAP: Record<string, string> = {
   Orthopedics: "Orthopaedics",
   Dermatology: "Skin",
 };

 function subjectToDbSubject(subject: string) {
   return SUBJECT_DB_MAP[subject] ?? subject;
 }

function normalizeQuestion(row: QuestionRow): Question {
  const correctIndices = Array.isArray(row.correct_indices)
    ? row.correct_indices.map((x: unknown) => Number(x))
    : [];

  const rawType = typeof row.type === "string" ? row.type : "single";
  const inferredType = correctIndices.length > 1 ? "multi" : rawType;

  return {
    id: String(row.id),
    text: String(row.text ?? ""),
    options: Array.isArray(row.options) ? row.options.map((x: unknown) => String(x)) : [],
    correctIndices,
    type: (inferredType === "multi" ? "multi" : "single") as "single" | "multi",
    explanation: row.explanation ? String(row.explanation) : "",
    subject: String(row.subject ?? ""),
  };
}

export async function fetchQuestionsPage(opts: {
  subject: string;
  pageSize?: number;
  offset?: number;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error(
      "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Netlify and redeploy.",
    );
  }

  const pageSize = opts.pageSize ?? 15;
  const offset = opts.offset ?? 0;
  const dbSubject = subjectToDbSubject(opts.subject);

  const limit = pageSize + 1;
  const { data, error } = await supabase
    .from("questions")
    .select("id,text,options,correct_indices,type,explanation,subject")
    .eq("subject", dbSubject)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    const msg =
      typeof (error as unknown as { message?: unknown }).message === "string"
        ? String((error as unknown as { message?: unknown }).message)
        : "Failed to load questions from Supabase.";
    throw new Error(msg);
  }

  const rows = (data ?? []) as QuestionRow[];
  const sliced = rows.slice(0, pageSize);
  const questions = sliced.map((row) => normalizeQuestion(row));
  const nextOffset = offset + questions.length;
  const hasMore = rows.length > pageSize;

  return { questions, nextOffset, hasMore };
}

export async function fetchSubjectQuestionCount(subject: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error(
      "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Netlify and redeploy.",
    );
  }

  const dbSubject = subjectToDbSubject(subject);

  const { count, error } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("subject", dbSubject);

  if (error) {
    const msg =
      typeof (error as unknown as { message?: unknown }).message === "string"
        ? String((error as unknown as { message?: unknown }).message)
        : "Failed to load question count from Supabase.";
    throw new Error(msg);
  }

  return Number(count ?? 0);
}
