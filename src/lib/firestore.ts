export const FIRESTORE_REMOVED = true;

function removed(): never {
  throw new Error("Firestore has been removed from puppy_web_app. Use Supabase (src/lib/supabaseDb.ts) instead.");
}

export async function fetchQuestionsPage(): Promise<never> {
  return removed();
}

export async function saveBookmark(): Promise<never> {
  return removed();
}

export async function logAttempt(): Promise<never> {
  return removed();
}

export async function listBookmarks(): Promise<never> {
  return removed();
}

export async function listStats(): Promise<never> {
  return removed();
}
