import type { Bookmark, SubjectStat } from "@/lib/types";

function key(uid: string, name: string) {
  return `puppy_web_app_${uid}_${name}`;
}

function notifyLocalDbChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("puppy_web_app_local_db_change"));
}

export function listBookmarksLocal(uid: string): Bookmark[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key(uid, "bookmarks"));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Bookmark[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBookmarkLocal(uid: string, b: Bookmark) {
  const all = listBookmarksLocal(uid);
  const next = [b, ...all.filter((x) => x.id !== b.id)];
  window.localStorage.setItem(key(uid, "bookmarks"), JSON.stringify(next));
  notifyLocalDbChange();
}

export function listStatsLocal(uid: string): SubjectStat[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key(uid, "stats"));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SubjectStat[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function logAttemptLocal(uid: string, subject: string, isCorrect: boolean) {
  const all = listStatsLocal(uid);
  const existing = all.find((x) => x.subject === subject);

  const prevCorrect = Number(existing?.correct ?? 0);
  const prevTotal = Number(existing?.total ?? 0);
  const nextCorrect = prevCorrect + (isCorrect ? 1 : 0);
  const nextTotal = prevTotal + 1;
  const nextWrong = Math.max(0, nextTotal - nextCorrect);
  const nextMarks = nextCorrect * 4 - nextWrong * 1;

  const next: SubjectStat = {
    subject,
    correct: nextCorrect,
    total: nextTotal,
    wrong: nextWrong,
    marks: nextMarks,
  };
  const merged = [next, ...all.filter((x) => x.subject !== subject)];
  window.localStorage.setItem(key(uid, "stats"), JSON.stringify(merged));
  notifyLocalDbChange();
}
