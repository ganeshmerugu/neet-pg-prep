export type SessionUser = {
  id: string;
};

const KEY = "puppy_web_app_session";

export function getSessionUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: unknown };
    if (typeof parsed.id !== "string" || parsed.id.length === 0) return null;
    return { id: parsed.id };
  } catch {
    return null;
  }
}

export function setSessionUser(user: SessionUser) {
  window.localStorage.setItem(KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("puppy_session_change"));
}

export function clearSessionUser() {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("puppy_session_change"));
}

export function ensureSessionUser(): SessionUser {
  const existing = getSessionUser();
  if (existing) return existing;
  const id = `local_${crypto.randomUUID()}`;
  const user = { id };
  setSessionUser(user);
  return user;
}
